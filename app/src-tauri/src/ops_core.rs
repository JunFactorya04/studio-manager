// Operations core: scan capture folders, resize photos, and deliver files with a checksum.
// Pure Rust with no Tauri types, so it can be unit-tested on its own (see the tests at the bottom).

use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ImageDecoder, ImageReader};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read};
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

pub const RAW_EXT: &[&str] = &["cr2", "cr3", "nef", "nrw", "arw", "srf", "raf", "dng", "orf", "rw2", "pef", "srw", "3fr", "iiq"];
const PHOTO_EXT: &[&str] = &["jpg", "jpeg", "png", "tif", "tiff", "heic", "heif", "webp"];

pub fn ext_of(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
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
/// With `overwrite` false, an identical file already there is skipped and a different one is refused.
/// With `overwrite` true, a different file is replaced (used when a photo is re-exported).
pub fn copy_verified_opts(src: &Path, dst: &Path, overwrite: bool) -> Result<(String, bool), String> {
    let src_hash = sha256_file(src).map_err(|e| format!("đọc thẻ lỗi: {e}"))?;
    if dst.exists() {
        let existing = sha256_file(dst).map_err(|e| format!("đọc NAS lỗi: {e}"))?;
        if existing == src_hash {
            return Ok((src_hash, true));
        }
        if !overwrite {
            return Err("trùng tên nhưng khác nội dung, không ghi đè".into());
        }
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("tạo thư mục lỗi: {e}"))?;
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

pub fn copy_verified(src: &Path, dst: &Path) -> Result<(String, bool), String> {
    copy_verified_opts(src, dst, false)
}

// ---------- scanning capture folders ----------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
    pub raw: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirScan {
    pub dir: String,
    pub ok: bool,
    pub error: Option<String>,
    pub files: Vec<CaptureFile>,
}

/// A camera that is still writing over FTP leaves temporary names; those must not be picked up.
fn is_temp_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.starts_with('.') || n.starts_with("~") || n.ends_with(".part") || n.ends_with(".tmp") || n.ends_with(".temp") || n.ends_with(".filepart") || n.ends_with(".crdownload") || n.ends_with('~')
}

pub fn scan_capture_dirs(dirs: &[String]) -> Vec<DirScan> {
    dirs.iter()
        .map(|d| {
            let root = PathBuf::from(d);
            if d.trim().is_empty() || !root.is_dir() {
                return DirScan { dir: d.clone(), ok: false, error: Some("thư mục không tồn tại hoặc không đọc được".into()), files: vec![] };
            }
            let mut files = vec![];
            for e in WalkDir::new(&root).max_depth(3).into_iter().filter_map(Result::ok) {
                if !e.file_type().is_file() {
                    continue;
                }
                let name = e.file_name().to_string_lossy().to_string();
                if is_temp_name(&name) {
                    continue;
                }
                let ext = ext_of(e.path());
                let raw = RAW_EXT.contains(&ext.as_str());
                if !raw && !PHOTO_EXT.contains(&ext.as_str()) {
                    continue;
                }
                let Ok(meta) = e.metadata() else { continue };
                let modified_ms = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
                files.push(CaptureFile { path: e.path().to_string_lossy().to_string(), name, size: meta.len(), modified_ms, raw });
            }
            files.sort_by(|a, b| a.modified_ms.cmp(&b.modified_ms).then(a.name.cmp(&b.name)));
            DirScan { dir: d.clone(), ok: true, error: None, files }
        })
        .collect()
}

// ---------- processing ----------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Processed {
    pub output: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
}

