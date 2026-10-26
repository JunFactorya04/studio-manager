// Photo import: scan a memory card, pair RAW + JPG by file name, copy to the NAS with
// SHA-256 verification, and write small JPEG thumbnails for the library grid.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use image::{DynamicImage, ImageDecoder, ImageReader};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::ops_core::copy_verified;

const RAW_EXT: &[&str] = &["cr2", "cr3", "nef", "nrw", "arw", "srf", "raf", "dng", "orf", "rw2", "pef", "srw", "3fr", "iiq"];
const JPG_EXT: &[&str] = &["jpg", "jpeg"];
const THUMB_SIZE: u32 = 480;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanItem {
    pub base: String,
    pub raw: Option<String>,
    pub jpg: Option<String>,
    pub bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub items: Vec<ScanItem>,
    pub pairs: usize,
    pub raw_only: usize,
    pub jpg_only: usize,
    pub bytes: u64,
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

/// Walk `dir` (e.g. the card's DCIM folder) and group files that share a folder + file stem.
#[tauri::command]
pub async fn scan_source(dir: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&dir);
        if !root.is_dir() {
            return Err(format!("Không tìm thấy thư mục: {dir}"));
        }
        let mut groups: BTreeMap<String, ScanItem> = BTreeMap::new();
        for entry in WalkDir::new(&root).into_iter().filter_map(Result::ok) {
            let path = entry.path();
            if !entry.file_type().is_file() {
                continue;
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || path.components().any(|c| c.as_os_str() == ".studio") {
                continue;
            }
            let ext = ext_of(path);
            let is_raw = RAW_EXT.contains(&ext.as_str());
            let is_jpg = JPG_EXT.contains(&ext.as_str());
            if !is_raw && !is_jpg {
                continue;
            }
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let parent = path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            let key = format!("{}|{}", parent, stem.to_ascii_lowercase());
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let item = groups.entry(key).or_insert_with(|| ScanItem { base: stem.clone(), raw: None, jpg: None, bytes: 0 });
            let p = path.to_string_lossy().to_string();
            if is_raw { item.raw = Some(p) } else { item.jpg = Some(p) }
            item.bytes += size;
        }
        let items: Vec<ScanItem> = groups.into_values().collect();
        let pairs = items.iter().filter(|i| i.raw.is_some() && i.jpg.is_some()).count();
        let raw_only = items.iter().filter(|i| i.raw.is_some() && i.jpg.is_none()).count();
        let jpg_only = items.iter().filter(|i| i.raw.is_none() && i.jpg.is_some()).count();
        let bytes = items.iter().map(|i| i.bytes).sum();
        Ok(ScanResult { items, pairs, raw_only, jpg_only, bytes })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    pub raw: Option<String>,
    pub jpg: Option<String>,
    pub new_base: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    pub items: Vec<ImportItem>,
    pub dest: String,
    pub make_thumbs: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportedItem {
    pub base: String,
    pub raw_path: Option<String>,
    pub jpg_path: Option<String>,
    pub thumb_path: Option<String>,
    pub bytes: u64,
    pub checksum: String,
    pub skipped: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub file: String,
    pub error: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: Vec<ImportedItem>,
    pub failures: Vec<ImportFailure>,
    pub copied: usize,
    pub skipped: usize,
    pub verified: bool,
    pub cancelled: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
    file: String,
    bytes_done: u64,
    bytes_total: u64,
}

static CANCEL: AtomicBool = AtomicBool::new(false);

/// Ask the running import to stop after the files being copied right now finish.
#[tauri::command]
pub fn cancel_import() {
    CANCEL.store(true, Ordering::SeqCst);
}

fn make_thumb(jpg: &Path, out: &Path) -> Result<(), String> {
    let tmp = out.with_extension("jpg.part");
    let mut decoder = ImageReader::open(jpg).map_err(|e| e.to_string())?.with_guessed_format().map_err(|e| e.to_string())?.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().ok();
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    if let Some(o) = orientation {
        img.apply_orientation(o); // portrait shots were showing sideways in the library
    }
    let thumb = img.thumbnail(THUMB_SIZE, THUMB_SIZE);
    thumb.to_rgb8().save_with_format(&tmp, image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
    fs::rename(&tmp, out).map_err(|e| e.to_string())
}

struct Outcome {
    item: Option<ImportedItem>,
    failures: Vec<ImportFailure>,
}

fn import_one(item: &ImportItem, raw_dir: &Path, jpg_dir: &Path, thumb_dir: &Path, make_thumbs: bool, bytes_done: &AtomicU64) -> Outcome {
    let mut out = ImportedItem { base: item.new_base.clone(), raw_path: None, jpg_path: None, thumb_path: None, bytes: 0, checksum: String::new(), skipped: true };
    let mut failures = Vec::new();
    for (src, dir, slot) in [(&item.raw, raw_dir, 0u8), (&item.jpg, jpg_dir, 1u8)] {
        let Some(src) = src else { continue };
        let src = PathBuf::from(src);
        let dst = dir.join(format!("{}.{}", item.new_base, ext_of(&src)));
        match copy_verified(&src, &dst) {
            Ok((hash, was_skipped)) => {
                let size = fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);
                out.bytes += size;
                bytes_done.fetch_add(size, Ordering::Relaxed);
                if slot == 0 || out.checksum.is_empty() { out.checksum = hash; }
                out.skipped &= was_skipped;
                let p = Some(dst.to_string_lossy().to_string());
                if slot == 0 { out.raw_path = p } else { out.jpg_path = p }
            }
            Err(e) => failures.push(ImportFailure { file: src.to_string_lossy().to_string(), error: e }),
        }
    }
    if !failures.is_empty() {
        return Outcome { item: None, failures };
    }
    if make_thumbs {
        if let Some(jpg) = &item.jpg {
            let t = thumb_dir.join(format!("{}.jpg", item.new_base));
            // Decode from the card copy that was just read (still in the system cache), not from the slower NAS.
            if t.exists() || make_thumb(Path::new(jpg), &t).is_ok() {
                out.thumb_path = Some(t.to_string_lossy().to_string());
            }
        }
    }
    Outcome { item: Some(out), failures }
}

/// Copy the selected items into `dest/01_RAW` and `dest/02_JPG`, several files at once,
/// emitting `import-progress` events (at most ten a second).
#[tauri::command]
pub async fn import_items(app: AppHandle, req: ImportRequest) -> Result<ImportResult, String> {
    CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let dest = PathBuf::from(&req.dest);
        let raw_dir = dest.join("01_RAW");
        let jpg_dir = dest.join("02_JPG");
        let thumb_dir = dest.join(".studio").join("thumbs");
        for d in [&raw_dir, &jpg_dir, &thumb_dir] {
            fs::create_dir_all(d).map_err(|e| format!("Không tạo được thư mục {}: {e}", d.display()))?;
        }

        let total = req.items.len();
        let bytes_total: u64 = req.items.iter().flat_map(|i| [&i.raw, &i.jpg]).flatten().filter_map(|p| fs::metadata(p).ok()).map(|m| m.len()).sum();
        let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(2, 4).min(total.max(1));
        let next = AtomicUsize::new(0);
        let done = AtomicUsize::new(0);
        let bytes_done = AtomicU64::new(0);
        let last_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
        let results: Mutex<Vec<Option<Outcome>>> = Mutex::new((0..total).map(|_| None).collect());

        let emit = |file: &str, force: bool| {
            let mut last = last_emit.lock().unwrap();
            if force || last.elapsed() >= Duration::from_millis(100) {
                *last = Instant::now();
                let _ = app.emit("import-progress", Progress { done: done.load(Ordering::Relaxed), total, file: file.to_string(), bytes_done: bytes_done.load(Ordering::Relaxed), bytes_total });
            }
        };

        std::thread::scope(|s| {
            for _ in 0..workers {
                s.spawn(|| loop {
                    if CANCEL.load(Ordering::SeqCst) { break; }
                    let i = next.fetch_add(1, Ordering::SeqCst);
                    if i >= total { break; }
                    let item = &req.items[i];
                    emit(&item.new_base, false);
                    let o = import_one(item, &raw_dir, &jpg_dir, &thumb_dir, req.make_thumbs, &bytes_done);
                    results.lock().unwrap()[i] = Some(o);
                    done.fetch_add(1, Ordering::SeqCst);
                    emit(&item.new_base, false);
                });
            }
        });

        let cancelled = CANCEL.load(Ordering::SeqCst);
        let (mut imported, mut failures, mut copied, mut skipped) = (Vec::new(), Vec::new(), 0usize, 0usize);
        for o in results.into_inner().unwrap().into_iter().flatten() {
            failures.extend(o.failures);
            if let Some(it) = o.item {
                if it.skipped { skipped += 1 } else { copied += 1 }
                imported.push(it);
            }
        }
        emit("", true);
        let verified = failures.is_empty() && !cancelled;
        Ok(ImportResult { imported, failures, copied, skipped, verified, cancelled })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Memory cards and external drives that hold a DCIM folder, so the app can offer them in one click.
#[tauri::command]
pub async fn find_cards() -> Result<Vec<CardInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut roots: Vec<PathBuf> = Vec::new();
        if cfg!(target_os = "windows") {
            for l in b'D'..=b'Z' { roots.push(PathBuf::from(format!("{}:\\", l as char))); }
        } else if let Ok(rd) = fs::read_dir("/Volumes") {
            roots.extend(rd.filter_map(Result::ok).map(|e| e.path()));
        } else if let Ok(rd) = fs::read_dir("/media") {
            roots.extend(rd.filter_map(Result::ok).flat_map(|e| fs::read_dir(e.path()).into_iter().flatten().filter_map(Result::ok).map(|x| x.path())));
        }
        let mut out = Vec::new();
        for r in roots {
            let dcim = r.join("DCIM");
            if dcim.is_dir() {
                let name = r.file_name().and_then(|n| n.to_str()).map(String::from).unwrap_or_else(|| r.to_string_lossy().to_string());
                out.push(CardInfo { name, path: dcim.to_string_lossy().to_string() });
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardInfo {
    pub name: String,
    pub path: String,
}

/// Free and total bytes of the drive that holds `path` are not portable without extra crates,
/// so the library shows how much the studio's own files take instead.
#[tauri::command]
pub async fn folder_size(path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(WalkDir::new(path).into_iter().filter_map(Result::ok).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_pairs_and_verified_copy() {
        let root = std::env::temp_dir().join(format!("sm-test-{}", std::process::id()));
        let card = root.join("DCIM").join("100CANON");
        fs::create_dir_all(&card).unwrap();
        fs::write(card.join("IMG_0001.CR3"), b"raw-1").unwrap();
        fs::write(card.join("IMG_0001.JPG"), b"jpg-1").unwrap();
        fs::write(card.join("IMG_0002.CR3"), b"raw-2").unwrap();
        fs::write(card.join("IMG_0003.jpg"), b"jpg-3").unwrap();
        fs::write(card.join("notes.txt"), b"skip").unwrap();

        let r = tauri::async_runtime::block_on(scan_source(root.to_string_lossy().to_string())).unwrap();
        assert_eq!(r.items.len(), 3);
        assert_eq!((r.pairs, r.raw_only, r.jpg_only), (1, 1, 1));

        let dst = root.join("out.CR3");
        let (h1, skipped) = copy_verified(&card.join("IMG_0001.CR3"), &dst).unwrap();
        assert!(!skipped);
        assert_eq!(fs::read(&dst).unwrap(), b"raw-1");
        let (h2, skipped) = copy_verified(&card.join("IMG_0001.CR3"), &dst).unwrap();
        assert!(skipped && h1 == h2, "identical file is skipped");
        assert!(copy_verified(&card.join("IMG_0002.CR3"), &dst).is_err(), "different content is never overwritten");
        fs::remove_dir_all(&root).unwrap();
    }
}

#[cfg(test)]
mod import_tests {
    use super::*;

    // Many files copied in one pass each, verified, and a re-run skips them.
    #[test]
    fn single_pass_copy_many_files_fast_and_idempotent() {
        let root = std::env::temp_dir().join(format!("sm-perf-{}", std::process::id()));
        let src = root.join("src");
        fs::create_dir_all(&src).unwrap();
        let blob = vec![7u8; 8 << 20];
        for i in 0..24 {
            let mut b = blob.clone();
            b[0] = i as u8;
            fs::write(src.join(format!("F{i}.CR3")), &b).unwrap();
        }
        let t = Instant::now();
        let dst = root.join("dst");
        for i in 0..24 {
            let (_, skipped) = copy_verified(&src.join(format!("F{i}.CR3")), &dst.join(format!("F{i}.CR3"))).unwrap();
            assert!(!skipped);
        }
        let first = t.elapsed();
        let t = Instant::now();
        for i in 0..24 {
            assert!(copy_verified(&src.join(format!("F{i}.CR3")), &dst.join(format!("F{i}.CR3"))).unwrap().1);
        }
        println!("copy 24x8MB: {:?}, re-run (skip): {:?}", first, t.elapsed());
        assert!(!dst.join("F0.CR3.part").exists());
        fs::remove_dir_all(&root).unwrap();
    }
}
