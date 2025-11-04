// packages/headless/src/types.ts

// The demodulator settings
export interface ClientSettings {
    freq: number;
    mode: 'wbfm' | 'nbfm' | 'am' | 'lsb' | 'usb';
    bw: number;
    nr: boolean;
    notch: boolean;
    sql: number;
}

// The waterfall display settings
export interface WaterfallSettings {
    min: number;
    max: number;
    zoom: number;
}

// ▼▼▼ ADD THIS INTERFACE ▼▼▼
// Represents a finished recording
export interface Recording {
    name: string;
    url: string;
}
