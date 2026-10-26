// Colour grading for JPG photos. Pure Rust, no Tauri types, so it is easy to test.
//
// Pipeline (fixed order, same for preview and export):
//   sRGB -> linear -> exposure + white balance -> sRGB
//   -> blacks/whites, shadows/highlights, contrast (on luma, hue kept)
//   -> saturation/vibrance -> 3D LUT (.cube) -> vignette -> sharpen
// Photos are resized first and graded after, so batch export stays fast.

use image::{codecs::jpeg::JpegEncoder, DynamicImage, RgbImage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::UNIX_EPOCH;

/// Edit parameters for one photo. Every slider is 0 when neutral.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Grade {
    pub exposure: f32,   // EV, -3..3
    pub temp: f32,       // -100 (cool) .. 100 (warm)
    pub tint: f32,       // -100 (green) .. 100 (magenta)
    pub contrast: f32,   // -100..100
    pub highlights: f32, // -100..100
    pub shadows: f32,    // -100..100
    pub whites: f32,     // -100..100
    pub blacks: f32,     // -100..100
    pub saturation: f32, // -100..100
    pub vibrance: f32,   // -100..100
    pub sharpen: f32,    // 0..100
    pub vignette: f32,   // -100 (dark corners) .. 100 (light corners)
    pub lut_path: String,
    pub lut_amount: f32, // 0..100
}

impl Default for Grade {
    fn default() -> Self {
        Grade {
            exposure: 0.0,
            temp: 0.0,
            tint: 0.0,
            contrast: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            saturation: 0.0,
            vibrance: 0.0,
            sharpen: 0.0,
            vignette: 0.0,
            lut_path: String::new(),
            lut_amount: 100.0,
        }
    }
}

impl Grade {
    pub fn is_neutral(&self) -> bool {
        let z = |v: f32| v.abs() < 1e-4;
        z(self.exposure)
            && z(self.temp)
            && z(self.tint)
            && z(self.contrast)
            && z(self.highlights)
            && z(self.shadows)
            && z(self.whites)
            && z(self.blacks)
            && z(self.saturation)
            && z(self.vibrance)
            && z(self.sharpen)
            && z(self.vignette)
            && (self.lut_path.trim().is_empty() || z(self.lut_amount))
    }
}

// ---------- 3D LUT (.cube) ----------

#[derive(Debug)]
pub struct Lut {
    size: usize,
    data: Vec<[f32; 3]>, // red varies fastest
}

pub fn parse_cube(text: &str) -> Result<Lut, String> {
    let mut size = 0usize;
    let mut data: Vec<[f32; 3]> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut it = line.split_whitespace();
        let first = it.next().unwrap_or("");
        match first {
            "TITLE" | "DOMAIN_MIN" | "DOMAIN_MAX" => {}
            "LUT_1D_SIZE" => return Err("chỉ hỗ trợ LUT 3D (.cube có LUT_3D_SIZE)".into()),
            "LUT_3D_SIZE" => {
                size = it.next().and_then(|v| v.parse().ok()).ok_or("LUT_3D_SIZE không hợp lệ")?;
                if !(2..=129).contains(&size) {
                    return Err("kích thước LUT phải từ 2 đến 129".into());
                }
                data.reserve(size * size * size);
            }
            _ => {
                let r: f32 = first.parse().map_err(|_| format!("dòng LUT không đọc được: {line}"))?;
                let g: f32 = it.next().and_then(|v| v.parse().ok()).ok_or_else(|| format!("dòng LUT thiếu số: {line}"))?;
                let b: f32 = it.next().and_then(|v| v.parse().ok()).ok_or_else(|| format!("dòng LUT thiếu số: {line}"))?;
                data.push([r, g, b]);
            }
        }
    }
    if size == 0 {
        return Err("thiếu LUT_3D_SIZE".into());
    }
    if data.len() != size * size * size {
        return Err(format!("LUT cần {} dòng dữ liệu, có {}", size * size * size, data.len()));
    }
    Ok(Lut { size, data })
}

