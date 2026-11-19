import { describe, expect, it } from "vitest";
import {
    biggestCatch,
    contestShown,
    formatRemaining,
    recordShown,
    shownRows,
} from "../../../../../src/front/Phaser/Game/Fishing/FishingContestView";

const entry = (name: string, totalGrams: number, bestGrams: number, userId: number) => ({
    name,
    totalGrams,
    bestGrams,
    catches: 2,
    userId,
});

describe("the contest a browser shows", () => {
    const message = {
        hostName: "Hugo",
        minutes: 5,
        remainingMs: 192_000,
        finished: false,
        entries: [entry("Hugo", 4810, 2100, 3), entry("Antoine", 3950, 1240, 7), entry("Charles", 620, 620, 0)],
    };

    it("ends on the clock of the browser, with the local player marked", () => {
        expect(contestShown(message, 7, 1_000_000)).toEqual({
            hostName: "Hugo",
            minutes: 5,
            endsAt: 1_192_000,
            finished: false,
            rows: [
                { rank: 1, name: "Hugo", totalGrams: 4810, bestGrams: 2100, catches: 2, own: false },
                { rank: 2, name: "Antoine", totalGrams: 3950, bestGrams: 1240, catches: 2, own: true },
                { rank: 3, name: "Charles", totalGrams: 620, bestGrams: 620, catches: 2, own: false },
            ],
        });
    });

    it("marks nobody before the room is joined, nor a player the server no longer knows", () => {
        expect(contestShown(message, undefined, 0).rows.some((row) => row.own)).toBe(false);
        expect(contestShown(message, 0, 0).rows.some((row) => row.own)).toBe(false);
    });

    it("shows the first lines, and the local player's own when it is further down", () => {
        const last = { ...message, entries: [...message.entries.slice(0, 2), entry("Charles", 620, 620, 9)] };
        const rows = contestShown(last, 9, 0).rows;
        expect(shownRows(rows, 2).map((row) => row.name)).toEqual(["Hugo", "Antoine", "Charles"]);
        expect(shownRows(rows, 3).map((row) => row.name)).toEqual(["Hugo", "Antoine", "Charles"]);
        expect(shownRows(contestShown(message, 3, 0).rows, 2).map((row) => row.name)).toEqual(["Hugo", "Antoine"]);
    });

    it("names the heaviest catch, which may not be the winner's", () => {
        const rows = contestShown(
            { ...message, entries: [entry("Hugo", 4810, 1500, 3), entry("Antoine", 3950, 2400, 7)] },
            3,
            0,
        ).rows;
        expect(biggestCatch(rows)).toEqual({ name: "Antoine", grams: 2400 });
        expect(biggestCatch([])).toBeUndefined();
    });

    it("writes the time left in minutes and seconds", () => {
        expect(formatRemaining(192_000)).toBe("03:12");
        expect(formatRemaining(191_001)).toBe("03:12");
        expect(formatRemaining(600_000)).toBe("10:00");
        expect(formatRemaining(999)).toBe("00:01");
        expect(formatRemaining(0)).toBe("00:00");
        expect(formatRemaining(-5000)).toBe("00:00");
    });
});

describe("the record of the map", () => {
    it("is a pink or a blue fish, at a date", () => {
        expect(recordShown({ name: "Hugo", grams: 2100, kind: 1, atSeconds: 1_700_000_000 })).toEqual({
            name: "Hugo",
            grams: 2100,
            female: true,
            at: 1_700_000_000_000,
        });
        expect(recordShown({ name: "Hugo", grams: 2100, kind: 0, atSeconds: 1 }).female).toBe(false);
    });
});
