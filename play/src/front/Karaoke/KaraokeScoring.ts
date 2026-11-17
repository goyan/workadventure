import type { KaraokeNote } from "@workadventure/map-editor";

export interface KaraokeScore {
    score: number;
    accuracy: number;
    coverage: number;
    combo: number;
}
const STEP_MS = 50;

/** Octave-equivalent: different vocal ranges can sing the same melody. */
export function karaokePitchDistance(midi: number, expected: number): number {
    return Math.abs(((((midi - expected + 6) % 12) + 12) % 12) - 6);
}

/** Fixed time cells make silence count and prevent seeks/repeated frames inflating the score. */
export class KaraokeScoring {
    private readonly cells = new Map<number, number>();
    private readonly total: number;
    public constructor(private readonly notes: readonly KaraokeNote[]) {
        this.total = notes.reduce(
            (sum, note) => sum + Math.ceil((note.endMs - note.startMs) / STEP_MS) * (note.golden ? 2 : 1),
            0,
        );
    }
    public sample(positionMs: number, midi: number | undefined): KaraokeScore {
        const index = this.notes.findIndex((note) => positionMs >= note.startMs && positionMs < note.endMs);
        const note = this.notes[index];
        if (note) {
            const key = index * 20_000 + Math.floor((positionMs - note.startMs) / STEP_MS);
            if (!this.cells.has(key))
                this.cells.set(
                    key,
                    midi === undefined
                        ? 0
                        : Math.max(0, 1 - Math.max(0, karaokePitchDistance(midi, note.midi) - 0.25) / 1.25),
                );
        }
        return this.result();
    }
    /** The note sung at this position, -1 between notes. */
    public indexAt(positionMs: number): number {
        return this.notes.findIndex((note) => positionMs >= note.startMs && positionMs < note.endMs);
    }
    /** How well a whole note was sung, 0 to 1: its unheard moments count as missed. */
    public judge(index: number): number {
        const note = this.notes[index];
        if (!note) return 0;
        const count = Math.ceil((note.endMs - note.startMs) / STEP_MS);
        let quality = 0;
        for (let cell = 0; cell < count; cell++) quality += this.cells.get(index * 20_000 + cell) ?? 0;
        return count === 0 ? 0 : quality / count;
    }
    /** The notes in a row sung well up to now; the best run is the combo of the result. */
    public streak(): number {
        let streak = 0;
        for (let index = 0; index < this.notes.length; index++) {
            const note = this.notes[index];
            const count = Math.ceil((note.endMs - note.startMs) / STEP_MS);
            let seen = false;
            for (let cell = 0; cell < count && !seen; cell++) seen = this.cells.has(index * 20_000 + cell);
            if (seen) streak = this.judge(index) >= 0.6 ? streak + 1 : 0;
        }
        return streak;
    }
    public result(): KaraokeScore {
        let points = 0,
            perfectPoints = 0,
            earned = 0,
            assessed = 0,
            streak = 0,
            best = 0;
        for (let index = 0; index < this.notes.length; index++) {
            const note = this.notes[index];
            const weight = note.golden ? 2 : 1;
            const count = Math.ceil((note.endMs - note.startMs) / STEP_MS);
            // A flawless run is on its index-th note in a row: the multiplier it would have reached.
            perfectPoints += count * weight * karaokeMultiplier(index);
            let quality = 0,
                seen = 0;
            for (let cell = 0; cell < count; cell++) {
                const value = this.cells.get(index * 20_000 + cell);
                if (value !== undefined) {
                    earned += value * weight;
                    assessed += weight;
                    quality += value;
                    seen++;
                }
            }
            if (seen > 0) {
                points += quality * weight * karaokeMultiplier(streak);
                streak = quality / count >= 0.6 ? streak + 1 : 0;
                best = Math.max(best, streak);
            }
        }
        return {
            score: perfectPoints === 0 ? 0 : Math.round((points / perfectPoints) * 10_000),
            accuracy: assessed === 0 ? 0 : Math.round((earned / assessed) * 100),
            coverage: this.total === 0 ? 0 : Math.round((assessed / this.total) * 100),
            combo: best,
        };
    }
}

/** Notes sung well in a row needed for each multiplier: ×2 after 4, ×3 after 8, ×4 after 12. */
export const KARAOKE_MULTIPLIER_STEP = 4;
export const KARAOKE_MAX_MULTIPLIER = 4;

/** The points multiplier a run of notes sung well has reached. */
export function karaokeMultiplier(streak: number): number {
    return Math.min(KARAOKE_MAX_MULTIPLIER, 1 + Math.floor(streak / KARAOKE_MULTIPLIER_STEP));
}

/** The recorded reference only stores timed notes: no microphone audio is retained. */
export function appendReferenceNote(
    notes: readonly KaraokeNote[],
    positionMs: number,
    midi: number | undefined,
): KaraokeNote[] {
    if (midi === undefined || positionMs < 0 || positionMs > 899_900 || notes.length >= 2000) return [...notes];
    const pitch = Math.round(midi);
    const last = notes.at(-1);
    if (!Number.isFinite(midi) || pitch < 24 || pitch > 108 || !Number.isFinite(positionMs)) return [...notes];
    if (last && positionMs + STEP_MS <= last.endMs) return [...notes];
    if (last && last.midi === pitch && positionMs - last.endMs <= 100)
        return [...notes.slice(0, -1), { ...last, endMs: positionMs + STEP_MS }];
    return [
        ...notes,
        { startMs: Math.max(positionMs, last?.endMs ?? 0), endMs: positionMs + STEP_MS, midi: pitch, golden: false },
    ];
}
