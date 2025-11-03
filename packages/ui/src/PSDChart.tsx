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
  width?: number; // Logical width
}

/* ───────── tweakables ───────── */
// const WIDTH  = 1000; // Now a prop
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
  inputData, tuneHz, bwHz, spanMinHz, spanMaxHz, width = 1024
}: PSDChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const latestBuf = useRef<Float32Array | null>(null);
  const smoothBuf = useRef<Float32Array | null>(null);
  const peakBuf   = useRef<Float32Array | null>(null);

  /* keep overlay params fresh */
  const overlayRef = useRef({ tuneHz, bwHz, spanMinHz, spanMaxHz });
  useEffect(() => { overlayRef.current = { tuneHz, bwHz, spanMinHz, spanMaxHz }; },
            [tuneHz, bwHz, spanMinHz, spanMaxHz]);

  const ALPHA = 1 / SMOOTH_FRAMES;
  const rafId = useRef<number | null>(null);

  /* ── static grid drawn once ── */
  const gridCanvas = useRef<HTMLCanvasElement | null>(null);

  const initializeBuffers = (dataLength: number) => {
    if (dataLength === 0 || (latestBuf.current && latestBuf.current.length === dataLength)) {
      return;
    }
    latestBuf.current = new Float32Array(dataLength);
    smoothBuf.current = new Float32Array(dataLength);
    peakBuf.current   = new Float32Array(dataLength);
  };

  /* ── mount: start animation ── */
  useEffect(() => {
    // Moved grid creation here
    if (!gridCanvas.current) {
      const g = document.createElement('canvas');
      g.width = width; g.height = HEIGHT;
      const gCtx = g.getContext('2d')!;
      gCtx.strokeStyle = COLORS.GRID;
      gCtx.lineWidth = 1;
      for (let x = 0; x <= width; x += GRID_SPACING) {
        gCtx.beginPath(); gCtx.moveTo(x, 0); gCtx.lineTo(x, HEIGHT); gCtx.stroke();
      }
      for (let y = 0; y <= HEIGHT; y += GRID_SPACING) {
        gCtx.beginPath(); gCtx.moveTo(0, y); gCtx.lineTo(width, y); gCtx.stroke();
      }
      gridCanvas.current = g;
    }

    const cv = canvasRef.current!;
    cv.width = width; cv.height = HEIGHT;
    const ctx = cv.getContext('2d')!;

    initializeBuffers(inputData.length);

    const loop = () => {
      step();
      draw(ctx);
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => {
      if(rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [width, inputData.length]); // Re-run if width or data length changes

  /* ── copy newest frame ── */
  useEffect(() => {
    initializeBuffers(inputData.length);
    if (!latestBuf.current) return;
    latestBuf.current.set(inputData);
  }, [inputData]);

  /* ── smoothing & peaks ── */
  const step = () => {
    if (!latestBuf.current || !smoothBuf.current || !peakBuf.current) return;
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
    ctx.clearRect(0, 0, width, HEIGHT);
    ctx.drawImage(gridCanvas.current!, 0, 0);

    const data = smoothBuf.current;
    const peak = peakBuf.current;
    if (!data || !data.length || !peak) return;

    let min = data[0], max = data[0];
    for (let i = 1; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range  = Math.max(1e-3, max - min);

    // ▼▼▼ THIS IS THE KEY (FROM YOUR OLD CODE) ▼▼▼
    // The X scale is based on stretching the *data length* to the *canvas width*
    const xScale = width / (data.length - 1);

    /* ---- filled PSD ---- */
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    for (let i = 0; i < data.length; i++) {
      const y = HEIGHT - ((data[i] - min) / range) * HEIGHT;
      ctx.lineTo(i * xScale, y);
    }
    ctx.lineTo(width, HEIGHT);
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
      // This logic is what "zooms" the overlay.
      // It calculates pixels based on frequency, not bin index.
      const pxPerHz = width / (spanMaxHz - spanMinHz);
      const boxX    = (tuneHz - bwHz / 2 - spanMinHz) * pxPerHz;
      const boxW    = bwHz * pxPerHz;
      const centerX = (tuneHz - spanMinHz) * pxPerHz; // Center line based on freq

      ctx.fillStyle = COLORS.OVER_FILL;
      ctx.fillRect(boxX, 0, boxW, HEIGHT);

      ctx.strokeStyle = COLORS.CENTER_LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, HEIGHT);
      ctx.stroke();
    }
  };

  // Use inline style for width
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '250px' }}
        width={width}
        height={HEIGHT}
      />
    </div>
  );
}