impl Lut {
    fn at(&self, r: usize, g: usize, b: usize) -> [f32; 3] {
        self.data[r + g * self.size + b * self.size * self.size]
    }
    /// Trilinear lookup, input and output in 0..1.
    fn sample(&self, c: [f32; 3]) -> [f32; 3] {
        let n = (self.size - 1) as f32;
        let p = [c[0].clamp(0.0, 1.0) * n, c[1].clamp(0.0, 1.0) * n, c[2].clamp(0.0, 1.0) * n];
        let i = [p[0].floor() as usize, p[1].floor() as usize, p[2].floor() as usize];
        let i1 = [(i[0] + 1).min(self.size - 1), (i[1] + 1).min(self.size - 1), (i[2] + 1).min(self.size - 1)];
        let f = [p[0] - i[0] as f32, p[1] - i[1] as f32, p[2] - i[2] as f32];
        let mut out = [0f32; 3];
        for ch in 0..3 {
            let c000 = self.at(i[0], i[1], i[2])[ch];
            let c100 = self.at(i1[0], i[1], i[2])[ch];
            let c010 = self.at(i[0], i1[1], i[2])[ch];
            let c110 = self.at(i1[0], i1[1], i[2])[ch];
            let c001 = self.at(i[0], i[1], i1[2])[ch];
            let c101 = self.at(i1[0], i[1], i1[2])[ch];
            let c011 = self.at(i[0], i1[1], i1[2])[ch];
            let c111 = self.at(i1[0], i1[1], i1[2])[ch];
            let c00 = c000 + (c100 - c000) * f[0];
            let c10 = c010 + (c110 - c010) * f[0];
            let c01 = c001 + (c101 - c001) * f[0];
            let c11 = c011 + (c111 - c011) * f[0];
            let c0 = c00 + (c10 - c00) * f[1];
            let c1 = c01 + (c11 - c01) * f[1];
            out[ch] = c0 + (c1 - c0) * f[2];
        }
        out
    }
}