/// Resize a JPEG so its long edge is at most `long_edge` (never enlarges), keep the camera orientation, write `<out_dir>/<name>.jpg`.
pub fn process_image(src: &Path, out_dir: &Path, long_edge: u32, quality: u8) -> Result<Processed, String> {
    let ext = ext_of(src);
    if RAW_EXT.contains(&ext.as_str()) {
        return Err("tệp RAW cần Capture One xử lý, app chỉ xử lý JPG".into());
    }
    if !matches!(ext.as_str(), "jpg" | "jpeg") {
        return Err(format!("định dạng .{ext} chưa được hỗ trợ"));
    }
    if long_edge < 200 || long_edge > 12000 {
        return Err("cạnh dài phải từ 200 đến 12000 px".into());
    }
    let reader = ImageReader::open(src).map_err(|e| format!("không mở được ảnh: {e}"))?.with_guessed_format().map_err(|e| format!("không đọc được định dạng: {e}"))?;
    let mut decoder = reader.into_decoder().map_err(|e| format!("ảnh hỏng hoặc chưa ghi xong: {e}"))?;
    let orientation = decoder.orientation().ok();
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| format!("ảnh hỏng hoặc chưa ghi xong: {e}"))?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    let (w, h) = (img.width(), img.height());
    let longest = w.max(h);
    let img = if longest > long_edge {
        let scale = long_edge as f64 / longest as f64;
        img.resize(((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1), FilterType::Lanczos3)
    } else {
        img
    };
    fs::create_dir_all(out_dir).map_err(|e| format!("tạo thư mục xuất lỗi: {e}"))?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("photo");
    let out = out_dir.join(format!("{stem}.jpg"));
    let tmp = out_dir.join(format!("{stem}.jpg.part"));
    {
        let file = File::create(&tmp).map_err(|e| format!("ghi file lỗi: {e}"))?;
        let mut enc = JpegEncoder::new_with_quality(BufWriter::new(file), quality.clamp(40, 100));
        enc.encode_image(&img.to_rgb8()).map_err(|e| format!("mã hóa JPG lỗi: {e}"))?;
    }
    fs::rename(&tmp, &out).map_err(|e| format!("đổi tên lỗi: {e}"))?;
    let bytes = fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
    Ok(Processed { output: out.to_string_lossy().to_string(), width: img.width(), height: img.height(), bytes })
}

// ---------- delivery ----------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Delivered {
    pub dest: String,
    pub bytes: u64,
    pub checksum: String,
    pub skipped: bool,
}

/// Keep only a plain folder name: no separators, no `..`, no drive letters.
pub fn safe_part(s: &str) -> String {
    let cleaned: String = s.chars().map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() { '-' } else { c }).collect();
    let t = cleaned.trim().trim_matches('.').trim();
    t.to_string()
}

/// Copy `src` to `<dest_dir>/<sub>/<file name>` with a checksum check. A re-exported photo replaces the older copy.
pub fn deliver_file(src: &Path, dest_dir: &Path, sub: &str) -> Result<Delivered, String> {
    if !src.is_file() {
        return Err("không tìm thấy ảnh cần gửi".into());
    }
    if !dest_dir.is_dir() {
        return Err("thư mục đích không tồn tại (ổ mạng chưa kết nối?)".into());
    }
    let mut target = dest_dir.to_path_buf();
    let sub = safe_part(sub);
    if !sub.is_empty() {
        target.push(&sub);
    }
    if target.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("đường dẫn đích không hợp lệ".into());
    }
    let name = src.file_name().ok_or("tên file không hợp lệ")?;
    let dst = target.join(name);
    let (checksum, skipped) = copy_verified_opts(src, &dst, true)?;
    let bytes = fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);
    Ok(Delivered { dest: dst.to_string_lossy().to_string(), bytes, checksum, skipped })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirCheck {
    pub exists: bool,
    pub writable: bool,
    pub free_hint: Option<String>,
}

pub fn check_dir(path: &str) -> DirCheck {
    let p = Path::new(path);
    if path.trim().is_empty() || !p.is_dir() {
        return DirCheck { exists: false, writable: false, free_hint: None };
    }
    let probe = p.join(format!(".studio-write-test-{}", std::process::id()));
    let writable = File::create(&probe).is_ok();
    let _ = fs::remove_file(&probe);
    DirCheck { exists: true, writable, free_hint: None }
}


// ---------- read-only monitoring (Capture One, folders, this machine) ----------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirStats {
    pub exists: bool,
    pub count: u32,
    pub bytes: u64,
    pub latest_ms: u64,
}

