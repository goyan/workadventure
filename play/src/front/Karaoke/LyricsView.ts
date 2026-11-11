import type { LyricLine } from "./Lrc";

/**
 * How far the playback is through a line, from 0 to 1: a line ends where the next later one starts, the last one
 * with the track. Undefined when that end is unknown: LRC lines only carry their start.
 */
export function lyricLineProgress(
    lines: readonly LyricLine[],
    index: number,
    positionMs: number,
    trackDurationMs?: number,
): number | undefined {
    const line = lines.at(index);
    if (!line || index < 0) return undefined;
    // Lines sharing a timestamp end together.
    const endMs = lines.slice(index + 1).find((next) => next.atMs > line.atMs)?.atMs ?? trackDurationMs;
    if (endMs === undefined || endMs <= line.atMs) return undefined;
    return Math.min(1, Math.max(0, (positionMs - line.atMs) / (endMs - line.atMs)));
}

/** The scroll position that shows a line in the middle of its view. */
export function centeredScrollTop(lineTop: number, lineHeight: number, viewHeight: number): number {
    return Math.max(0, lineTop - (viewHeight - lineHeight) / 2);
}
