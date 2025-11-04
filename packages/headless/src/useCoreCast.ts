// packages/headless/src/useCoreCast.ts
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useRef, useEffect } from 'react';
import { type ClientSettings, type WaterfallSettings } from './types';

const RATE = 48_000;

export interface CoreCastOptions {
    audioUrl: string;
    waterfallUrl: string;
    initialSpan: { min: number; max: number };
    initialSettings: ClientSettings;
    initialWaterfallSettings: WaterfallSettings;
    onAudioChunk?: (pcm: Float32Array) => void; // <-- 1. ADD THIS LINE
}

/**
 * The main headless hook for the Core Cast SDR client.
 * Manages WebSockets, AudioContext, and state.
 */
export function useCoreCast({
    audioUrl,
    waterfallUrl,
    initialSpan,
    initialSettings,
    initialWaterfallSettings,
    onAudioChunk, // <-- 2. GET THE PROP
}: CoreCastOptions) {
    /* ▼▼▼ Audio ▼▼▼ */
    const [volume, setVolume] = useState(30);
    const [audioDb, setAudioDb] = useState(-120);
    const [isPlaying, setIsPlaying] = useState(false);

    /* ▼▼▼ Audio Context ▼▼▼ */
    const audioWS = useRef<WebSocket | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const timelineRef = useRef(0);

    /* ▼▼▼ Waterfall / Span ▼▼▼ */
    const wfWS = useRef<WebSocket | null>(null);
    const [span, setSpan] = useState(initialSpan);
    const [latestLine, setLatestLine] = useState<number[]>([]);

    /* ▼▼▼ Settings ▼▼▼ */
    const [clientSettings, setClientSettings] = useState<ClientSettings>(initialSettings);
    const [waterfallSettings, setWaterfallSettings] = useState<WaterfallSettings>(initialWaterfallSettings);

    function scheduleBuffer(ctx: AudioContext, pcm: Float32Array) {
        const safePCM = new Float32Array(pcm);
        const buf = ctx.createBuffer(1, safePCM.length, RATE);
        buf.copyToChannel(safePCM, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        if (gainRef.current) {
            src.connect(gainRef.current);
        } else {
            src.connect(ctx.destination);
        }
        if (timelineRef.current < ctx.currentTime) timelineRef.current = ctx.currentTime + 0;
        src.start(timelineRef.current);
        timelineRef.current += safePCM.length / RATE;
    }

    function ensureGain() {
        const ctx = ctxRef.current!;
        if (!gainRef.current) {
            gainRef.current = ctx.createGain();
            gainRef.current.gain.value = volume / 100;
            gainRef.current.connect(ctx.destination);
        }
    }

    /* ── AUDIO WebSocket ────────────────────────────────── */
    function openAudioWS() {
        if (audioWS.current) return;
        const ws = new WebSocket(audioUrl);
        ws.binaryType = 'arraybuffer';

        const PREBUF_SEC = 0.4;
        const GUARD_SEC = 0.2;
        const queue: Float32Array[] = [];
        let pumpOn = false;
        let levelSmooth = -120;

        function pump() {
            const ctx = ctxRef.current;
            if (!ctx || ctx.state !== 'running') return;
            while (queue.length && timelineRef.current - ctx.currentTime < GUARD_SEC - 0.005) {
                scheduleBuffer(ctx, queue.shift()!);
            }
            requestAnimationFrame(pump);
        }

        ws.onopen = () => {
            setIsPlaying(true);
            ws.send(JSON.stringify({ type: 'tune', ...clientSettings }));
        };
        ws.onclose = () => {
            setIsPlaying(false);
            audioWS.current = null;
        };
        ws.onerror = (e) => console.error('audio WS error', e);

        ws.onmessage = (ev) => {
            if (typeof ev.data === 'string') return;
            const pcmF32 = new Float32Array(ev.data);

            // <-- 3. ADD THIS LINE
            if (onAudioChunk) {
                onAudioChunk(pcmF32);
            }

            queue.push(pcmF32);

            let sum = 0;
            for (let i = 0; i < pcmF32.length; i++) sum += pcmF32[i] * pcmF32[i];
            const db = 10 * Math.log10(sum / pcmF32.length + 1e-12);
            levelSmooth = levelSmooth * 0.9 + db * 0.1;
            setAudioDb(levelSmooth);

            if (!pumpOn && queue.length * 0.02 >= PREBUF_SEC) {
                pumpOn = true;
                pump();
            }
        };
        audioWS.current = ws;
    }

    async function sendTune() {
        openAudioWS();
        if (!audioWS.current) return;
        if (audioWS.current.readyState === WebSocket.CONNECTING) {
            await new Promise<void>((res) => audioWS.current!.addEventListener('open', () => res(), { once: true }));
        }
        if (audioWS.current.readyState === WebSocket.OPEN) {
            audioWS.current.send(JSON.stringify({ type: 'tune', ...clientSettings }));
        }
    }

    /* ── WATERFALL WebSocket ───────────────────────────── */
    function openWfWS() {
        if (wfWS.current) return;
        const ws = new WebSocket(waterfallUrl);
        wfWS.current = ws;

        ws.onmessage = (ev) => {
            const pkt = JSON.parse(ev.data);
            if (pkt.type === 'waterfall') {
                setLatestLine(pkt.data);
            }
        };
        ws.onclose = () => { wfWS.current = null; };
        ws.onerror = (e) => console.error('wf WS error', e);
    }

    async function sendSpan() {
        openWfWS();
        if (!wfWS.current) return;
        if (wfWS.current.readyState === WebSocket.CONNECTING) {
            await new Promise<void>((res) => wfWS.current!.addEventListener('open', () => res(), { once: true }));
        }
        if (wfWS.current.readyState === WebSocket.OPEN) {
            wfWS.current.send(JSON.stringify({ type: 'span', min: span.min, max: span.max }));
        }
    }

    /* ── Public Actions (Play/Stop) ────────────────────── */
    async function play() {
        if (!ctxRef.current) ctxRef.current = new AudioContext({ sampleRate: RATE });
        if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
        ensureGain();
        openAudioWS();
        await sendTune();
    }

    function stop() {
        audioWS.current?.close();
        audioWS.current = null;
        setIsPlaying(false);
        ctxRef.current?.close();
        ctxRef.current = null;
        timelineRef.current = 0;
    }

    /* ── Effects to Sync State ─────────────────────────── */
    useEffect(() => {
        if (isPlaying) {
            sendTune();
        }
    }, [clientSettings, isPlaying]);

    useEffect(() => {
        sendSpan();
    }, [span]);

    useEffect(() => {
        if (gainRef.current) {
            gainRef.current.gain.value = volume / 100;
        }
    }, [volume]);

    useEffect(() => {
        openWfWS();
        return () => {
            wfWS.current?.close();
        };
    }, [waterfallUrl]);

    // --- Return the Public API ---
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
