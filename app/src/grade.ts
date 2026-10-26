// Colour grading model shared by the editor, presets and the processing engine.
// The maths lives in Rust (src-tauri/src/grade.rs); this file only describes the parameters.

export interface Grade {
  exposure: number; temp: number; tint: number;
  contrast: number; highlights: number; shadows: number; whites: number; blacks: number;
  saturation: number; vibrance: number;
  sharpen: number; vignette: number;
  lutPath: string; lutAmount: number;
}

export const defaultGrade = (): Grade => ({
  exposure: 0, temp: 0, tint: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  saturation: 0, vibrance: 0, sharpen: 0, vignette: 0, lutPath: "", lutAmount: 100,
});

export type GroupKey = "light" | "color" | "effect" | "lut";
type NumKey = Exclude<keyof Grade, "lutPath">;
export interface SliderDef { key: NumKey; label: string; min: number; max: number; step: number; unit?: string }

export const GROUPS: { key: GroupKey; label: string; sliders: SliderDef[] }[] = [
  { key: "light", label: "Ánh sáng", sliders: [
    { key: "exposure", label: "Phơi sáng", min: -3, max: 3, step: 0.05, unit: " EV" },
    { key: "contrast", label: "Tương phản", min: -100, max: 100, step: 1 },
    { key: "highlights", label: "Vùng sáng", min: -100, max: 100, step: 1 },
    { key: "shadows", label: "Vùng tối", min: -100, max: 100, step: 1 },
    { key: "whites", label: "Điểm trắng", min: -100, max: 100, step: 1 },
    { key: "blacks", label: "Điểm đen", min: -100, max: 100, step: 1 },
  ] },
  { key: "color", label: "Màu", sliders: [
    { key: "temp", label: "Nhiệt độ màu", min: -100, max: 100, step: 1 },
    { key: "tint", label: "Sắc xanh / hồng", min: -100, max: 100, step: 1 },
    { key: "saturation", label: "Bão hòa", min: -100, max: 100, step: 1 },
    { key: "vibrance", label: "Sống động", min: -100, max: 100, step: 1 },
  ] },
  { key: "effect", label: "Hiệu ứng", sliders: [
    { key: "sharpen", label: "Làm nét", min: 0, max: 100, step: 1 },
    { key: "vignette", label: "Tối góc", min: -100, max: 100, step: 1 },
  ] },
];

export const GROUP_LABEL: Record<GroupKey, string> = { light: "Ánh sáng", color: "Màu", effect: "Hiệu ứng", lut: "LUT" };

export const isNeutral = (g: Grade) =>
  GROUPS.every((grp) => grp.sliders.every((s) => Math.abs(g[s.key]) < 1e-4)) && (!g.lutPath.trim() || g.lutAmount < 1e-4);

/** Copy only the chosen groups from `from` onto `base` (the "paste some settings" action). */
export function mergeGroups(base: Grade, from: Grade, groups: GroupKey[]): Grade {
  const out = { ...base };
  for (const grp of GROUPS) {
    if (!groups.includes(grp.key)) continue;
    for (const s of grp.sliders) out[s.key] = from[s.key];
  }
  if (groups.includes("lut")) { out.lutPath = from.lutPath; out.lutAmount = from.lutAmount; }
  return out;
}

/** Fill in anything missing (old sidecars, hand-edited files) so the UI never sees undefined. */
export const normalizeGrade = (g: Partial<Grade> | null | undefined): Grade => ({ ...defaultGrade(), ...(g ?? {}) });

export interface GradePreset { id: string; name: string; grade: Grade; builtin?: boolean }

const P = (id: string, name: string, g: Partial<Grade>): GradePreset => ({ id, name, builtin: true, grade: { ...defaultGrade(), ...g } });
export const BUILTIN_PRESETS: GradePreset[] = [
  P("b-natural", "Tự nhiên sáng", { exposure: 0.15, contrast: 12, shadows: 20, highlights: -15, vibrance: 15, sharpen: 20 }),
  P("b-sport", "Thể thao trong", { temp: -8, contrast: 18, shadows: 15, whites: 10, vibrance: 20, sharpen: 35 }),
  P("b-warm", "Ấm nắng", { temp: 25, tint: 5, contrast: 10, highlights: -20, saturation: 8, vibrance: 15, vignette: -15 }),
  P("b-film", "Phim nhạt", { temp: 8, contrast: -10, highlights: -10, blacks: 25, saturation: -15 }),
  P("b-bw", "Đen trắng", { contrast: 25, saturation: -100, sharpen: 30, vignette: -15 }),
];
