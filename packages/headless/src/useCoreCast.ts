// packages/headless/src/useCoreCast.ts
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useRef, useEffect, useCallback } from 'react';
import { type ClientSettings, type WaterfallSettings } from './types';

const RATE = 48_000;

export interface CoreCastOptions {
    audioUrl: string;
    waterfallUrl: string;
    initialSpan: { min: number; max: number };
    initialSettings: ClientSettings;
    initialWaterfallSettings: WaterfallSettings;
    onAudioChunk?: (pcm: Float32Array) => void;
}

export function useCoreCast({
    audioUrl,
    waterfallUrl,
    initialSpan,
    initialSettings,
    initialWaterfallSettings,
    onAudioChunk,
}: CoreCastOptions) {
    // --- State ---
    const [volume, setVolume] = useState(30);
    const [audioDb, setAudioDb] = useState(-120);
    const [isPlaying, setIsPlaying] = useState(false);
    const [span, setSpan] = useState(initialSpan);
    const [latestLine, setLatestLine] = useState<number[]>([]);
    const [clientSettings, setClientSettings] = useState<ClientSettings>(initialSettings);
    const [waterfallSettings, setWaterfallSettings] = useState<WaterfallSettings>(initialWaterfallSettings);

    // --- Refs ---
    const audioWS = useRef<WebSocket | null>(null);
    const wfWS = useRef<WebSocket | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const timelineRef = useRef(0);

    // Performance optimization refs
    const lastDbUpdateRef = useRef(0);
    const audioLevelRef = useRef(-120);
    const queueRef = useRef<Float32Array[]>([]);
    const isPumpRunningRef = useRef(false);

    // --- Audio Scheduling ---
    // Note: We use 'any' for pcm here to bypass the strict ArrayBuffer vs SharedArrayBuffer check
    const scheduleBuffer = useCallback((ctx: AudioContext, pcm: any) => {
        const buf = ctx.createBuffer(1, pcm.length, RATE);

        // ▼▼▼ FIX 1: Cast to any to bypass strict buffer type check ▼▼▼
        buf.copyToChannel(pcm as any, 0);

        const src = ctx.createBufferSource();
        src.buffer = buf;

        if (gainRef.current) {
            src.connect(gainRef.current);
        } else {
            src.connect(ctx.destination);
        }

        // Ensure we schedule in the future
        if (timelineRef.current < ctx.currentTime) {
            timelineRef.current = ctx.currentTime + 0.05; // Small buffer
        }

        src.start(timelineRef.current);
        timelineRef.current += pcm.length / RATE;
    }, []);

    // --- Main Audio Pump Loop ---
    const pumpAudio = useCallback(() => {
        const ctx = ctxRef.current;
        if (!ctx || ctx.state !== 'running') {
            isPumpRunningRef.current = false;
            return;
        }

        const GUARD_SEC = 0.2;
        const queue = queueRef.current;

        // Schedule chunks until we are sufficiently buffered ahead
        while (queue.length > 0 && timelineRef.current - ctx.currentTime < GUARD_SEC) {
            const chunk = queue.shift();
            // ▼▼▼ FIX 2: Pass chunk directly (scheduleBuffer now accepts 'any') ▼▼▼
            if (chunk) scheduleBuffer(ctx, chunk);
        }

        if (queue.length > 0 || isPlaying) {
            isPumpRunningRef.current = true;
            requestAnimationFrame(pumpAudio);
        } else {
            isPumpRunningRef.current = false;
        }
    }, [isPlaying, scheduleBuffer]);

    // --- Audio WebSocket Handler ---
    const connectAudio = useCallback(() => {
        if (audioWS.current) return;

        const ws = new WebSocket(audioUrl);
        ws.binaryType = 'arraybuffer';
        audioWS.current = ws;

        ws.onopen = () => {
            setIsPlaying(true);
            // Send initial tuning
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'tune', ...clientSettings }));
            }
        };

        ws.onclose = () => {
            setIsPlaying(false);
            audioWS.current = null;
        };

        ws.onerror = (e) => console.error('Audio WS error', e);

        ws.onmessage = (ev) => {
            if (typeof ev.data === 'string') return;

            const pcmF32 = new Float32Array(ev.data);

            // External callback hook
            if (onAudioChunk) onAudioChunk(pcmF32);

            // Add to playback queue
            queueRef.current.push(pcmF32);

            // --- Optimized Level Calculation ---
            // Process every 4th sample to save CPU (plenty accurate for visual meter)
            let sum = 0;
            const len = pcmF32.length;
            for (let i = 0; i < len; i += 4) {
                sum += pcmF32[i] * pcmF32[i];
            }
            // Adjust calculation since we only summed 1/4th of samples
            const rms = Math.sqrt(sum / (len / 4));
            const db = 20 * Math.log10(rms + 1e-7); // Standard dBFS calc

            // Smooth the value
            audioLevelRef.current = audioLevelRef.current * 0.8 + db * 0.2;

            // --- THROTTLE REACT UPDATES (Max 30fps) ---
            const now = Date.now();
            if (now - lastDbUpdateRef.current > 33) {
                setAudioDb(audioLevelRef.current);
                lastDbUpdateRef.current = now;
            }

            // Start pump if needed
            if (!isPumpRunningRef.current && queueRef.current.length > 5) {
                pumpAudio();
            }
        };
    }, [audioUrl, clientSettings, onAudioChunk, pumpAudio]);

    // --- Waterfall WebSocket Handler ---
    useEffect(() => {
        if (wfWS.current) {
            wfWS.current.close();
        }

        const ws = new WebSocket(waterfallUrl);
        wfWS.current = ws;

        ws.onopen = () => {
            // Send initial span
            ws.send(JSON.stringify({ type: 'span', min: span.min, max: span.max }));
        };

        ws.onmessage = (ev) => {
            try {
                const pkt = JSON.parse(ev.data);
                if (pkt.type === 'waterfall' && Array.isArray(pkt.data)) {
                    setLatestLine(pkt.data);
                }
            } catch (e) {
                console.error("WF Parse Error", e);
            }
        };

        return () => {
            ws.close();
            wfWS.current = null;
        };
    }, [waterfallUrl]); // Re-connect only if URL changes

    // --- Span Update Sender ---
    useEffect(() => {
        const ws = wfWS.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'span', min: span.min, max: span.max }));
        }
    }, [span]);

    // --- Tune Update Sender ---
    useEffect(() => {
        const ws = audioWS.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'tune', ...clientSettings }));
        }
    }, [clientSettings]);

    // --- Volume Control ---
    useEffect(() => {
        if (gainRef.current) {
            // Use exponential ramp for smoother volume changes
            const now = ctxRef.current?.currentTime || 0;
            // Clamp value to prevent errors (0.01 to 1.0)
            const vol = Math.max(0.001, volume / 100);
            gainRef.current.gain.setTargetAtTime(vol, now, 0.1);
        }
    }, [volume]);

    // --- Public API ---
    const play = useCallback(async () => {
        if (!ctxRef.current) {
            ctxRef.current = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
        }
        if (ctxRef.current.state === 'suspended') {
            await ctxRef.current.resume();
        }

        if (!gainRef.current) {
            gainRef.current = ctxRef.current.createGain();
            gainRef.current.gain.value = volume / 100;
            gainRef.current.connect(ctxRef.current.destination);
        }

        connectAudio();
    }, [connectAudio, volume]);

    const stop = useCallback(() => {
        if (audioWS.current) {
            audioWS.current.close();
            audioWS.current = null;
        }
        if (ctxRef.current) {
            ctxRef.current.suspend();
        }
        setIsPlaying(false);
        queueRef.current = [];
        timelineRef.current = 0;
    }, []);

    return {
        isPlaying,
        audioDb,
        volume,
        span,
        clientSettings,
        waterfallSettings,
        latestLine,
        play,
        stop,
        setVolume,
        setSpan,
        setClientSettings,
        setWaterfallSettings,
    };
}
