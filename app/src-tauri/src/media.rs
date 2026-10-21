// Photo import: scan a memory card, pair RAW + JPG by file name, copy to the NAS with
// SHA-256 verification, and write small JPEG thumbnails for the library grid.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

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
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
    file: String,
    bytes_done: u64,
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut reader = BufReader::with_capacity(1 << 20, File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Copy one file and confirm the copy hashes the same as the source.
/// If an identical file is already there, skip it (returns skipped = true).
fn copy_verified(src: &Path, dst: &Path) -> Result<(String, bool), String> {
    let src_hash = sha256_file(src).map_err(|e| format!("đọc thẻ lỗi: {e}"))?;
    if dst.exists() {
        let existing = sha256_file(dst).map_err(|e| format!("đọc NAS lỗi: {e}"))?;
        if existing == src_hash {
            return Ok((src_hash, true));
        }
        return Err("trùng tên nhưng khác nội dung, không ghi đè".into());
    }
    let tmp = dst.with_extension("part");
    fs::copy(src, &tmp).map_err(|e| format!("chép lỗi: {e}"))?;
    let dst_hash = sha256_file(&tmp).map_err(|e| format!("kiểm tra lỗi: {e}"))?;
    if dst_hash != src_hash {
        let _ = fs::remove_file(&tmp);
        return Err("checksum không khớp sau khi chép".into());
    }
    fs::rename(&tmp, dst).map_err(|e| format!("đổi tên lỗi: {e}"))?;
    Ok((src_hash, false))
}

fn make_thumb(jpg: &Path, out: &Path) -> Result<(), String> {
    let img = image::open(jpg).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(THUMB_SIZE, THUMB_SIZE);
    thumb.to_rgb8().save_with_format(out, image::ImageFormat::Jpeg).map_err(|e| e.to_string())
}

/// Copy the selected items into `dest/01_RAW` and `dest/02_JPG`, emitting `import-progress` events.
#[tauri::command]
pub async fn import_items(app: AppHandle, req: ImportRequest) -> Result<ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = PathBuf::from(&req.dest);
        let raw_dir = dest.join("01_RAW");
        let jpg_dir = dest.join("02_JPG");
        let thumb_dir = dest.join(".studio").join("thumbs");
        for d in [&raw_dir, &jpg_dir, &thumb_dir] {
            fs::create_dir_all(d).map_err(|e| format!("Không tạo được thư mục {}: {e}", d.display()))?;
        }

        let total = req.items.len();
        let mut imported = Vec::new();
        let mut failures = Vec::new();
        let (mut copied, mut skipped, mut bytes_done) = (0usize, 0usize, 0u64);

        for (i, item) in req.items.iter().enumerate() {
            let _ = app.emit("import-progress", Progress { done: i, total, file: item.new_base.clone(), bytes_done });
            let mut out = ImportedItem { base: item.new_base.clone(), raw_path: None, jpg_path: None, thumb_path: None, bytes: 0, checksum: String::new(), skipped: true };
            let mut ok = true;

            for (src, dir, slot) in [(&item.raw, &raw_dir, 0u8), (&item.jpg, &jpg_dir, 1u8)] {
                let Some(src) = src else { continue };
                let src = PathBuf::from(src);
                let dst = dir.join(format!("{}.{}", item.new_base, ext_of(&src)));
                match copy_verified(&src, &dst) {
                    Ok((hash, was_skipped)) => {
                        let size = fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);
                        out.bytes += size;
                        bytes_done += size;
                        if slot == 0 || out.checksum.is_empty() { out.checksum = hash; }
                        out.skipped &= was_skipped;
                        let p = Some(dst.to_string_lossy().to_string());
                        if slot == 0 { out.raw_path = p } else { out.jpg_path = p }
                    }
                    Err(e) => {
                        ok = false;
                        failures.push(ImportFailure { file: src.to_string_lossy().to_string(), error: e });
                    }
                }
            }

            if !ok {
                continue;
            }
            if req.make_thumbs {
                if let Some(jpg) = &out.jpg_path {
                    let t = thumb_dir.join(format!("{}.jpg", item.new_base));
                    if t.exists() || make_thumb(Path::new(jpg), &t).is_ok() {
                        out.thumb_path = Some(t.to_string_lossy().to_string());
                    }
                }
            }
            if out.skipped { skipped += 1 } else { copied += 1 }
            imported.push(out);
        }

        let _ = app.emit("import-progress", Progress { done: total, total, file: String::new(), bytes_done });
        let verified = failures.is_empty();
        Ok(ImportResult { imported, failures, copied, skipped, verified })
    })
    .await
    .map_err(|e| e.to_string())?
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