/// How many photos a folder holds and when the newest one arrived (never modifies anything).
pub fn dir_stats(path: &str) -> DirStats {
    let root = PathBuf::from(path);
    if path.trim().is_empty() || !root.is_dir() {
        return DirStats { exists: false, count: 0, bytes: 0, latest_ms: 0 };
    }
    let (mut count, mut bytes, mut latest_ms) = (0u32, 0u64, 0u64);
    for e in WalkDir::new(&root).max_depth(3).into_iter().filter_map(Result::ok) {
        if !e.file_type().is_file() || is_temp_name(&e.file_name().to_string_lossy()) {
            continue;
        }
        let ext = ext_of(e.path());
        if !RAW_EXT.contains(&ext.as_str()) && !PHOTO_EXT.contains(&ext.as_str()) {
            continue;
        }
        if let Ok(m) = e.metadata() {
            count += 1;
            bytes += m.len();
            let ms = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            latest_ms = latest_ms.max(ms);
        }
    }
    DirStats { exists: true, count, bytes, latest_ms }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub exists: bool,
    pub size: u64,
    pub modified_ms: u64,
}

pub fn file_info(path: &str) -> FileInfo {
    match fs::metadata(path) {
        Ok(m) if m.is_file() || m.is_dir() => FileInfo { exists: true, size: m.len(), modified_ms: m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0) },
        _ => FileInfo { exists: false, size: 0, modified_ms: 0 },
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MachineInfo {
    pub host: String,
    pub os: String,
    pub capture_one_running: bool,
}

fn run_ok(cmd: &str, args: &[&str]) -> Option<String> {
    let o = std::process::Command::new(cmd).args(args).output().ok()?;
    if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).to_string()) } else { None }
}

/// Host name and whether Capture One is running. Only looks at the process list.
pub fn machine_info() -> MachineInfo {
    let host = run_ok("hostname", &[]).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).or_else(|| std::env::var("COMPUTERNAME").ok()).unwrap_or_else(|| "máy này".into());
    let running = if cfg!(target_os = "windows") {
        run_ok("tasklist", &[]).map(|o| o.to_ascii_lowercase().contains("captureone")).unwrap_or(false)
    } else if cfg!(target_os = "macos") {
        run_ok("pgrep", &["-x", "Capture One"]).map(|o| !o.trim().is_empty()).unwrap_or(false)
            || run_ok("pgrep", &["-f", "Capture One.app"]).map(|o| !o.trim().is_empty()).unwrap_or(false)
    } else {
        false
    };
    MachineInfo { host, os: std::env::consts::OS.to_string(), capture_one_running: running }
}

// ---------- Capture One control (macOS, AppleScript) ----------
// Capture One has a scripting dictionary on macOS only. Parameters are escaped, never pasted raw into a script,
// and every error text from osascript is returned unchanged so a wrong command shows up clearly in the app.