type LutCache = Mutex<HashMap<String, (u64, Arc<Lut>)>>;
fn lut_cache() -> &'static LutCache {
    static C: OnceLock<LutCache> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn mtime_ms(p: &Path) -> u64 {
    std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Load a .cube file, cached until the file changes.
pub fn load_lut(path: &str) -> Result<Arc<Lut>, String> {
    let p = Path::new(path);
    let stamp = mtime_ms(p);
    if let Some((s, l)) = lut_cache().lock().unwrap().get(path) {
        if *s == stamp {
            return Ok(l.clone());
        }
    }
    let text = std::fs::read_to_string(p).map_err(|e| format!("không đọc được LUT {path}: {e}"))?;
    let lut = Arc::new(parse_cube(&text).map_err(|e| format!("LUT {path}: {e}"))?);
    lut_cache().lock().unwrap().insert(path.to_string(), (stamp, lut.clone()));
    Ok(lut)
}

// ---------- pixel pipeline ----------

fn srgb_to_linear(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}
fn linear_to_srgb(v: f32) -> f32 {
    let v = v.clamp(0.0, 1.0);
    if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}
fn luma(c: [f32; 3]) -> f32 {
    0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

struct Params {
    mul: [f32; 3],
    lo: f32,
    hi: f32,
    shadows: f32,
    highlights: f32,
    contrast: f32,
    tone: bool,
    sat: f32,
    vib: f32,
    color: bool,
    lut_amount: f32,
    vignette: f32,
}

fn params(g: &Grade) -> Params {
    let ev = 2f32.powf(g.exposure);
    let t = (g.temp / 100.0).clamp(-1.0, 1.0);
    let ti = (g.tint / 100.0).clamp(-1.0, 1.0);
    let mul = [ev * 2f32.powf(t * 0.6) * 2f32.powf(ti * 0.15), ev * 2f32.powf(-ti * 0.35), ev * 2f32.powf(-t * 0.6) * 2f32.powf(ti * 0.15)];
    let lo = -(g.blacks / 100.0).clamp(-1.0, 1.0) * 0.12;
    let hi = 1.0 - (g.whites / 100.0).clamp(-1.0, 1.0) * 0.12;
    let contrast = (g.contrast / 100.0).clamp(-1.0, 1.0) * 0.85;
    let shadows = (g.shadows / 100.0).clamp(-1.0, 1.0) * 0.3;
    let highlights = (g.highlights / 100.0).clamp(-1.0, 1.0) * 0.3;
    Params {
        mul,
        lo,
        hi,
        shadows,
        highlights,
        contrast,
        tone: lo.abs() > 1e-6 || (hi - 1.0).abs() > 1e-6 || contrast.abs() > 1e-6 || shadows.abs() > 1e-6 || highlights.abs() > 1e-6,
        sat: (g.saturation / 100.0).clamp(-1.0, 1.0),
        vib: (g.vibrance / 100.0).clamp(-1.0, 1.0),
        color: g.saturation.abs() > 1e-4 || g.vibrance.abs() > 1e-4,
        lut_amount: (g.lut_amount / 100.0).clamp(0.0, 1.0),
        vignette: (g.vignette / 100.0).clamp(-1.0, 1.0),
    }
}

fn tone_luma(p: &Params, l: f32) -> f32 {
    let mut v = (l - p.lo) / (p.hi - p.lo).max(0.2);
    let w = v.clamp(0.0, 1.0);
    v += p.shadows * 6.75 * w * (1.0 - w) * (1.0 - w);
    let w = v.clamp(0.0, 1.0);
    v += p.highlights * 6.75 * w * w * (1.0 - w);
    let v = v.clamp(0.0, 1.0);
    // S-curve: positive contrast darkens darks and brightens brights, monotone while |a| < 1
    (v - p.contrast * (2.0 * std::f32::consts::PI * v).sin() / (2.0 * std::f32::consts::PI)).clamp(0.0, 1.0)
}

fn grade_pixel(p: &Params, lut: Option<&Lut>, lin: &[f32; 256], px: [u8; 3], x: u32, y: u32, dims: (f32, f32)) -> [u8; 3] {
    let mut c = [lin[px[0] as usize] * p.mul[0], lin[px[1] as usize] * p.mul[1], lin[px[2] as usize] * p.mul[2]];
    c = [linear_to_srgb(c[0]), linear_to_srgb(c[1]), linear_to_srgb(c[2])];
    if p.tone {
        let l = luma(c);
        let nl = tone_luma(p, l);
        if l > 1e-4 {
            let k = nl / l;
            c = [(c[0] * k).clamp(0.0, 1.0), (c[1] * k).clamp(0.0, 1.0), (c[2] * k).clamp(0.0, 1.0)];
        } else {
            let d = nl - l;
            c = [(c[0] + d).clamp(0.0, 1.0), (c[1] + d).clamp(0.0, 1.0), (c[2] + d).clamp(0.0, 1.0)];
        }
    }
    if p.color {
        let l = luma(c);
        let mx = c[0].max(c[1]).max(c[2]);
        let mn = c[0].min(c[1]).min(c[2]);
        let f = (1.0 + p.sat + p.vib * (1.0 - (mx - mn))).max(0.0);
        c = [(l + (c[0] - l) * f).clamp(0.0, 1.0), (l + (c[1] - l) * f).clamp(0.0, 1.0), (l + (c[2] - l) * f).clamp(0.0, 1.0)];
    }
    if let Some(l) = lut {
        let o = l.sample(c);
        for i in 0..3 {
            c[i] = c[i] + (o[i] - c[i]) * p.lut_amount;
        }
    }
    if p.vignette.abs() > 1e-6 {
        let dx = (x as f32 + 0.5 - dims.0 / 2.0) / (dims.0 / 2.0);
        let dy = (y as f32 + 0.5 - dims.1 / 2.0) / (dims.1 / 2.0);
        let r2 = ((dx * dx + dy * dy) / 2.0).clamp(0.0, 1.0);
        let f = (1.0 + p.vignette * 0.8 * r2 * r2.sqrt()).clamp(0.0, 2.0);
        c = [c[0] * f, c[1] * f, c[2] * f];
    }
    [(c[0].clamp(0.0, 1.0) * 255.0 + 0.5) as u8, (c[1].clamp(0.0, 1.0) * 255.0 + 0.5) as u8, (c[2].clamp(0.0, 1.0) * 255.0 + 0.5) as u8]
}

fn worker_count(rows: usize) -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).min(8).min(rows.max(1))
}

