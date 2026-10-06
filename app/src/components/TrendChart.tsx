import { useMemo, useRef, useState } from "react";

export interface TrendPoint {
  x: number; // epoch ms
  y: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  color: string; // CSS color (var(--color-accent) etc.)
  formatValue: (y: number) => string;
  formatDate: (x: number) => string;
  baselineX?: number | null;
  height?: number;
  emptyLabel?: string;
}

// A single-series trend line - no legend needed (the section title names the
// series), but it ships its own hover crosshair + tooltip by default, and a
// dashed reference line for the business's baseline date when one is set.
// Fixed viewBox scaled to 100% width keeps it responsive without a resize
// observer.
const VIEW_W = 600;
const PAD_X = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function TrendChart({
  points,
  color,
  formatValue,
  formatDate,
  baselineX,
  height = 220,
  emptyLabel = "אין עדיין מספיק נתונים לגרף"
}: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { path, areaPath, scaleX, scaleY, minX, maxX } = useMemo(() => {
    if (points.length < 2) {
      return { path: "", areaPath: "", scaleX: (_: number) => 0, scaleY: (_: number) => 0, minX: 0, maxX: 0 };
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minXv = Math.min(...xs);
    const maxXv = Math.max(...xs);
    const maxYv = Math.max(...ys, 1) * 1.15;
    const plotH = height - PAD_TOP - PAD_BOTTOM;

    const sx = (x: number) => {
      if (maxXv === minXv) return PAD_X;
      return PAD_X + ((x - minXv) / (maxXv - minXv)) * (VIEW_W - PAD_X * 2);
    };
    const sy = (y: number) => PAD_TOP + plotH - (y / maxYv) * plotH;

    const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
    const baseline = PAD_TOP + plotH;
    const area =
      `M ${sx(points[0].x).toFixed(1)} ${baseline} ` +
      points.map((p) => `L ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ") +
      ` L ${sx(points[points.length - 1].x).toFixed(1)} ${baseline} Z`;

    return { path: d, areaPath: area, scaleX: sx, scaleY: sy, minX: minXv, maxX: maxXv };
  }, [points, height]);

  if (points.length < 2) {
    return (
      <div className="trend-chart-empty" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(scaleX(p.x) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const showBaseline = baselineX != null && baselineX >= minX && baselineX <= maxX;

  // Tooltip box, clamped so it never runs off either edge of the chart.
  const tooltipW = 108;
  let tooltipX = hovered ? scaleX(hovered.x) + 10 : 0;
  if (hovered && tooltipX + tooltipW > VIEW_W - PAD_X) tooltipX = scaleX(hovered.x) - tooltipW - 10;

  return (
    <svg
      ref={svgRef}
      className="trend-chart"
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <path d={areaPath} fill={color} opacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {showBaseline && (
        <>
          <line
            x1={scaleX(baselineX as number)}
            x2={scaleX(baselineX as number)}
            y1={PAD_TOP}
            y2={height - PAD_BOTTOM}
            stroke="var(--color-text-dim)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text x={scaleX(baselineX as number) + 4} y={PAD_TOP + 10} fill="var(--color-text-dim)" fontSize={9}>
            בייסליין
          </text>
        </>
      )}

      {hovered && (
        <g>
          <line
            x1={scaleX(hovered.x)}
            x2={scaleX(hovered.x)}
            y1={PAD_TOP}
            y2={height - PAD_BOTTOM}
            stroke="var(--color-text-muted)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <circle cx={scaleX(hovered.x)} cy={scaleY(hovered.y)} r={4} fill={color} />
          <rect
            x={tooltipX}
            y={Math.max(PAD_TOP, scaleY(hovered.y) - 34)}
            width={tooltipW}
            height={30}
            rx={6}
            fill="var(--color-bg-elevated)"
            stroke="var(--color-border)"
          />
          <text
            x={tooltipX + 8}
            y={Math.max(PAD_TOP, scaleY(hovered.y) - 34) + 12}
            fill="var(--color-text-dim)"
            fontSize={8.5}
          >
            {formatDate(hovered.x)}
          </text>
          <text
            x={tooltipX + 8}
            y={Math.max(PAD_TOP, scaleY(hovered.y) - 34) + 24}
            fill="var(--color-text)"
            fontSize={10.5}
            fontWeight={700}
          >
            {formatValue(hovered.y)}
          </text>
        </g>
      )}
    </svg>
  );
}
