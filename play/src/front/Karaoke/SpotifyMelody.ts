import { KaraokeReferenceSchema, KaraokeReferenceSource } from "@workadventure/map-editor";
import type { KaraokeNote, KaraokeReference } from "@workadventure/map-editor";
import type { DesktopSpotifyAnalysis } from "../Interfaces/DesktopAppInterfaces";
import type { LyricLine } from "./Lrc";

/** A line is sung for this long at most: the rest, until the next line, is an instrumental part. */
const MAX_LINE_MS = 8000;
/** Quieter segments are breaths and fades, not a sung note. */
const MIN_LOUDNESS_DB = -35;
const MERGE_GAP_MS = 80;
const MIN_NOTE_MS = 120;
const MIN_GOLDEN_MS = 600;
const MIN_NOTES = 8;
const MAX_NOTES = 2000;
const MAX_MS = 900_000;

/**
 * An approximate melody from Spotify's analysis of the whole mix (no sound, only the strength of the 12 notes of each
 * segment): within the timed lines of the lyrics, the strongest note of each segment, held notes merged. The octave is
 * unknown, which the octave-free scoring ignores; the strongest note is the voice on most ballads, the chords or the bass
 * on busy tracks. The longest note of a line, when held, is golden.
 */
export function buildKaraokeMelody(
    analysis: DesktopSpotifyAnalysis,
    lines: readonly LyricLine[],
    track: Pick<KaraokeReference, "recordingKey" | "title" | "artist">,
): KaraokeReference | undefined {
    const windows = lines.flatMap((line, index) =>
        line.text.trim() === ""
            ? []
            : [{ start: line.atMs, end: Math.min(lines[index + 1]?.atMs ?? Infinity, line.atMs + MAX_LINE_MS) }],
    );
    const notes = analysis.segments.reduce<(KaraokeNote & { line: number })[]>(
        (melody, [startMs, durationMs, loudness, pitches]) => {
            const pitchClass = strongestNote(pitches);
            const middle = startMs + durationMs / 2;
            const line = windows.findIndex((window) => middle >= window.start && middle < window.end);
            if (pitchClass === undefined || loudness < MIN_LOUDNESS_DB || line < 0) return melody;
            const start = Math.max(startMs, windows[line].start, melody.at(-1)?.endMs ?? 0);
            const end = Math.min(startMs + durationMs, windows[line].end);
            if (end <= start) return melody;
            const last = melody.at(-1);
            if (last && last.line === line && last.midi === 60 + pitchClass && start - last.endMs <= MERGE_GAP_MS)
                return [...melody.slice(0, -1), { ...last, endMs: end }];
            return [...melody, { startMs: start, endMs: end, midi: 60 + pitchClass, golden: false, line }];
        },
        [],
    );
    const held = notes.filter((note) => note.endMs - note.startMs >= MIN_NOTE_MS && note.endMs <= MAX_MS);
    const longest = new Map<number, number>();
    for (const note of held) longest.set(note.line, Math.max(longest.get(note.line) ?? 0, note.endMs - note.startMs));
    const melody = held.slice(0, MAX_NOTES).map(({ line, ...note }) => ({
        ...note,
        golden: note.endMs - note.startMs >= MIN_GOLDEN_MS && note.endMs - note.startMs === longest.get(line),
    }));
    if (melody.length < MIN_NOTES) return undefined;
    const parsed = KaraokeReferenceSchema.safeParse({
        id: crypto.randomUUID(),
        ...track,
        source: KaraokeReferenceSource.Auto,
        notes: melody,
    });
    return parsed.success ? parsed.data : undefined;
}

/** The note clearly stronger than the others (0 to 11, C to B), none when two share the top. */
function strongestNote(pitches: string): number | undefined {
    const values = [...pitches].map(Number);
    const top = Math.max(...values);
    return values.filter((value) => value === top).length === 1 ? values.indexOf(top) : undefined;
}