/// Grade an image in place.
pub fn apply(img: &mut RgbImage, g: &Grade) -> Result<(), String> {
    if g.is_neutral() {
        return Ok(());
    }
    let lut = if !g.lut_path.trim().is_empty() && g.lut_amount > 0.0 { Some(load_lut(g.lut_path.trim())?) } else { None };
    let (w, h) = (img.width() as usize, img.height() as usize);
    if w == 0 || h == 0 {
        return Ok(());
    }
    let p = params(g);
    let mut lin = [0f32; 256];
    for (i, v) in lin.iter_mut().enumerate() {
        *v = srgb_to_linear(i as f32 / 255.0);
    }
    let dims = (w as f32, h as f32);
    let stride = w * 3;
    let workers = worker_count(h);
    let rows_per = h.div_ceil(workers);
    let lut_ref = lut.as_deref();
    {
        let buf: &mut [u8] = img.as_mut();
        std::thread::scope(|s| {
            for (ci, chunk) in buf.chunks_mut(rows_per * stride).enumerate() {
                let (p, lin) = (&p, &lin);
                s.spawn(move || {
                    for (ri, row) in chunk.chunks_mut(stride).enumerate() {
                        let y = (ci * rows_per + ri) as u32;
                        for (x, px) in row.chunks_exact_mut(3).enumerate() {
                            let o = grade_pixel(p, lut_ref, lin, [px[0], px[1], px[2]], x as u32, y, dims);
                            px.copy_from_slice(&o);
                        }
                    }
                });
            }
        });
    }
    if g.sharpen > 0.0 {
        sharpen(img, (g.sharpen / 100.0).clamp(0.0, 1.0) * 1.5);
    }
    Ok(())
}

/// Unsharp mask with a 3x3 Gaussian blur.
fn sharpen(img: &mut RgbImage, amount: f32) {
    let (w, h) = (img.width() as usize, img.height() as usize);
    if w < 3 || h < 3 {
        return;
    }
    let src: Vec<u8> = img.as_raw().clone();
    let stride = w * 3;
    let workers = worker_count(h);
    let rows_per = h.div_ceil(workers);
    let buf: &mut [u8] = img.as_mut();
    let src_ref = &src;
    std::thread::scope(|s| {
        for (ci, chunk) in buf.chunks_mut(rows_per * stride).enumerate() {
            s.spawn(move || {
                for (ri, row) in chunk.chunks_mut(stride).enumerate() {
                    let y = ci * rows_per + ri;
                    for x in 0..w {
                        for ch in 0..3 {
                            let at = |xx: isize, yy: isize| -> f32 {
                                let xx = xx.clamp(0, w as isize - 1) as usize;
                                let yy = yy.clamp(0, h as isize - 1) as usize;
                                src_ref[yy * stride + xx * 3 + ch] as f32
                            };
                            let (xi, yi) = (x as isize, y as isize);
                            let blur = (at(xi - 1, yi - 1) + 2.0 * at(xi, yi - 1) + at(xi + 1, yi - 1) + 2.0 * at(xi - 1, yi) + 4.0 * at(xi, yi) + 2.0 * at(xi + 1, yi) + at(xi - 1, yi + 1) + 2.0 * at(xi, yi + 1) + at(xi + 1, yi + 1)) / 16.0;
                            let v = at(xi, yi);
                            row[x * 3 + ch] = (v + amount * (v - blur)).clamp(0.0, 255.0).round() as u8;
                        }
                    }
                }
            });
        }
    });
}

// ---------- sidecar (per-photo edit) ----------

/// `IMG_0001.jpg` -> `IMG_0001.jpg.sm.json`, kept next to the photo so edits travel with it.
pub fn sidecar_path(photo: &Path) -> PathBuf {
    let mut s = photo.as_os_str().to_os_string();
    s.push(".sm.json");
    PathBuf::from(s)
}

#[derive(Serialize, Deserialize)]
struct SidecarFile {
    v: u32,
    grade: Grade,
}

pub fn read_sidecar(photo: &Path) -> Option<Grade> {
    let text = std::fs::read_to_string(sidecar_path(photo)).ok()?;
    serde_json::from_str::<SidecarFile>(&text).ok().map(|f| f.grade)
}

