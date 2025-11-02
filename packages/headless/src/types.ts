// packages/headless/src/types.ts

/**
 * All configurable client-side DSP parameters
 * that are sent to the server.
 */
export interface ClientSettings {
    freq: number;
    mode: 'wbfm' | 'nbfm' | 'am' | 'usb' | 'lsb';
    bw: number;
    nr: boolean;
    notch: boolean;
    sql: number;
}

/**
 * Configuration for the waterfall display.
 */
export interface WaterfallSettings {
    min: number;
    max: number;
    zoom: number; // This was in your sdr.tsx
}

/**
 * A single audio recording, saved in the browser.
 */
export interface Recording {
    name: string;
    url: string;
}
