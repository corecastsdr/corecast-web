"use client";
import React, { useMemo } from "react";

interface Props {
    levelDb: number; // live value
    minDb: number;
    maxDb: number;
    widthPx: number;
    heightPx: number;
}

/* linear→px helper */
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

export default function LiveDbScale({
    levelDb,
    minDb,
    maxDb,
    widthPx,
    heightPx,
}: Props) {
    /* derived sizes (scale with height) */
    const font = Math.round(heightPx * 0.45);
    const tickLong = heightPx * 0.65;
    const tickShort = heightPx * 0.35;

    /* ticks every 10 dB, sub-ticks every 2 dB ------------------------ */
    const { ticks, sub } = useMemo(() => {
        const arr: number[] = [],
            subArr: number[] = [];
        for (let d = minDb; d <= maxDb; d += 2) {
            const x = lerp(0, widthPx, (d - minDb) / (maxDb - minDb));
            if (d % 10 === 0) arr.push(d, x);
            else subArr.push(x);
        }
        return { ticks: arr, sub: subArr };
    }, [minDb, maxDb, widthPx]);

    /* current indicator position */
    const curX = lerp(0, widthPx, (levelDb - minDb) / (maxDb - minDb));

    return (
        <svg width="100%" height={heightPx} viewBox={`0 0 ${widthPx} ${heightPx}`}>
            {/* background */}
            <rect
                x="0"
                y="0"
                width={widthPx}
                height={heightPx}
                fill="#101010"
                rx="4"
                ry="4"
            />
            {/* green fill */}
            <rect x="0" y="0" width={curX} height={heightPx} fill="#114a00" />

            {/* long ticks + labels */}
            {ticks.map((v, i) =>
                i % 2 ? null : (
                    <React.Fragment key={"tick-" + v}>
                        <line
                            x1={ticks[i + 1]}
                            x2={ticks[i + 1]}
                            y1={0} // <-- FIX: Start from top
                            y2={tickLong} // <-- FIX: Draw down
                            stroke="#fff"
                            strokeWidth="2"
                        />
                        <text
                            x={ticks[i + 1]}
                            // ▼▼▼ FIX: Draw text at the bottom ▼▼▼
                            y={heightPx - (font * 0.25)}
                            fill="#fff"
                            fontSize={font}
                            fontFamily="monospace"
                            textAnchor="middle"
                        >
                            {ticks[i]}
                        </text>
                    </React.Fragment>
                )
            )}

            {/* sub-ticks */}
            {sub.map((x) => (
                <line
                    key={"sub-" + x}
                    x1={x}
                    x2={x}
                    y1={0} // <-- FIX: Start from top
                    y2={tickShort} // <-- FIX: Draw down
                    stroke="#aaa"
                    strokeWidth="1"
                />
            ))}

            {/* live line */}
            <line
                x1={curX}
                x2={curX}
                y1="0"
                y2={heightPx}
                stroke="#ffff00"
                strokeWidth="3"
            />
        </svg>
    );
}
