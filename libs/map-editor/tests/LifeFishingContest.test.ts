import { describe, expect, it } from "vitest";
import {
    betterRecord,
    contestOver,
    contestRanking,
    FISHING_CONTEST_MINUTES,
    recordCatch,
    startContest,
} from "../src/Life/FishingContest";

const hugo = { key: "uuid-hugo", name: "Hugo" };
const antoine = { key: "uuid-antoine", name: "Antoine" };
const charles = { key: "uuid-charles", name: "Charles" };

describe("a fishing contest", () => {
    it("lasts three, five or ten minutes, nothing else", () => {
        expect(FISHING_CONTEST_MINUTES).toEqual([3, 5, 10]);
        expect(startContest(hugo, 5, 1000)).toMatchObject({ hostName: "Hugo", minutes: 5, endsAt: 301_000 });
        expect(startContest(hugo, 4, 1000)).toBeUndefined();
        expect(startContest(hugo, 0, 1000)).toBeUndefined();
        expect(startContest(hugo, 3.5, 1000)).toBeUndefined();
    });

    it("is over at its time, not before", () => {
        const contest = startContest(hugo, 3, 0);
        if (!contest) throw new Error("no contest");
        expect(contestOver(contest, 179_999)).toBe(false);
        expect(contestOver(contest, 180_000)).toBe(true);
    });

    it("adds the catches of a player, and keeps their biggest", () => {
        const contest = startContest(hugo, 3, 0);
        if (!contest) throw new Error("no contest");
        expect(recordCatch(contest, hugo, 1, 1200, 1000)).toBe(true);
        expect(recordCatch(contest, hugo, 2, 2100, 2000)).toBe(true);
        expect(recordCatch(contest, hugo, 3, 500, 3000)).toBe(true);
        expect(contestRanking(contest)).toEqual([
            { key: "uuid-hugo", name: "Hugo", totalGrams: 3800, bestGrams: 2100, catches: 3, scoredAt: 3000 },
        ]);
    });

    it("counts a fish once for a player, and again for another player", () => {
        const contest = startContest(hugo, 3, 0);
        if (!contest) throw new Error("no contest");
        expect(recordCatch(contest, hugo, 7, 1000, 1000)).toBe(true);
        expect(recordCatch(contest, hugo, 7, 1500, 70_000)).toBe(false);
        expect(recordCatch(contest, antoine, 7, 1500, 80_000)).toBe(true);
        expect(contestRanking(contest).map((entry) => [entry.name, entry.totalGrams, entry.catches])).toEqual([
            ["Antoine", 1500, 1],
            ["Hugo", 1000, 1],
        ]);
    });

    it("counts nothing once it is over", () => {
        const contest = startContest(hugo, 3, 0);
        if (!contest) throw new Error("no contest");
        expect(recordCatch(contest, hugo, 1, 1000, 180_000)).toBe(false);
        expect(contestRanking(contest)).toEqual([]);
    });

    it("ranks by the total weight, then the biggest catch, then who got there first", () => {
        const contest = startContest(hugo, 10, 0);
        if (!contest) throw new Error("no contest");
        recordCatch(contest, charles, 1, 600, 1000);
        recordCatch(contest, antoine, 2, 1000, 2000);
        recordCatch(contest, antoine, 3, 1000, 3000);
        recordCatch(contest, hugo, 4, 1500, 4000);
        recordCatch(contest, hugo, 5, 500, 5000);
        // Hugo and Antoine both have 2 kg: Hugo's biggest is bigger.
        expect(contestRanking(contest).map((entry) => entry.name)).toEqual(["Hugo", "Antoine", "Charles"]);
        // Charles gets to 2 kg with a catch of 1.4 kg, less than Hugo's 1.5 and more than Antoine's 1.
        recordCatch(contest, charles, 6, 1400, 6000);
        expect(contestRanking(contest).map((entry) => entry.name)).toEqual(["Hugo", "Charles", "Antoine"]);
    });

    it("puts first, of two players with the same catches, the one who got there first", () => {
        const contest = startContest(hugo, 10, 0);
        if (!contest) throw new Error("no contest");
        recordCatch(contest, antoine, 1, 1000, 5000);
        recordCatch(contest, hugo, 2, 1000, 2000);
        expect(contestRanking(contest).map((entry) => entry.name)).toEqual(["Hugo", "Antoine"]);
    });

    it("takes the name a player has now", () => {
        const contest = startContest(hugo, 3, 0);
        if (!contest) throw new Error("no contest");
        recordCatch(contest, hugo, 1, 1000, 1000);
        recordCatch(contest, { key: "uuid-hugo", name: "Hugo le grand" }, 2, 1000, 2000);
        expect(contestRanking(contest)).toMatchObject([{ name: "Hugo le grand", totalGrams: 2000 }]);
    });
});

describe("the record of a map", () => {
    const first = { name: "Hugo", grams: 2100, female: false, at: 1000 };

    it("is the first catch, then only a heavier one", () => {
        expect(betterRecord(undefined, first)).toBe(first);
        const same = { name: "Antoine", grams: 2100, female: true, at: 2000 };
        expect(betterRecord(first, same)).toBe(first);
        const heavier = { name: "Antoine", grams: 2101, female: true, at: 3000 };
        expect(betterRecord(first, heavier)).toBe(heavier);
        expect(betterRecord(heavier, first)).toBe(heavier);
    });
});