pub fn write_sidecar(photo: &Path, g: &Grade) -> Result<(), String> {
    let path = sidecar_path(photo);
    if g.is_neutral() {
        return match std::fs::remove_file(&path) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("xóa sidecar lỗi: {e}")),
        };
    }
    let text = serde_json::to_string_pretty(&SidecarFile { v: 1, grade: g.clone() }).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.part");
    std::fs::write(&tmp, text).map_err(|e| format!("ghi sidecar lỗi: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("ghi sidecar lỗi: {e}"))
}

// ---------- preview, thumbnails, listing ----------

pub fn encode_jpeg(img: &RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(img.as_raw().len() / 8);
    JpegEncoder::new_with_quality(&mut out, quality.clamp(40, 100)).encode_image(img).map_err(|e| format!("mã hóa JPG lỗi: {e}"))?;
    Ok(out)
}

fn scaled(img: DynamicImage, edge: u32) -> RgbImage {
    let (w, h) = (img.width(), img.height());
    let longest = w.max(h);
    if longest > edge {
        let k = edge as f64 / longest as f64;
        img.resize(((w as f64 * k).round() as u32).max(1), ((h as f64 * k).round() as u32).max(1), image::imageops::FilterType::Triangle).to_rgb8()
    } else {
        img.to_rgb8()
    }
}

type PreviewCache = Mutex<Vec<(String, u32, u64, Arc<RgbImage>)>>;
fn preview_cache() -> &'static PreviewCache {
    static C: OnceLock<PreviewCache> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Vec::new()))
}

/// Downscaled, correctly rotated copy of the photo. The last few are kept in memory so dragging a slider
/// only re-grades a small image instead of decoding the full JPG every time.
fn preview_base(src: &Path, edge: u32) -> Result<Arc<RgbImage>, String> {
    let key = src.to_string_lossy().to_string();
    let stamp = mtime_ms(src);
    {
        let c = preview_cache().lock().unwrap();
        if let Some((_, _, _, img)) = c.iter().find(|(k, e, s, _)| *k == key && *e == edge && *s == stamp) {
            return Ok(img.clone());
        }
    }
    let img = Arc::new(scaled(crate::ops_core::open_oriented(src)?, edge));
    let mut c = preview_cache().lock().unwrap();
    c.retain(|(k, e, _, _)| !(*k == key && *e == edge));
    c.push((key, edge, stamp, img.clone()));
    if c.len() > 4 {
        c.remove(0);
    }
    Ok(img)
}

/// JPEG bytes of the photo at `edge` px with the grade applied.
pub fn render_preview(src: &Path, edge: u32, g: &Grade) -> Result<Vec<u8>, String> {
    let base = preview_base(src, edge.clamp(200, 4000))?;
    let mut img = (*base).clone();
    apply(&mut img, g)?;
    encode_jpeg(&img, 88)
}

/// Small thumbnail with no grade, not kept in the preview cache.
pub fn render_thumb(src: &Path, edge: u32) -> Result<Vec<u8>, String> {
    let img = scaled(crate::ops_core::open_oriented(src)?, edge.clamp(64, 600));
    encode_jpeg(&img, 78)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PhotoEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
    pub edited: bool,
}

