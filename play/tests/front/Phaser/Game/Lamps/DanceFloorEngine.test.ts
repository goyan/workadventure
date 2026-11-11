import { describe, expect, it } from "vitest";
import {
    DANCE_FLOOR_BEATS_PER_PATTERN,
    DanceFloorEngine,
    idlePatternAt,
    idleSchedule,
    type DanceFloorMusic,
} from "../../../../../src/front/Phaser/Game/Lamps/DanceFloorEngine";
import { DANCE_FLOOR_PATTERNS, type FloorGrid } from "../../../../../src/front/Phaser/Game/Lamps/DanceFloorPatterns";
import { LAMP_MIN_FLASH_INTERVAL_MS } from "../../../../../src/front/Phaser/Game/Lamps/LampSignal";

const GRID: FloorGrid = { cols: 12, rows: 10 };
const TILES = GRID.cols * GRID.rows;
const FRAME_MS = 16;
const START = 1_700_000_000_000;

interface Run {
    /** The level of every tile at every image. */
    levels: Float32Array[];
    times: number[];
}

function run(options: {
    engine?: DanceFloorEngine;
    from?: number;
    durationMs: number;
    reducedMotion?: boolean;
    music?: (now: number, index: number) => DanceFloorMusic | undefined;
}): Run {
    const engine = options.engine ?? new DanceFloorEngine(GRID, 1);
    const levels: Float32Array[] = [];
    const times: number[] = [];
    const from = options.from ?? START;
    for (let index = 0; index * FRAME_MS <= options.durationMs; index++) {
        const now = from + index * FRAME_MS;
        engine.update({ now, music: options.music?.(now, index), reducedMotion: options.reducedMotion ?? false });
        levels.push(engine.levels.slice());
        times.push(now);
    }
    return { levels, times };
}

/** The most times one tile lights up (goes from dark to lit) within any one second. */
function mostFlashesInOneSecond({ levels, times }: Run): number {
    let most = 0;
    for (let tile = 0; tile < TILES; tile++) {
        const rises: number[] = [];
        for (let index = 1; index < levels.length; index++) {
            if (levels[index - 1][tile] < 0.5 && levels[index][tile] >= 0.5) rises.push(times[index]);
        }
        for (let first = 0; first < rises.length; first++) {
            let count = 0;
            for (let next = first; next < rises.length && rises[next] - rises[first] < 1000; next++) count++;
            most = Math.max(most, count);
        }
    }
    return most;
}

/** Two floors show the same thing: no tile is lit on one and dark on the other. */
function expectSameFloor(one: DanceFloorEngine, two: DanceFloorEngine): void {
    for (let tile = 0; tile < TILES; tile++) {
        expect(Math.abs(one.levels[tile] - two.levels[tile])).toBeLessThan(0.2);
    }
}

/** A beat at every image: far more than any music, and than the ceiling. */
const beatAtEveryImage = (): DanceFloorMusic => ({ beat: true, bass: 1 });
/** A steady beat at this tempo. */
const tempo =
    (bpm: number) =>
    (now: number): DanceFloorMusic => {
        const beatMs = 60_000 / bpm;
        return { beat: (now - START) % beatMs < FRAME_MS, bass: 0.5 };
    };

describe("the patterns without music", () => {
    it("change every 10 to 20 seconds, never twice the same in a row, through every pattern", () => {
        for (const seed of [0, 1, 42, 1234567]) {
            const schedule = idleSchedule(seed);
            expect(new Set(schedule.map((slot) => slot.pattern)).size).toBe(DANCE_FLOOR_PATTERNS.length);
            schedule.forEach((slot, index) => {
                expect(slot.durationMs).toBeGreaterThanOrEqual(10_000);
                expect(slot.durationMs).toBeLessThanOrEqual(20_000);
                expect(slot.pattern).not.toBe(schedule[(index + 1) % schedule.length].pattern);
            });
        }
    });

    it("follow the schedule along the clock, and start it again at its end", () => {
        const schedule = idleSchedule(7);
        const cycle = schedule.reduce((sum, slot) => sum + slot.durationMs, 0);
        let startsAt = 0;
        for (const slot of schedule) {
            expect(idlePatternAt(7, startsAt).pattern).toBe(slot.pattern);
            expect(idlePatternAt(7, startsAt + slot.durationMs - 1).pattern).toBe(slot.pattern);
            expect(idlePatternAt(7, cycle * 3 + startsAt + 5).pattern).toBe(slot.pattern);
            startsAt += slot.durationMs;
        }
    });

    it("pass from one to the next with a soft transition: the next one comes in before the end", () => {
        const schedule = idleSchedule(7);
        const first = schedule[0];
        expect(idlePatternAt(7, first.durationMs / 2).blend).toBe(0);
        const closing = idlePatternAt(7, first.durationMs - 500);
        expect(closing.next).toBe(schedule[1].pattern);
        expect(closing.blend).toBeGreaterThan(0);
        expect(closing.blend).toBeLessThan(1);
    });

    it("keep moving for ever with no music at all", () => {
        const { levels } = run({ durationMs: 30_000 });
        const pictures = new Set(
            levels
                .filter((_, index) => index % 60 === 0)
                .map((image) => [...image].map((l) => (l >= 0.5 ? 1 : 0)).join("")),
        );
        expect(pictures.size).toBeGreaterThan(10);
        // Once the first fade is over, some tiles shine at every image, and never the whole floor (a tile that goes
        // out is still half lit while the next one lights up: only the fully lit ones are counted).
        for (const image of levels.slice(60)) {
            expect(image.some((level) => level >= 0.5)).toBe(true);
            expect(image.every((level) => level >= 0.8)).toBe(false);
        }
    });

    it("show every player the same floor at the same time", () => {
        const one = new DanceFloorEngine(GRID, 99);
        const two = new DanceFloorEngine(GRID, 99);
        // The second player arrived later: their floor still shows the same pattern.
        run({ engine: one, durationMs: 8000 });
        run({ engine: two, from: START + 5008, durationMs: 2992 });
        expectSameFloor(one, two);
    });
});

