// packages/ui/src/PSDChart.tsx
/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useRef, useEffect } from 'react';

interface PSDChartProps {
  inputData   : number[];
  tuneHz?     : number;
  bwHz?       : number;
  spanMinHz?  : number;
  spanMaxHz?  : number;
}

/* ───────── tweakables ───────── */
const WIDTH  = 1000;
const HEIGHT = 250;
const GRID_SPACING = 45;
const SMOOTH_FRAMES = 8;
const PEAK_DECAY    = 0.99995;

const COLORS = {
  GRID        : 'rgba(255,255,255,0.25)',
  FILL_TOP    : 'rgba(37,117,255,0.9)',
  FILL_BOTTOM : 'rgba(0,0,0,0.1)',
  LINE        : '#2590ff',
  PEAK        : '#00C9A7FF',
  OVER_FILL   : 'rgba(207,200,17,0.15)',
  CENTER_LINE : '#C90D6BFF',
} as const;

/* ───────────────────────────────────────────── */
export default function PSDChart({
  inputData, tuneHz, bwHz, spanMinHz, spanMaxHz,
}: PSDChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const latestBuf = useRef<Float32Array | null>(null);
  const smoothBuf = useRef<Float32Array | null>(null);
  const peakBuf   = useRef<Float32Array | null>(null);

  const overlayRef = useRef({ tuneHz, bwHz, spanMinHz, spanMaxHz });
  useEffect(() => { overlayRef.current = { tuneHz, bwHz, spanMinHz, spanMaxHz }; },
            [tuneHz, bwHz, spanMinHz, spanMaxHz]);

  const ALPHA = 1 / SMOOTH_FRAMES;
  const rafId = useRef<number | null>(null);

  // ▼▼▼ FIX: Initialize the grid ref, but don't create it yet ▼▼▼
  const gridCanvas = useRef<HTMLCanvasElement | null>(null);

  /* ── mount: start animation ── */
  useEffect(() => {
    // This code now runs ONLY in the browser

    // ▼▼▼ FIX: Move the grid canvas creation logic INSIDE here ▼▼▼
    if (!gridCanvas.current) {
      const g = document.createElement('canvas'); // 'document' is safe here
      g.width = WIDTH; g.height = HEIGHT;
      const gCtx = g.getContext('2d')!;
      gCtx.strokeStyle = COLORS.GRID;
      gCtx.lineWidth = 1;
      for (let x = 0; x <= WIDTH; x += GRID_SPACING) {
        gCtx.beginPath(); gCtx.moveTo(x, 0); gCtx.lineTo(x, HEIGHT); gCtx.stroke();
      }
      for (let y = 0; y <= HEIGHT; y += GRID_SPACING) {
        gCtx.beginPath(); gCtx.moveTo(0, y); gCtx.lineTo(WIDTH, y); gCtx.stroke();
      }
      gridCanvas.current = g; // Store the pre-rendered grid
    }
    // ▲▲▲ End of moved code ▲▲▲

    const cv = canvasRef.current!;
    cv.width = WIDTH; cv.height = HEIGHT;
    const ctx = cv.getContext('2d')!;

    // Initialize buffers
    latestBuf.current = new Float32Array(inputData.length);
    smoothBuf.current = new Float32Array(inputData.length);
    peakBuf.current   = new Float32Array(inputData.length);

    const loop = () => {
      // Ensure buffers are ready before stepping/drawing
      if (latestBuf.current && smoothBuf.current && peakBuf.current) {
        step();
        draw(ctx);
      }
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };

  }, []); // Empty array means this runs once on mount (on the client)

  /* ── copy newest frame ── */
  useEffect(() => {
    if (!latestBuf.current) return;

    if (latestBuf.current.length !== inputData.length) {
      latestBuf.current = new Float32Array(inputData.length);
      smoothBuf.current = new Float32Array(inputData.length);
      peakBuf.current   = new Float32Array(inputData.length);
    }
    latestBuf.current.set(inputData);
  }, [inputData]);

  /* ── smoothing & peaks ── */
  const step = () => {
    const src  = latestBuf.current!;
    const dst  = smoothBuf.current!;
    const peak = peakBuf.current!;
    for (let i = 0; i < src.length; i++) {
      dst[i]  = dst[i] * (1 - ALPHA) + src[i] * ALPHA;
      peak[i] = Math.max(peak[i] * PEAK_DECAY, dst[i]);
    }
  };

  /* ── draw everything ── */
  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw the pre-rendered grid canvas
    if (gridCanvas.current) {
      ctx.drawImage(gridCanvas.current, 0, 0);
    }

    const data = smoothBuf.current!;
    const peak = peakBuf.current!;
    if (!data || !data.length) return;

    let min = data[0], max = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range  = Math.max(1e-3, max - min);
    const xScale = WIDTH / (data.length - 1);

    /* ---- filled PSD ---- */
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    for (let i = 0; i < data.length; i++) {
      const y = HEIGHT - ((data[i] - min) / range) * HEIGHT;
      if (i === 0) ctx.lineTo(i * xScale, y);
      else         ctx.lineTo(i * xScale, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, COLORS.FILL_TOP);
    grad.addColorStop(1, COLORS.FILL_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fill();

    /* ---- live outline ---- */
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const y = HEIGHT - ((data[i] - min) / range) * HEIGHT;
      if (i === 0) ctx.moveTo(i * xScale, y);
      else         ctx.lineTo(i * xScale, y);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.LINE;
    ctx.stroke();

    /* ---- peak-hold ---- */
    ctx.beginPath();
    for (let i = 0; i < peak.length; i++) {
      const yP = HEIGHT - ((peak[i] - min) / range) * HEIGHT;
      if (i === 0) ctx.moveTo(i * xScale, yP);
      else         ctx.lineTo(i * xScale, yP);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.PEAK;
    ctx.stroke();

    /* ---- overlay: translucent fill + centre line ---- */
    const { tuneHz, bwHz, spanMinHz, spanMaxHz } = overlayRef.current;
    if (
      tuneHz !== undefined && bwHz !== undefined &&
      spanMinHz !== undefined && spanMaxHz !== undefined &&
      spanMaxHz > spanMinHz && bwHz > 0
    ) {
      const pxPerHz = WIDTH / (spanMaxHz - spanMinHz);
      const boxX    = (tuneHz - bwHz / 2 - spanMinHz) * pxPerHz;
      const boxW    = bwHz * pxPerHz;
      const centerX = boxX + boxW / 2;

      /* translucent background */
      ctx.fillStyle = COLORS.OVER_FILL;
      ctx.fillRect(boxX, 0, boxW, HEIGHT);

      /* solid vertical centre line */
      ctx.strokeStyle = COLORS.CENTER_LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, HEIGHT);
      ctx.stroke();
    }
  };

  return (
    <div className="relative w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-[250px]"
        width={WIDTH}
        height={HEIGHT}
      />
    </div>
  );
}
