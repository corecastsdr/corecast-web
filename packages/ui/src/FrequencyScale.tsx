"use client";
import React, { useEffect, useRef } from "react";

interface Props {
  widthPx   : number;                     // bitmap width, e.g. 1024
  heightPx? : number;

  spanMinHz : number;
  spanMaxHz : number;

  tuneHz    : number;
  bwHz      : number;

  onChange  : (newTune: number, newBw: number) => void;
  font?     : string;
}

/* ── helpers ──────────────────────────────────────────────── */
const niceStep = (raw: number) => {
  const exp  = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return nice * 10 ** exp;
};
const fmtMHz = (hz: number) => (hz / 1e6).toFixed(hz < 2e6 ? 3 : 2);

/* ── component ────────────────────────────────────────────── */
export default function FrequencyScale({
  widthPx,
  heightPx = 40,
  spanMinHz,
  spanMaxHz,
  tuneHz,
  bwHz,
  onChange,
  font = "10px monospace",
}: Props) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);

  /* ───── draw ──────────────────────────────────────────── */
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.width  = widthPx;
    cv.height = heightPx;

    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const spanHz  = spanMaxHz - spanMinHz;
    const pxPerHz = cv.width / spanHz;

    /* baseline */
    ctx.strokeStyle = "#aaa";
    ctx.beginPath();
    ctx.moveTo(0, heightPx - 0.5);
    ctx.lineTo(cv.width, heightPx - 0.5);
    ctx.stroke();

    /* ticks & labels */
    const major = niceStep(60 / pxPerHz);
    const label = major * 2;
    const first = Math.ceil(spanMinHz / major) * major;

    ctx.font = font;
    ctx.fillStyle = "#ddd";
    ctx.textAlign = "center";

    for (let f = first; f <= spanMaxHz; f += major) {
      const x = Math.round((f - spanMinHz) * pxPerHz) + 0.5;
      const big = (f % label) === 0;

      ctx.strokeStyle = "#888";
      ctx.beginPath();
      ctx.moveTo(x, heightPx);
      ctx.lineTo(x, heightPx - (big ? 10 : 6));
      ctx.stroke();

      if (big) ctx.fillText(fmtMHz(f), x, heightPx - 12);
    }

    /* tuned window */
    const boxX = (tuneHz - bwHz / 2 - spanMinHz) * pxPerHz;
    const boxW = bwHz * pxPerHz;

    ctx.fillStyle   = "rgba(255,255,0,0.25)";
    ctx.strokeStyle = "rgba(255,255,0,0.9)";
    ctx.lineWidth   = 2;
    ctx.fillRect(boxX, 0, boxW, heightPx);
    ctx.strokeRect(boxX, 0, boxW, heightPx);

    /* centre caret */
    ctx.beginPath();
    ctx.moveTo(boxX + boxW / 2, 0);
    ctx.lineTo(boxX + boxW / 2, heightPx);
    ctx.stroke();
  }, [widthPx, heightPx, spanMinHz, spanMaxHz, tuneHz, bwHz, font]);

  /* ───── interaction ───────────────────────────────────── */
  type Mode = "left" | "right" | "centre";
  interface Drag {
    mode      : Mode;
    startX    : number;    // clientX at mousedown
    pxPerHz   : number;    // CSS px per Hz, frozen at mousedown
    startBw   : number;
    startTune : number;    // only for centre-drag
  }
  const drag = useRef<Drag | null>(null);

  const EDGE = 6;      // px grab width at edges
  const CARET = 4;     // px grab width at centre

  const cssBox = () => {
    const rect = (cvRef.current as HTMLCanvasElement).getBoundingClientRect();
    const pph  = rect.width / (spanMaxHz - spanMinHz);      // px/Hz in CSS
    const boxX = (tuneHz - bwHz / 2 - spanMinHz) * pph;
    const boxW = bwHz * pph;
    return { pph, boxX, boxW, caretX: boxX + boxW / 2 };
  };

  const hit = (clientX: number): Mode | null => {
    const rect = (cvRef.current as HTMLCanvasElement).getBoundingClientRect();
    const { boxX, boxW, caretX } = cssBox();
    const x = clientX - rect.left;
    if (Math.abs(x - boxX) < EDGE)          return "left";
    if (Math.abs(x - (boxX + boxW)) < EDGE) return "right";
    if (Math.abs(x - caretX) < CARET)       return "centre";
    return null;
  };

  /* hover cursor */
  const over = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drag.current) return;
    const m = hit(e.clientX);
    cvRef.current!.style.cursor =
      m === "left" || m === "right" ? "ew-resize"
      : m === "centre"              ? "col-resize"
      : "default";
  };

  /* start drag */
  const down = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mode = hit(e.clientX);
    if (!mode) return;

    const rect = (cvRef.current as HTMLCanvasElement).getBoundingClientRect();
    drag.current = {
      mode,
      startX   : e.clientX,
      pxPerHz  : rect.width / (spanMaxHz - spanMinHz),
      startBw  : bwHz,
      startTune: tuneHz,
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  /* drag move */
  const move = (e: MouseEvent) => {
    const d = drag.current;
    if (!d) return;

    const deltaHz = (e.clientX - d.startX) / d.pxPerHz;
    const MIN_BW  = 10_000;

    if (d.mode === "centre") {
      const newTune = Math.min(
        spanMaxHz - d.startBw / 2,
        Math.max(spanMinHz + d.startBw / 2, d.startTune + deltaHz)
      );
      onChange(newTune, d.startBw);
    } else {
      /* adjust bandwidth symmetrically, keep tune fixed */
      let newBw =
        d.mode === "left"
          ? Math.max(MIN_BW, d.startBw - 2 * deltaHz)   // drag right ⇒ shrink
          : Math.max(MIN_BW, d.startBw + 2 * deltaHz);  // drag right ⇒ grow

      /* clamp so edges never leave full span */
      const maxBW = 2 * Math.min(tuneHz - spanMinHz, spanMaxHz - tuneHz);
      if (newBw > maxBW) newBw = maxBW;

      onChange(tuneHz, newBw);
    }
  };

  /* end drag */
  const up = () => {
    drag.current = null;
    cvRef.current!.style.cursor = "default";
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };

  /* ───── render ────────────────────────────────────────── */
  return (
    <canvas
      ref={cvRef}
      style={{ width: "100%", display: "block" }}
      onMouseMove={over}
      onMouseDown={down}
    />
  );
}
