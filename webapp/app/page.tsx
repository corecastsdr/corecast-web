'use client';

import React, { useState } from 'react';

// 1. Import from the package root
import { useCoreCast, type ClientSettings, type WaterfallSettings } from '@corecast/headless';

// 2. Import *all* our UI components
import { PSDChart, Waterfall, FrequencyScale, LiveDbScale } from '@corecast/ui';

// --- Hard-coded Configuration for Testing ---
const WS_IP = '192.168.1.213'; // Your IP
const AUDIO_WS_URL = `ws://${WS_IP}:3050`;
const WF_WS_URL = `ws://${WS_IP}:3051`;

const TOTAL_MIN = 102.9e6;
const TOTAL_MAX = TOTAL_MIN + 2.048e6;
const CANVAS_W = 1024; // Logical width for components

const INITIAL_SETTINGS: ClientSettings = {
    freq: 104_300_000,
    mode: 'wbfm',
    bw: 150_000,
    nr: false,
    notch: false,
    sql: -60,
};
const INITIAL_SPAN = { min: TOTAL_MIN, max: TOTAL_MAX };
const INITIAL_WATERFALL_SETTINGS: WaterfallSettings = { min: 0, max: 50, zoom: 0 };
// --- End Configuration ---

export default function HomePage() {

    // 3. Call the master hook
    const {
        isPlaying,
        audioDb,
        latestLine,
        span,
        clientSettings,
        waterfallSettings,
        play,
        stop,
        setSpan,
        setClientSettings,
        setWaterfallSettings,
    } = useCoreCast({
        audioUrl: AUDIO_WS_URL,
        waterfallUrl: WF_WS_URL,
        initialSettings: INITIAL_SETTINGS,
        initialSpan: INITIAL_SPAN,
        initialWaterfallSettings: INITIAL_WATERFALL_SETTINGS,
    });

    // --- State for "headless" toggles ---
    const [showPsd, setShowPsd] = useState(true);
    const [showWaterfall, setShowWaterfall] = useState(true);

    // --- Classic CSS Styles ---
    const styles = {
        panel: {
            backgroundColor: '#333',
            border: '1px solid #555',
            padding: '16px',
            marginTop: '16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            fontFamily: 'Arial, sans-serif',
        },
        controlGroup: {
            display: 'flex',
            flexDirection: 'column' as const,
        },
        label: {
            display: 'block',
            marginBottom: '5px',
            fontSize: '14px',
            color: '#eee',
        },
        value: {
            color: '#aaa',
            fontSize: '12px',
            marginLeft: '8px',
        },
        slider: {
            width: '100%',
        },
        select: {
            padding: '5px',
            backgroundColor: '#222',
            color: 'white',
            border: '1px solid #777',
            borderRadius: '4px',
            fontSize: '14px',
        },
        meter: {
            gridColumn: '1 / -1',
            width: '400px',
            margin: '0 auto',
            marginBottom: '10px',
        },
        toggleGroup: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#eee',
            fontSize: '14px',
        },
        chartContainer: {
            border: '1px solid #555',
            marginTop: '1rem',
        }
    };

    return (
        <main style={{ backgroundColor: '#111', color: 'white', fontFamily: 'sans-serif' }}>
            <div style={{ padding: '2rem', maxWidth: '1200px', margin: 'auto' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    Core Cast Simple Demo
                </h1>

                <button
                    onClick={() => (isPlaying ? stop() : play())}
                    style={{
                        padding: '10px 20px',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                        marginTop: '1rem',
                        backgroundColor: isPlaying ? '#ff4136' : '#2ecc40',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px'
                    }}
                >
                    {isPlaying ? 'Stop Audio Stream' : 'Start Audio Stream'}
                </button>

                {/* --- Frequency Slider --- */}
                <div style={{ marginTop: '2rem' }}>
                    <label htmlFor="freqSlider" style={styles.label}>
                        Tune Frequency:
                        <span style={styles.value}>
                            {(clientSettings.freq / 1_000_000).toFixed(3)} MHz
                        </span>
                    </label>
                    <input
                        type="range" id="freqSlider" style={styles.slider}
                        min={TOTAL_MIN} max={TOTAL_MAX} step="10000"
                        value={clientSettings.freq}
                        onChange={(e) => {
                            setClientSettings(cs => ({ ...cs, freq: Number(e.target.value) }));
                        }}
                    />
                </div>

                {/* --- UNIFIED CHART CONTAINER --- */}
                <div style={styles.chartContainer}>

                    {/* --- PSD CHART (Conditional) --- */}
                    {showPsd && (
                        <div>
                            <PSDChart
                                width={CANVAS_W}
                                spanMaxHz={span.max}
                                spanMinHz={span.min}
                                bwHz={clientSettings.bw}
                                tuneHz={clientSettings.freq}
                                inputData={latestLine}
                                // ▼▼▼ FIX: REMOVED THESE TWO LINES ▼▼▼
                                // totalMinHz={TOTAL_MIN}
                                // totalMaxHz={TOTAL_MAX}
                            />
                        </div>
                    )}

                    {/* --- FREQUENCY SCALE (Moved) --- */}
                    <div>
                        <FrequencyScale
                            widthPx={CANVAS_W}
                            heightPx={40}
                            spanMinHz={span.min}
                            spanMaxHz={span.max}
                            tuneHz={clientSettings.freq}
                            bwHz={clientSettings.bw}
                            onChange={(newTune, newBw) =>
                                setClientSettings(cs => ({ ...cs, freq: newTune, bw: newBw }))
                            }
                        />
                    </div>

                    {/* --- WATERFALL (Conditional) --- */}
                    {showWaterfall && (
                        <div>
                            <Waterfall
                                samples={latestLine}
                                width={CANVAS_W}
                                height={450}
                                minDB={waterfallSettings.min}
                                maxDB={waterfallSettings.max}
                                spanMinHz={span.min}
                                spanMaxHz={span.max}
                                tuneHz={clientSettings.freq}
                                bwHz={clientSettings.bw}
                                onSpanChange={(newMin, newMax) => {
                                    setSpan({ min: newMin, max: newMax });
                                }}
                            />
                        </div>
                    )}
                </div>
                {/* === END OF UNIFIED CHART CONTAINER === */}


                {/* --- CLASSIC SETTINGS PANEL --- */}
                <div className="settings-panel" style={styles.panel}>

                    {/* --- Audio DB Meter --- */}
                    <div style={styles.meter}>
                        <LiveDbScale
                            levelDb={audioDb}
                            minDb={-80}
                            maxDb={0}
                            widthPx={CANVAS_W} // Logical width
                            heightPx={41}
                        />
                    </div>

                    {/* --- Waterfall Min dB --- */}
                    <div style={styles.controlGroup}>
                        <label htmlFor="wfMin" style={styles.label}>
                            WF Min <span style={styles.value}>({waterfallSettings.min} dB)</span>
                        </label>
                        <input
                            type="range" id="wfMin" style={styles.slider}
                            min={-100} max={0} step={1}
                            value={waterfallSettings.min}
                            onChange={e => setWaterfallSettings(s => ({ ...s, min: Number(e.target.value) }))}
                        />
                    </div>

                    {/* --- Waterfall Max dB --- */}
                    <div style={styles.controlGroup}>
                        <label htmlFor="wfMax" style={styles.label}>
                            WF Max <span style={styles.value}>({waterfallSettings.max} dB)</span>
                        </label>
                        <input
                            type="range" id="wfMax" style={styles.slider}
                            min={-50} max={50} step={1}
                            value={waterfallSettings.max}
                            onChange={e => setWaterfallSettings(s => ({ ...s, max: Number(e.target.value) }))}
                        />
                    </div>

                    {/* --- Demodulator Mode --- */}
                    <div style={styles.controlGroup}>
                        <label htmlFor="mode" style={styles.label}>Mode</label>
                        <select
                            id="mode" style={styles.select}
                            value={clientSettings.mode}
                            onChange={e => setClientSettings(cs => ({ ...cs, mode: e.target.value as ClientSettings['mode'] }))}
                        >
                            <option value="wbfm">Wide FM</option>
                            <option value="nbfm">Narrow FM</option>
                            <option value="am">AM</option>
                            <option value="lsb">LSB</option>
                            <option value="usb">USB</option>
                        </select>
                    </div>

                    {/* --- Bandwidth (BW) --- */}
                    <div style={styles.controlGroup}>
                        <label htmlFor="bw" style={styles.label}>
                            Bandwidth <span style={styles.value}>({(clientSettings.bw / 1000).toFixed(0)} kHz)</span>
                        </label>
                        <input
                            type="range" id="bw" style={styles.slider}
                            min={2000} max={250000} step={1000}
                            value={clientSettings.bw}
                            onChange={e => setClientSettings(cs => ({ ...cs, bw: Number(e.target.value) }))}
                        />
                    </div>

                    {/* --- Squelch (SQL) --- */}
                    <div style={styles.controlGroup}>
                        <label htmlFor="sql" style={styles.label}>
                            Squelch <span style={styles.value}>({clientSettings.sql} dB)</span>
                        </label>
                        <input
                            type="range" id="sql" style={styles.slider}
                            min={-100} max={0} step={1}
                            value={clientSettings.sql}
                            onChange={e => setClientSettings(cs => ({ ...cs, sql: Number(e.target.value) }))}
                        />
                    </div>

                    {/* --- Headless Toggles --- */}
                    <div style={styles.toggleGroup}>
                        <input
                            type="checkbox"
                            id="showPsd"
                            checked={showPsd}
                            onChange={e => setShowPsd(e.target.checked)}
                        />
                        <label htmlFor="showPsd">Show PSD Chart</label>
                    </div>

                    <div style={styles.toggleGroup}>
                        <input
                            type="checkbox"
                            id="showWaterfall"
                            checked={showWaterfall}
                            onChange={e => setShowWaterfall(e.target.checked)}
                        />
                        <label htmlFor="showWaterfall">Show Waterfall</label>
                    </div>

                </div>
            </div>
        </main>
    );
}
