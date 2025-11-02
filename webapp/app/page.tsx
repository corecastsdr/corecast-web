'use client';

import React from 'react';

// 1. Import from the package root
import { useCoreCast, type ClientSettings, type WaterfallSettings } from '@corecast/headless';

// 2. Import both components from the UI package
import { PSDChart, Waterfall } from '@corecast/ui'; // <-- IMPORT WATERFALL

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

/**
 * A simple demo page to test the PSDChart and Waterfall.
 */
export default function HomePage() {

    // 3. Call the master hook
    const {
        isPlaying,
        latestLine,
        span,
        clientSettings,
        waterfallSettings, // <-- Get waterfall settings
        play,
        stop,
        setSpan, // <-- Get setSpan for pan/zoom
        setClientSettings, // <-- Get setClientSettings for tuning
    } = useCoreCast({
        audioUrl: AUDIO_WS_URL,
        waterfallUrl: WF_WS_URL,
        initialSettings: INITIAL_SETTINGS,
        initialSpan: INITIAL_SPAN,
        initialWaterfallSettings: INITIAL_WATERFALL_SETTINGS,
    });

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

                {/* 4. ADD A SLIDER FOR TUNING */}
                <div style={{ marginTop: '2rem' }}>
                    <label htmlFor="freqSlider" style={{ display: 'block', marginBottom: '0.5rem' }}>
                        Tune Frequency: {(clientSettings.freq / 1_000_000).toFixed(3)} MHz
                    </label>
                    <input
                        type="range"
                        id="freqSlider"
                        style={{ width: '100%' }}
                        min={TOTAL_MIN}
                        max={TOTAL_MAX}
                        step="10000" // 10 kHz steps
                        value={clientSettings.freq}
                        onChange={(e) => {
                            setClientSettings(cs => ({ ...cs, freq: Number(e.target.value) }));
                        }}
                    />
                </div>

                {/* 5. Render the PSDChart component */}
                <div style={{ marginTop: '1rem', border: '1px solid #555' }}>
                    <PSDChart
                        spanMaxHz={span.max}
                        spanMinHz={span.min}
                        bwHz={clientSettings.bw}
                        tuneHz={clientSettings.freq}
                        inputData={latestLine}
                    />
                </div>

                {/* 6. RENDER THE NEW WATERFALL COMPONENT */}
                <div style={{ marginTop: '1rem' }}>
                    <Waterfall
                        samples={latestLine} // Pass the latest line (it handles scrolling)
                        width={CANVAS_W}
                        height={450}
                        minDB={waterfallSettings.min}
                        maxDB={waterfallSettings.max}
                        spanMinHz={span.min}
                        spanMaxHz={span.max}
                        tuneHz={clientSettings.freq}
                        bwHz={clientSettings.bw}
                        // This connects the component's pan/zoom to our state!
                        onSpanChange={(newMin, newMax) => {
                            setSpan({ min: newMin, max: newMax });
                        }}
                    />
                </div>
            </div>
        </main>
    );
}
