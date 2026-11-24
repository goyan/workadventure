import { describe, expect, it } from "vitest";
import {
    appendKaraokeTrail,
    karaokeCountdown,
    karaokeJudgement,
    karaokeRank,
    karaokeRankWindow,
    karaokeStars,
} from "../../../src/front/Karaoke/KaraokeShow";
import { KaraokeScoring, karaokeMultiplier } from "../../../src/front/Karaoke/KaraokeScoring";

const lines = [
    { atMs: 10_000, text: "First verse" },
    { atMs: 13_000, text: "Second line" },
    { atMs: 16_000, text: "" },
    { atMs: 30_000, text: "Back after the solo" },
    { atMs: 50_000, text: "Long held line" },
];

describe("karaoke countdown", () => {
    it("counts in the first verse, one dot per second", () => {
        expect(karaokeCountdown(lines, 7_500, -1)).toEqual({ line: 0, beats: 3 });
        expect(karaokeCountdown(lines, 8_200, -1)).toEqual({ line: 0, beats: 2 });
        expect(karaokeCountdown(lines, 9_900, -1)).toEqual({ line: 0, beats: 1 });
    });
    it("waits until three seconds before the verse", () => {
        expect(karaokeCountdown(lines, 5_000, -1)).toBeUndefined();
    });
    it("stays quiet while sung lines follow each other", () => {
        expect(karaokeCountdown(lines, 11_000, 0)).toBeUndefined();
    });
    it("counts in after an instrumental line and after a long held line", () => {
        expect(karaokeCountdown(lines, 28_000, 2)).toEqual({ line: 3, beats: 2 });
        expect(karaokeCountdown(lines, 48_000, 3)).toEqual({ line: 4, beats: 2 });
    });
    it("has nothing to count after the last line", () => {
        expect(karaokeCountdown(lines, 60_000, 4)).toBeUndefined();
    });
});

describe("karaoke verdicts", () => {
    it.each([
        [1, "perfect"],
        [0.85, "perfect"],
        [0.7, "great"],
        [0.4, "good"],
        [0.1, "miss"],
    ] as const)("judges a note sung at %f as %s", (quality, judgement) => {
        expect(karaokeJudgement(quality)).toBe(judgement);
    });
    it("gives half stars and a rank out of the 10 000 points", () => {
        expect(karaokeStars(0)).toBe(0);
        expect(karaokeStars(5400)).toBe(2.5);
        expect(karaokeStars(10_000)).toBe(5);
        expect(karaokeRank(9500)).toBe("legend");
        expect(karaokeRank(8000)).toBe("star");
        expect(karaokeRank(6000)).toBe("rising");
        expect(karaokeRank(3000)).toBe("amateur");
        expect(karaokeRank(100)).toBe("shower");
    });
});

describe("karaoke voice trail", () => {
    it("keeps the last second and a half, in order", () => {
        const trail = [0, 500, 1000, 1500].reduce(
            (points, atMs) => appendKaraokeTrail(points, { atMs, midi: 60 }),
            appendKaraokeTrail([], { atMs: -200, midi: undefined }),
        );
        expect(trail.map((point) => point.atMs)).toEqual([500, 1000, 1500]);
    });
    it("drops what comes after a seek backwards", () => {
        const trail = appendKaraokeTrail([{ atMs: 5000, midi: 60 }], { atMs: 1000, midi: 62 });
        expect(trail).toEqual([{ atMs: 1000, midi: 62 }]);
    });
});

describe("karaoke note judgement", () => {
    const notes = [
        { startMs: 0, endMs: 500, midi: 69, golden: false },
        { startMs: 500, endMs: 1000, midi: 72, golden: false },
        { startMs: 1000, endMs: 1500, midi: 74, golden: false },
    ];
    it("judges a whole note and counts the run of notes sung well", () => {
        const scoring = new KaraokeScoring(notes);
        for (let at = 0; at < 1000; at += 50) scoring.sample(at, at < 500 ? 69 : 72);
        expect(scoring.indexAt(250)).toBe(0);
        expect(scoring.indexAt(1600)).toBe(-1);
        expect(scoring.judge(0)).toBe(1);
        expect(scoring.streak()).toBe(2);
        for (let at = 1000; at < 1500; at += 50) scoring.sample(at, undefined);
        expect(scoring.judge(2)).toBe(0);
        expect(scoring.streak()).toBe(0);
    });
    it("counts the unheard part of a note as missed", () => {
        const scoring = new KaraokeScoring(notes);
        for (let at = 0; at < 250; at += 50) scoring.sample(at, 69);
        expect(scoring.judge(0)).toBe(0.5);
    });
});

describe("karaoke combo multiplier", () => {
    const run = Array.from({ length: 12 }, (_, index) => ({
        startMs: index * 500,
        endMs: index * 500 + 500,
        midi: 69,
        golden: false,
    }));
    const sing = (missed: readonly number[]): number => {
        const scoring = new KaraokeScoring(run);
        for (let at = 0; at < 6000; at += 50)
            scoring.sample(at, missed.includes(Math.floor(at / 500)) ? undefined : 69);
        return scoring.result().score;
    };
    it("rises by one every four notes sung well, up to four", () => {
        expect([0, 3, 4, 7, 8, 12, 40].map(karaokeMultiplier)).toEqual([1, 1, 2, 2, 3, 4, 4]);
    });
    it("gives the full 10 000 only to a run never broken", () => {
        expect(sing([])).toBe(10_000);
    });
    it("costs more than the missed note itself when it breaks a run", () => {
        const brokenEarly = sing([0]);
        const brokenMidway = sing([6]);
        expect(brokenMidway).toBeLessThan(brokenEarly);
        expect(brokenMidway).toBeLessThan(Math.round((11 / 12) * 10_000));
    });
});

describe("karaoke rank window", () => {
    const board = Array.from({ length: 11 }, (_, index) => ({
        singerUuid: `s${index}`,
        name: `S${index}`,
        score: 9000 - index * 500,
        accuracy: 80,
        at: index,
    }));
    const turn = (score: number, singerUuid = "me") => ({ singerUuid, name: "Me", score, accuracy: 80 });
    it("shows the two singers ahead and the two behind this turn's score", () => {
        const { rows, beyond } = karaokeRankWindow(board, turn(6800));
        expect(rows.map((row) => [row.rank, row.name, row.mine])).toEqual([
            [4, "S3", false],
            [5, "S4", false],
            [6, "Me", true],
            [7, "S5", false],
            [8, "S6", false],
        ]);
        expect(beyond).toBe(false);
    });
    it("ranks this turn, not the singer's best, and keeps the edges of the ranking", () => {
        expect(karaokeRankWindow(board, turn(9500, "s4")).rows.map((row) => row.rank)).toEqual([1, 2, 3]);
        expect(karaokeRankWindow(board, turn(9500, "s4")).rows[0].mine).toBe(true);
        const last = karaokeRankWindow(board, turn(100));
        expect(last.rows.map((row) => row.rank)).toEqual([10, 11, 12]);
        expect(last.beyond).toBe(true);
        expect(karaokeRankWindow([], turn(100)).rows).toEqual([
            { rank: 1, name: "Me", score: 100, accuracy: 80, mine: true },
        ]);
    });
});