pub fn as_quote(s: &str) -> String {
    let t: String = s.chars().filter(|c| !c.is_control()).collect();
    format!("\"{}\"", t.replace('\\', "\\\\").replace('"', "\\\""))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct C1Info {
    pub supported: bool,
    pub app_path: Option<String>,
    pub running: bool,
}

#[cfg(target_os = "macos")]
fn osa(script: &str) -> Result<String, String> {
    let o = std::process::Command::new("osascript").arg("-e").arg(script).output().map_err(|e| format!("không chạy được osascript: {e}"))?;
    if o.status.success() {
        Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
    } else {
        let e = String::from_utf8_lossy(&o.stderr).trim().to_string();
        Err(if e.contains("-1743") || e.to_lowercase().contains("not allowed") { format!("macOS chưa cho phép app điều khiển Capture One. Vào Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Tự động hóa, bật Capture One cho Studio Manager. ({e})") } else { e })
    }
}
#[cfg(not(target_os = "macos"))]
fn osa(_script: &str) -> Result<String, String> {
    Err("Điều khiển Capture One chỉ có trên máy Mac (AppleScript)".into())
}

fn c1_app_path() -> Option<String> {
    for dir in ["/Applications", "/Applications/Capture One"] {
        if let Ok(rd) = fs::read_dir(dir) {
            let mut found: Vec<String> = rd.filter_map(Result::ok).map(|e| e.path().to_string_lossy().to_string()).filter(|p| p.ends_with(".app") && p.contains("Capture One")).collect();
            found.sort();
            if let Some(p) = found.pop() { return Some(p); }
        }
    }
    None
}

pub fn c1_info() -> C1Info {
    let supported = cfg!(target_os = "macos");
    C1Info { supported, app_path: if supported { c1_app_path() } else { None }, running: machine_info().capture_one_running }
}

// Application name as macOS knows it ("Capture One", "Capture One 23"...), taken from the .app folder name.
fn c1_name() -> Result<String, String> {
    let p = c1_app_path().ok_or("Không tìm thấy Capture One trong thư mục Applications")?;
    Ok(Path::new(&p).file_stem().and_then(|s| s.to_str()).unwrap_or("Capture One").to_string())
}

/// Current document name and the recipes it offers.
pub fn c1_status() -> Result<String, String> {
    let app = c1_name()?;
    osa(&format!("tell application {} to return (name of current document) & \"||\" & (name of every recipe of current document as text)", as_quote(&app)))
}

pub fn c1_open(path: &str) -> Result<String, String> {
    if !Path::new(path).exists() { return Err("File session không tồn tại".into()); }
    let app = c1_name()?;
    osa(&format!("tell application {} to open POSIX file {}", as_quote(&app), as_quote(path)))
}

/// Ask Capture One to process every photo of the current collection with the named recipe.
pub fn c1_process(recipe: &str) -> Result<String, String> {
    if recipe.trim().is_empty() { return Err("Chưa nhập tên recipe".into()); }
    let app = c1_name()?;
    osa(&format!("tell application {} to process (every variant of current collection of current document) recipe {}", as_quote(&app), as_quote(recipe.trim())))
}

/// The first lines of the scripting dictionary, so a wrong command can be fixed from real data.
pub fn c1_dictionary() -> Result<String, String> {
    let p = c1_app_path().ok_or("Không tìm thấy Capture One")?;
    let o = std::process::Command::new("sdef").arg(&p).output().map_err(|e| format!("không chạy được sdef: {e}"))?;
    if !o.status.success() { return Err(String::from_utf8_lossy(&o.stderr).to_string()); }
    let text = String::from_utf8_lossy(&o.stdout).to_string();
    let lines: Vec<&str> = text.lines().filter(|l| l.contains("<command ") || l.contains("<class ") || l.contains("<property ") || l.contains("<element ")).collect();
    Ok(lines.join("\n").chars().take(12000).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static N: AtomicU32 = AtomicU32::new(0);
    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("studio-ops-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn jpg(path: &Path, w: u32, h: u32) {
        let img = image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 255) as u8, (y % 255) as u8, 90]));
        img.save_with_format(path, image::ImageFormat::Jpeg).unwrap();
    }

    #[test]
    fn scan_skips_temp_and_unknown() {
        let d = tmp();
        jpg(&d.join("A.jpg"), 8, 8);
        fs::write(d.join("B.CR3"), b"raw").unwrap();
        fs::write(d.join("C.jpg.part"), b"x").unwrap();
        fs::write(d.join(".hidden.jpg"), b"x").unwrap();
        fs::write(d.join("notes.txt"), b"x").unwrap();
        fs::create_dir_all(d.join("sub")).unwrap();
        jpg(&d.join("sub").join("D.jpeg"), 8, 8);
        let r = scan_capture_dirs(&[d.to_string_lossy().to_string(), d.join("nope").to_string_lossy().to_string()]);
        assert!(r[0].ok);
        let mut names: Vec<_> = r[0].files.iter().map(|f| f.name.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["A.jpg", "B.CR3", "D.jpeg"]);
        assert!(r[0].files.iter().find(|f| f.name == "B.CR3").unwrap().raw);
        assert!(!r[1].ok && r[1].error.is_some());
    }

    #[test]
    fn process_resizes_but_never_enlarges() {
        let d = tmp();
        jpg(&d.join("big.jpg"), 4000, 3000);
        jpg(&d.join("small.jpg"), 800, 600);
        let out = d.join("out");
        let p = process_image(&d.join("big.jpg"), &out, 2400, 90).unwrap();
        assert_eq!((p.width, p.height), (2400, 1800));
        assert!(Path::new(&p.output).is_file() && p.bytes > 0);
        let q = process_image(&d.join("small.jpg"), &out, 2400, 90).unwrap();
        assert_eq!((q.width, q.height), (800, 600));
        assert!(!out.join("big.jpg.part").exists());
    }

    #[test]
    fn process_rejects_raw_corrupt_and_bad_size() {
        let d = tmp();
        fs::write(d.join("x.cr3"), b"raw").unwrap();
        assert!(process_image(&d.join("x.cr3"), &d.join("o"), 2400, 90).unwrap_err().contains("RAW"));
        fs::write(d.join("broken.jpg"), b"not a jpeg").unwrap();
        assert!(process_image(&d.join("broken.jpg"), &d.join("o"), 2400, 90).is_err());
        jpg(&d.join("ok.jpg"), 10, 10);
        assert!(process_image(&d.join("ok.jpg"), &d.join("o"), 50, 90).is_err());
        assert!(process_image(&d.join("missing.jpg"), &d.join("o"), 2400, 90).is_err());
    }

    #[test]
    fn deliver_copies_verifies_skips_and_replaces() {
        let d = tmp();
        let dest = d.join("nas");
        fs::create_dir_all(&dest).unwrap();
        let src = d.join("P1.jpg");
        jpg(&src, 64, 64);
        let r = deliver_file(&src, &dest, "Start Swim").unwrap();
        assert!(!r.skipped && Path::new(&r.dest).is_file());
        assert!(r.dest.contains("Start Swim"));
        // same content again: skipped
        assert!(deliver_file(&src, &dest, "Start Swim").unwrap().skipped);
        // re-exported with different content: replaced
        jpg(&src, 80, 80);
        let again = deliver_file(&src, &dest, "Start Swim").unwrap();
        assert!(!again.skipped);
        assert_eq!(sha256_file(Path::new(&again.dest)).unwrap(), again.checksum);
        // missing destination and missing source
        assert!(deliver_file(&src, &d.join("offline"), "").unwrap_err().contains("thư mục đích"));
        assert!(deliver_file(&d.join("none.jpg"), &dest, "").is_err());
    }

    #[test]
    fn deliver_cannot_escape_destination() {
        let d = tmp();
        let dest = d.join("nas");
        fs::create_dir_all(&dest).unwrap();
        let src = d.join("P.jpg");
        jpg(&src, 16, 16);
        let r = deliver_file(&src, &dest, "../../evil").unwrap();
        assert!(Path::new(&r.dest).starts_with(&dest));
        assert_eq!(safe_part("a/b\\c:d"), "a-b-c-d");
        assert_eq!(safe_part(".."), "");
    }

    #[test]
    fn dir_stats_counts_photos_only() {
        let d = tmp();
        jpg(&d.join("a.jpg"), 8, 8);
        fs::write(d.join("b.CR3"), b"raw").unwrap();
        fs::write(d.join("c.txt"), b"x").unwrap();
        fs::write(d.join("d.jpg.part"), b"x").unwrap();
        let s = dir_stats(&d.to_string_lossy());
        assert!(s.exists && s.count == 2 && s.latest_ms > 0);
        assert!(!dir_stats(&d.join("no").to_string_lossy()).exists);
        assert!(file_info(&d.join("a.jpg").to_string_lossy()).exists);
        assert!(!file_info(&d.join("zz").to_string_lossy()).exists);
        assert!(!machine_info().host.is_empty());
    }

    #[test]
    fn applescript_quote_escapes() {
        assert_eq!(as_quote("a\"b\\c"), "\"a\\\"b\\\\c\"");
        assert_eq!(as_quote("x\ny"), "\"xy\"");
        assert!(c1_process("   ").is_err());
        assert!(c1_open("/no/such/file.cosessiondb").is_err());
    }

    #[test]
    fn check_dir_reports_state() {
        let d = tmp();
        assert!(check_dir(&d.to_string_lossy()).writable);
        assert!(!check_dir(&d.join("x").to_string_lossy()).exists);
        assert!(!check_dir("").exists);
    }
}
