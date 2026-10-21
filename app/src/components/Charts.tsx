// Small dependency-free SVG charts in the macOS style.

export function AreaChart({ values, labels, format, height = 150 }: { values: number[]; labels: string[]; format: (n: number) => string; height?: number }) {
  const w = 600, h = height, padL = 2, padR = 2, padT = 10, padB = 4;
  const max = Math.max(1, ...values) * 1.15;
  const x = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, values.length - 1);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1)},${h - padB} L${x(0)},${h - padB} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={labels.map((l, i) => `${l}: ${format(values[i])}`).join(", ")}>
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sys-blue)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--sys-blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} x2={w} y1={padT + g * (h - padT - padB)} y2={padT + g * (h - padT - padB)} stroke="var(--mac-separator)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke="var(--sys-blue)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Sparkline({ values, color = "var(--sys-blue)" }: { values: number[]; color?: string }) {
  const w = 80, h = 26;
  const max = Math.max(1, ...values), min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${((i * w) / Math.max(1, values.length - 1)).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Donut({ segments, size = 108, thickness = 12, center }: { segments: { value: number; color: string; label: string }[]; size?: number; thickness?: number; center?: React.ReactNode }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mac-hover)" strokeWidth={thickness} />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += len;
          return el;
        })}
      </svg>
      {center ? <div className="donut-center">{center}</div> : null}
    </div>
  );
}