describe("fades", () => {
    it("lights and puts out a tile over several images: no tile jumps", () => {
        const { levels } = run({ durationMs: 20_000 });
        let largest = 0;
        for (let index = 1; index < levels.length; index++) {
            for (let tile = 0; tile < TILES; tile++) {
                largest = Math.max(largest, Math.abs(levels[index][tile] - levels[index - 1][tile]));
            }
        }
        expect(largest).toBeGreaterThan(0);
        expect(largest).toBeLessThan(0.35);
    });

    it("does not depend on the frame rate", () => {
        const at60 = new DanceFloorEngine(GRID, 5);
        const at30 = new DanceFloorEngine(GRID, 5);
        for (let now = START; now < START + 3000; now += 1000 / 60) {
            at60.update({ now, music: undefined, reducedMotion: false });
        }
        for (let now = START; now < START + 3000; now += 1000 / 30) {
            at30.update({ now, music: undefined, reducedMotion: false });
        }
        at60.update({ now: START + 3000, music: undefined, reducedMotion: false });
        at30.update({ now: START + 3000, music: undefined, reducedMotion: false });
        expectSameFloor(at30, at60);
    });
});

describe("the patterns on the music of a Jam", () => {
    it("move one step on each beat, and wait for the next one", () => {
        const engine = new DanceFloorEngine(GRID, 1);
        const beatAt = [START + 1000, START + 1500, START + 2000];
        const steps: number[] = [];
        for (let now = START; now <= START + 2400; now += FRAME_MS) {
            const beat = beatAt.some((at) => now >= at && now < at + FRAME_MS);
            engine.update({ now, music: { beat, bass: 0.4 }, reducedMotion: false });
            steps.push(engine.step);
        }
        const at = (ms: number): number => steps[Math.floor(ms / FRAME_MS)];
        expect(at(1100) - at(900)).toBe(1);
        // Between two beats, nothing moves on.
        expect(at(1450) - at(1100)).toBe(0);
        expect(at(1600) - at(1450)).toBe(1);
        expect(at(2390) - at(900)).toBe(3);
    });

    it("pass to the next pattern every 16 beats", () => {
        expect(DANCE_FLOOR_BEATS_PER_PATTERN).toBe(16);
        const engine = new DanceFloorEngine(GRID, 1);
        const seen: string[] = [];
        for (let now = START; now <= START + 40 * 500; now += FRAME_MS) {
            engine.update({ now, music: tempo(120)(now), reducedMotion: false });
            if (seen[seen.length - 1] !== engine.patternName) seen.push(engine.patternName);
        }
        // 40 beats: the third pattern has begun, not the fourth.
        expect(seen).toHaveLength(3);
        expect(new Set(seen).size).toBe(3);
    });

    it("keeps moving through a passage without beats", () => {
        const { levels } = run({ durationMs: 12_000, music: () => ({ beat: false, bass: 0.1 }) });
        const pictures = new Set(
            levels
                .filter((_, index) => index % 60 === 0)
                .map((image) => [...image].map((l) => (l >= 0.5 ? 1 : 0)).join("")),
        );
        expect(pictures.size).toBeGreaterThan(3);
    });

    it("glows brighter on the beat, then settles", () => {
        const engine = new DanceFloorEngine(GRID, 1);
        let now = START;
        for (; now < START + 2000; now += FRAME_MS) {
            engine.update({ now, music: { beat: false, bass: 0 }, reducedMotion: false });
        }
        const before = engine.glow;
        engine.update({ now, music: { beat: true, bass: 0.8 }, reducedMotion: false });
        const onBeat = engine.glow;
        for (now += FRAME_MS; now < START + 3200; now += FRAME_MS) {
            engine.update({ now, music: { beat: false, bass: 0 }, reducedMotion: false });
        }
        expect(onBeat).toBeGreaterThan(before);
        expect(engine.glow).toBeLessThan(onBeat);
        expect(engine.glow).toBeCloseTo(before, 1);
    });
});

