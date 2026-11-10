export interface LyricLine {
    atMs: number;
    text: string;
}

/** LRC's offset is subtracted from timestamps: a positive value displays lyrics earlier. */
export function parseLrc(lrc: string): LyricLine[] {
    const offset = Number(/^\[offset:([+-]?\d+)\]\s*$/im.exec(lrc)?.[1] ?? 0);
    const lines: LyricLine[] = [];
    for (const line of lrc.split(/\r?\n/)) {
        const timestamps = [...line.matchAll(/\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
        if (!timestamps.length) continue;
        const text = line.slice((timestamps.at(-1)?.index ?? 0) + (timestamps.at(-1)?.[0].length ?? 0)).trim();
        for (const timestamp of timestamps) {
            const fraction = Number(`0.${timestamp[3] ?? "0"}`);
            lines.push({
                atMs: Math.max(
                    0,
                    Math.round((Number(timestamp[1]) * 60 + Number(timestamp[2]) + fraction) * 1000) - offset,
                ),
                text,
            });
        }
    }
    return lines.sort((left, right) => left.atMs - right.atMs);
}

/** The last line starting at or before the playback position, including empty lines for musical gaps. */
export function activeLyricIndex(lines: readonly LyricLine[], positionMs: number): number {
    let low = 0;
    let high = lines.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (lines[middle].atMs <= positionMs) low = middle + 1;
        else high = middle;
    }
    return low - 1;
}
