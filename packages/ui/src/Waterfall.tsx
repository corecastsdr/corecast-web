"use client";
import React, { useEffect, useRef } from "react";

/* ───────── SDR++-style palette ───────── */
type RGB = { r: number; g: number; b: number };
const PAL: RGB[] = [
  { r: 0, g: 0, b: 0 },   { r: 0, g: 0, b: 32 },  { r: 0, g: 0, b: 64 },  { r: 0, g: 0, b: 128 },
  { r: 0, g: 0, b: 255 }, { r: 0, g: 127, b: 255 }, { r: 0, g: 191, b: 255 }, { r: 0, g: 255, b: 255 },
  { r: 0, g: 255, b: 191 }, { r: 0, g: 255, b: 127 }, { r: 0, g: 255, b: 63 }, { r: 0, g: 255, b: 0 },
  { r: 63, g: 255, b: 0 },  { r: 127, g: 255, b: 0 }, { r: 191, g: 255, b: 0 }, { r: 255, g: 255, b: 0 },
  { r: 255, g: 191, b: 0 }, { r: 255, g: 127, b: 0 }, { r: 255, g: 63, b: 0 }, { r: 255, g: 0, b: 0 },
  { r: 191, g: 0, b: 0 },   { r: 127, g: 0, b: 0 },  { r: 95, g: 0, b: 0 },   { r: 63, g: 0, b: 0 }
];
const lerp = (a: number, b: number, t: number) => a + t * (b - a);
const blend = (a: RGB, b: RGB, t: number): RGB => ({
  r: Math.round(lerp(a.r, b.r, t)),
  g: Math.round(lerp(a.g, b.g, t)),
  b: Math.round(lerp(a.b, b.b, t))
});
const colour = (n: number): RGB => {
  if (!Number.isFinite(n)) n = 0;
  const x = Math.max(0, Math.min(1, n)) * (PAL.length - 1);
  const i = Math.floor(x), t = x - i;
  return i >= PAL.length - 1 ? PAL[PAL.length - 1] : blend(PAL[i], PAL[i + 1], t);
};

/* ───────── props ───────── */
interface Props {
  samples      : number[];
  width?       : number;
  height?      : number;
  smooth?      : number;
  minDB?       : number;
  maxDB?       : number;

  tuneHz       : number;
  bwHz         : number;
  spanMinHz    : number;
  spanMaxHz    : number;

  onSpanChange : (newMin: number, newMax: number) => void;
}

/* ───────── component ───────── */
export default function Waterfall({
  samples,
  width  = 1024,
  height = 400,
  smooth = 3,
  minDB  = -120,
  maxDB  = -40,
  tuneHz,
  bwHz,
  spanMinHz,
  spanMaxHz,
  onSpanChange
}: Props) {
  /* canvases */
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);

  /* wrapper for pan / zoom */
  const containerRef = useRef<HTMLDivElement>(null);

  /* bitmap width lock */
  const bitmapW = useRef(width);
  useEffect(() => {
    bitmapW.current = width;
    if (bgRef.current) bgRef.current.width = width;
    if (fgRef.current) fgRef.current.width = width;
  }, [width]);

  /* ------- helpers ------- */
  const resample = (src: Float32Array, Wdest: number) => {
    if (src.length === Wdest) return src;
    const dst = new Float32Array(Wdest);
    const ratio = src.length / Wdest;
    for (let x = 0; x < Wdest; x++) dst[x] = src[Math.floor(x * ratio)];
    return dst;
  };

  const smoothRow = (row: Float32Array) => {
    if (smooth <= 1) return row;
    const N = row.length, h = smooth >> 1, out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let j = -h; j <= h; j++) {
        const k = Math.min(N - 1, Math.max(0, i + j));
        s += row[k]; c++;
      }
      out[i] = s / c;
    }
    return out;
  };

  /* ------- draw waterfall line ------- */
  useEffect(() => {
    const cv = bgRef.current; if (!cv || !samples.length) return;
    const ctx = cv.getContext("2d")!;

    ctx.drawImage(cv, 0, 0, cv.width, cv.height - 1, 0, 1, cv.width, cv.height - 1);

    const row = resample(smoothRow(Float32Array.from(samples)), bitmapW.current);
    const img = ctx.createImageData(cv.width, 1);
    const lo = minDB, hi = maxDB;

    for (let x = 0; x < cv.width; x++) {
      const n = (row[x] - lo) / (hi - lo);
      const { r, g, b } = colour(n);
      const i = x * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [samples, smooth, minDB, maxDB]);

  /* ------- overlay ------- */
  useEffect(() => {
    const cv = fgRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const pxPerHz = cv.width / (spanMaxHz - spanMinHz);
    const boxX = (tuneHz - bwHz / 2 - spanMinHz) * pxPerHz;
    const boxW = bwHz * pxPerHz;

    ctx.strokeStyle = "rgba(255,255,0,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, 0, boxW, cv.height);
    ctx.fillStyle = "rgba(255,255,0,0.15)";
    ctx.fillRect(boxX, 0, boxW, cv.height);
  }, [tuneHz, bwHz, spanMinHz, spanMaxHz]);

  /* ------- pan (mouse-drag) ------- */
  const dragRef = useRef<{ startX: number; startMin: number; startMax: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startMin: spanMinHz, startMax: spanMaxHz };
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp,   { passive: false });
    document.body.style.cursor = "grabbing";
  };

  const onMouseMove = (e: MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const pxPerHz = rect.width / (d.startMax - d.startMin);
    const deltaHz = -(e.clientX - d.startX) / pxPerHz;
    onSpanChange(d.startMin + deltaHz, d.startMax + deltaHz);
  };

  const onMouseUp = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup",   onMouseUp);
    document.body.style.cursor = "default";
  };

  /* ------- wheel zoom (raw listener) ------- */
  useEffect(() => {
    const el = containerRef.current!;
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const ZOOM = 1.2;
      const zoomIn = e.deltaY < 0;
      const rect = el.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const cursorHz = spanMinHz + frac * (spanMaxHz - spanMinHz);

      let spanVal = spanMaxHz - spanMinHz;
      spanVal *= zoomIn ? 1 / ZOOM : ZOOM;
      spanVal = Math.max(20_000, spanVal);

      const newMin = cursorHz - spanVal * frac;
      const newMax = newMin + spanVal;
      onSpanChange(newMin, newMax);
    };
    // This hook is safe because it only runs on the client after mount
    el.addEventListener("wheel", wheelHandler, { passive: false });
    return () => el.removeEventListener("wheel", wheelHandler);
  }, [spanMinHz, spanMaxHz, onSpanChange]);

  /* ------- render ------- */
  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", overscrollBehavior: "contain", cursor: "grab" }}
      onMouseDown={onMouseDown}
    >
      <canvas
        ref={bgRef}
        width={width}
        height={height}
        style={{ width: "100%", imageRendering: "auto", border: "1px solid #444" }}
      />
      <canvas
        ref={fgRef}
        width={width}
        height={height}
        style={{ position: "absolute", left: 0, top: 0, width: "100%", pointerEvents: "none" }}
      />
    </div>
  );
}