describe("photosensitivity (WCAG 2.3.1)", () => {
    it("never lights a tile more than three times a second, whatever the beats", () => {
        expect(mostFlashesInOneSecond(run({ durationMs: 20_000, music: beatAtEveryImage }))).toBeLessThanOrEqual(3);
        expect(mostFlashesInOneSecond(run({ durationMs: 20_000, music: tempo(240) }))).toBeLessThanOrEqual(3);
    });

    it("never lights a tile more than three times a second without music either", () => {
        expect(mostFlashesInOneSecond(run({ durationMs: 60_000 }))).toBeLessThanOrEqual(3);
    });

    it("takes a beat for the glow no more than three times a second", () => {
        const engine = new DanceFloorEngine(GRID, 1);
        const kicks: number[] = [];
        let previous = 0;
        for (let now = START; now <= START + 5000; now += FRAME_MS) {
            engine.update({ now, music: beatAtEveryImage(), reducedMotion: false });
            if (engine.glow > previous + 0.05) kicks.push(now);
            previous = engine.glow;
        }
        expect(kicks.length).toBeGreaterThan(5);
        for (let index = 1; index < kicks.length; index++) {
            expect(kicks[index] - kicks[index - 1]).toBeGreaterThanOrEqual(LAMP_MIN_FLASH_INTERVAL_MS);
        }
    });
});

describe("reduced motion", () => {
    it("ignores the beats: the floor is the same with and without them", () => {
        const withBeats = run({ durationMs: 10_000, reducedMotion: true, music: beatAtEveryImage });
        const without = run({ durationMs: 10_000, reducedMotion: true });
        expect(withBeats.levels[withBeats.levels.length - 1]).toEqual(without.levels[without.levels.length - 1]);
    });

    it("does not flash: a tile needs more than a second to light or go out", () => {
        const { levels } = run({ durationMs: 40_000, reducedMotion: true });
        const perSecond = Math.round(1000 / FRAME_MS);
        let largest = 0;
        for (let index = perSecond; index < levels.length; index++) {
            for (let tile = 0; tile < TILES; tile++) {
                largest = Math.max(largest, Math.abs(levels[index][tile] - levels[index - perSecond][tile]));
            }
        }
        expect(largest).toBeLessThan(0.75);
    });

    it("keeps a steady glow, with no kick on the beat", () => {
        const engine = new DanceFloorEngine(GRID, 1);
        const glows = new Set<number>();
        for (let now = START; now <= START + 3000; now += FRAME_MS) {
            engine.update({ now, music: beatAtEveryImage(), reducedMotion: true });
            glows.add(engine.glow);
        }
        expect(glows.size).toBe(1);
    });

    it("still moves, slowly", () => {
        const { levels } = run({ durationMs: 40_000, reducedMotion: true });
        const pictures = new Set(
            levels
                .filter((_, index) => index % 250 === 0)
                .map((image) => [...image].map((l) => (l >= 0.5 ? 1 : 0)).join("")),
        );
        expect(pictures.size).toBeGreaterThan(3);
    });
});

describe("what is drawn", () => {
    it("writes one pixel per tile: dark at rest, in the colour of the tile when lit", () => {
        const engine = new DanceFloorEngine(GRID, 1);
        run({ engine, durationMs: 3000 });
        const tiles = new Uint8ClampedArray(TILES * 4);
        const glow = new Uint8ClampedArray(TILES * 4);
        engine.paint(tiles, glow);
        let lit = 0;
        for (let tile = 0; tile < TILES; tile++) {
            const [red, green, blue, alpha] = tiles.slice(tile * 4, tile * 4 + 4);
            expect(alpha).toBe(255);
            const brightest = Math.max(red, green, blue);
            if (engine.levels[tile] >= 0.9) {
                lit++;
                expect(brightest).toBeGreaterThan(150);
            } else if (engine.levels[tile] <= 0.02) {
                // Night blue: nearly black, a little more blue than anything else.
                expect(brightest).toBeLessThan(90);
                expect(blue).toBeGreaterThanOrEqual(red);
                // The halo of light is drawn over the lit tiles only.
                expect(Math.max(glow[tile * 4], glow[tile * 4 + 1], glow[tile * 4 + 2])).toBeLessThan(12);
            }
        }
        expect(lit).toBeGreaterThan(0);
    });
});