/// JPG files directly inside `dir`, sorted by name.
pub fn list_photos(dir: &str) -> Result<Vec<PhotoEntry>, String> {
    let rd = std::fs::read_dir(dir).map_err(|e| format!("không mở được thư mục: {e}"))?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
        if !matches!(ext.as_str(), "jpg" | "jpeg") {
            continue;
        }
        let Ok(md) = e.metadata() else { continue };
        if !md.is_file() {
            continue;
        }
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if name.starts_with('.') || name.starts_with("._") {
            continue;
        }
        out.push(PhotoEntry { edited: sidecar_path(&p).exists(), path: p.to_string_lossy().to_string(), name, size: md.len(), modified_ms: mtime_ms(&p) });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgb;

    fn flat(r: u8, g: u8, b: u8) -> RgbImage {
        RgbImage::from_pixel(32, 24, Rgb([r, g, b]))
    }
    fn px(img: &RgbImage) -> [u8; 3] {
        img.get_pixel(16, 12).0
    }

    #[test]
    fn neutral_is_identity() {
        let mut img = flat(120, 80, 200);
        apply(&mut img, &Grade::default()).unwrap();
        assert_eq!(px(&img), [120, 80, 200]);
    }

    #[test]
    fn exposure_up_brightens_and_down_darkens() {
        let mut a = flat(100, 100, 100);
        apply(&mut a, &Grade { exposure: 1.0, ..Grade::default() }).unwrap();
        let mut b = flat(100, 100, 100);
        apply(&mut b, &Grade { exposure: -1.0, ..Grade::default() }).unwrap();
        assert!(px(&a)[0] > 100 + 30, "{:?}", px(&a));
        assert!(px(&b)[0] < 100 - 20 && px(&b)[0] > 50, "{:?}", px(&b));
    }

    #[test]
    fn warm_temperature_shifts_red_over_blue() {
        let mut img = flat(128, 128, 128);
        apply(&mut img, &Grade { temp: 60.0, ..Grade::default() }).unwrap();
        let p = px(&img);
        assert!(p[0] > p[2] + 20, "{p:?}");
    }

    #[test]
    fn full_desaturation_gives_gray() {
        let mut img = flat(220, 60, 40);
        apply(&mut img, &Grade { saturation: -100.0, ..Grade::default() }).unwrap();
        let p = px(&img);
        assert!((p[0] as i32 - p[1] as i32).abs() <= 1 && (p[1] as i32 - p[2] as i32).abs() <= 1, "{p:?}");
    }

    #[test]
    fn contrast_is_monotone_and_spreads_tones() {
        let g = Grade { contrast: 100.0, ..Grade::default() };
        let p = params(&g);
        let mut prev = -1.0;
        for i in 0..=100 {
            let v = tone_luma(&p, i as f32 / 100.0);
            assert!(v >= prev - 1e-6, "not monotone at {i}");
            prev = v;
        }
        assert!(tone_luma(&p, 0.25) < 0.25);
        assert!(tone_luma(&p, 0.75) > 0.75);
        assert!((tone_luma(&p, 0.5) - 0.5).abs() < 1e-3);
    }

    #[test]
    fn shadows_lift_dark_but_leave_white_alone() {
        let p = params(&Grade { shadows: 100.0, ..Grade::default() });
        assert!(tone_luma(&p, 0.2) > 0.25);
        assert!((tone_luma(&p, 1.0) - 1.0).abs() < 1e-3);
        assert!(tone_luma(&p, 0.0).abs() < 1e-3);
    }

    fn identity_cube(n: usize) -> String {
        let mut s = format!("TITLE \"id\"\nLUT_3D_SIZE {n}\n");
        for b in 0..n {
            for g in 0..n {
                for r in 0..n {
                    s += &format!("{} {} {}\n", r as f32 / (n - 1) as f32, g as f32 / (n - 1) as f32, b as f32 / (n - 1) as f32);
                }
            }
        }
        s
    }

    #[test]
    fn identity_lut_keeps_colours_and_invert_lut_inverts() {
        let id = parse_cube(&identity_cube(17)).unwrap();
        let o = id.sample([0.3, 0.6, 0.9]);
        assert!((o[0] - 0.3).abs() < 1e-4 && (o[1] - 0.6).abs() < 1e-4 && (o[2] - 0.9).abs() < 1e-4);

        let dir = std::env::temp_dir().join(format!("sm-lut-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("invert.cube");
        let n = 5;
        let mut s = format!("LUT_3D_SIZE {n}\n");
        for b in 0..n {
            for g in 0..n {
                for r in 0..n {
                    s += &format!("{} {} {}\n", 1.0 - r as f32 / 4.0, 1.0 - g as f32 / 4.0, 1.0 - b as f32 / 4.0);
                }
            }
        }
        std::fs::write(&path, s).unwrap();
        let mut img = flat(200, 100, 0);
        apply(&mut img, &Grade { lut_path: path.to_string_lossy().to_string(), ..Grade::default() }).unwrap();
        let p = px(&img);
        assert!((p[0] as i32 - 55).abs() <= 2 && (p[1] as i32 - 155).abs() <= 2 && (p[2] as i32 - 255).abs() <= 2, "{p:?}");
        // half strength lands halfway
        let mut half = flat(200, 100, 0);
        apply(&mut half, &Grade { lut_path: path.to_string_lossy().to_string(), lut_amount: 50.0, ..Grade::default() }).unwrap();
        assert!((px(&half)[0] as i32 - 127).abs() <= 3, "{:?}", px(&half));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn bad_cube_files_give_clear_errors() {
        assert!(parse_cube("LUT_1D_SIZE 4\n0 0 0\n").unwrap_err().contains("3D"));
        assert!(parse_cube("LUT_3D_SIZE 2\n0 0 0\n").unwrap_err().contains("8 dòng"));
        assert!(parse_cube("0 0 0\n").is_err());
        let mut img = flat(1, 2, 3);
        let err = apply(&mut img, &Grade { lut_path: "/khong/co/file.cube".into(), ..Grade::default() }).unwrap_err();
        assert!(err.contains("không đọc được LUT"));
    }

    #[test]
    fn vignette_darkens_corners_not_centre() {
        let mut img = RgbImage::from_pixel(200, 100, Rgb([180, 180, 180]));
        apply(&mut img, &Grade { vignette: -100.0, ..Grade::default() }).unwrap();
        let c = img.get_pixel(100, 50).0[0];
        let k = img.get_pixel(0, 0).0[0];
        assert!(c >= 176, "centre {c}");
        assert!(k < c - 40, "corner {k}");
    }

    #[test]
    fn sharpen_keeps_flat_areas_and_boosts_edges() {
        let mut flat_img = flat(90, 90, 90);
        apply(&mut flat_img, &Grade { sharpen: 100.0, ..Grade::default() }).unwrap();
        assert_eq!(px(&flat_img), [90, 90, 90]);
        let mut edge = RgbImage::from_fn(40, 20, |x, _| if x < 20 { Rgb([100, 100, 100]) } else { Rgb([150, 150, 150]) });
        apply(&mut edge, &Grade { sharpen: 100.0, ..Grade::default() }).unwrap();
        assert!(edge.get_pixel(19, 10).0[0] < 100, "dark side of the edge gets darker");
        assert!(edge.get_pixel(20, 10).0[0] > 150, "bright side gets brighter");
    }

    #[test]
    fn partial_json_fills_defaults_and_roundtrips_sidecar() {
        let g: Grade = serde_json::from_str(r#"{"exposure":0.5,"lutPath":"a.cube"}"#).unwrap();
        assert_eq!(g.exposure, 0.5);
        assert_eq!(g.lut_amount, 100.0);
        assert_eq!(g.contrast, 0.0);

        let dir = std::env::temp_dir().join(format!("sm-side-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let photo = dir.join("IMG_1.jpg");
        std::fs::write(&photo, b"x").unwrap();
        assert!(read_sidecar(&photo).is_none());
        write_sidecar(&photo, &Grade { exposure: 0.7, vibrance: 20.0, ..Grade::default() }).unwrap();
        assert!(sidecar_path(&photo).to_string_lossy().ends_with("IMG_1.jpg.sm.json"));
        let back = read_sidecar(&photo).unwrap();
        assert_eq!(back.exposure, 0.7);
        assert_eq!(back.vibrance, 20.0);
        write_sidecar(&photo, &Grade::default()).unwrap();
        assert!(read_sidecar(&photo).is_none(), "neutral grade removes the sidecar");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn grading_a_big_image_is_fast_enough() {
        let mut img = RgbImage::from_fn(3000, 2000, |x, y| Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8]));
        let g = Grade { exposure: 0.3, temp: 10.0, contrast: 20.0, shadows: 30.0, saturation: 10.0, vibrance: 20.0, vignette: -20.0, sharpen: 30.0, ..Grade::default() };
        let t = std::time::Instant::now();
        apply(&mut img, &g).unwrap();
        let ms = t.elapsed().as_millis();
        println!("grade 6MP: {ms} ms");
        assert!(ms < 3000, "too slow: {ms} ms");
    }
}
