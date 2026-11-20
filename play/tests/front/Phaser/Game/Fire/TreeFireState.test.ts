import { describe, expect, it } from "vitest";
import { charDegree, TreeFireState } from "../../../../../src/front/Phaser/Game/Fire/TreeFireState";

const ember = { fromX: 0, fromY: 0, toX: 320, toY: 0, flightMs: 2000 };

describe("charDegree", () => {
    it("draws a tree in four degrees of what burnt of it, green when nothing did", () => {
        expect(charDegree(0)).toBe(0);
        expect(charDegree(1)).toBe(1);
        expect(charDegree(4)).toBe(1);
        expect(charDegree(5)).toBe(2);
        expect(charDegree(12)).toBe(3);
        expect(charDegree(13)).toBe(4);
        expect(charDegree(16)).toBe(4);
        expect(charDegree(40)).toBe(4);
        expect(charDegree(Number.NaN)).toBe(0);
    });
});

describe("TreeFireState", () => {
    it("keeps the fire and the damage of the trees the server names, and says which ones to draw again", () => {
        const state = new TreeFireState();
        expect(state.receive({ trees: [{ id: "oak", fire: 255, damage: 6 }], whole: false, embers: [] }, 0)).toEqual([
            "oak",
        ]);
        expect(state.fireOf("oak")).toBe(1);
        expect(state.degreeOf("oak")).toBe(2);
        expect(state.burning()).toEqual([{ id: "oak", fire: 1 }]);
        expect(state.isBurning()).toBe(true);
        // A tree the server never named is green.
        expect(state.fireOf("pine")).toBe(0);
        expect(state.degreeOf("pine")).toBe(0);
    });

    it("forgets a tree told green again", () => {
        const state = new TreeFireState();
        state.receive({ trees: [{ id: "oak", fire: 0, damage: 16 }], whole: false, embers: [] }, 0);
        expect(state.degreeOf("oak")).toBe(4);
        expect(state.isBurning()).toBe(false);
        expect(state.receive({ trees: [{ id: "oak", fire: 0, damage: 0 }], whole: false, embers: [] }, 0)).toEqual([
            "oak",
        ]);
        expect(state.degreeOf("oak")).toBe(0);
    });

    it("takes a whole state in place of what it knew: the trees not named are green again", () => {
        const state = new TreeFireState();
        state.receive({ trees: [{ id: "oak", fire: 100, damage: 4 }], whole: false, embers: [] }, 0);
        const touched = state.receive({ trees: [{ id: "pine", fire: 0, damage: 16 }], whole: true, embers: [] }, 0);
        expect(touched.sort()).toEqual(["oak", "pine"]);
        expect(state.degreeOf("oak")).toBe(0);
        expect(state.degreeOf("pine")).toBe(4);
    });

    it("keeps the embers while they fly", () => {
        const state = new TreeFireState();
        state.receive({ trees: [], whole: false, embers: [ember] }, 1000);
        expect(state.embers(1500)).toEqual([{ ...ember, leftAt: 1000 }]);
        expect(state.embers(2999)).toHaveLength(1);
        expect(state.embers(3000)).toEqual([]);
    });

    it("forgets everything when cleared, and says which trees to draw green", () => {
        const state = new TreeFireState();
        state.receive({ trees: [{ id: "oak", fire: 100, damage: 4 }], whole: false, embers: [ember] }, 0);
        expect(state.clear()).toEqual(["oak"]);
        expect(state.isBurning()).toBe(false);
        expect(state.embers(1)).toEqual([]);
    });

    it("lists the trees the fire marked, burning or charred", () => {
        const state = new TreeFireState();
        expect(state.marked()).toEqual([]);
        state.receive(
            {
                trees: [
                    { id: "oak", fire: 255, damage: 6 },
                    { id: "pine", fire: 0, damage: 16 },
                    { id: "elm", fire: 0, damage: 0 },
                ],
                whole: false,
                embers: [],
            },
            0,
        );
        expect(state.marked().sort()).toEqual(["oak", "pine"]);
    });

    it("lets a tree smoulder for thirty seconds after its fire went out, not a tree that never burnt", () => {
        const state = new TreeFireState();
        const told = (fire: number, damage: number, now: number): void => {
            state.receive({ trees: [{ id: "oak", fire, damage }], whole: false, embers: [] }, now);
        };
        told(255, 6, 0);
        expect(state.smouldering(1000)).toEqual([]);
        told(0, 16, 10_000);
        // From 1 as it goes out to 0 thirty seconds later.
        expect(state.smouldering(10_000)).toEqual([{ id: "oak", left: 1 }]);
        expect(state.smouldering(25_000)).toEqual([{ id: "oak", left: 0.5 }]);
        expect(state.smouldering(40_000)).toEqual([]);
        // Told again while it greens back: it does not smoke again.
        told(0, 8, 50_000);
        expect(state.smouldering(50_000)).toEqual([]);
        // A charred tree told to who joins the room never burnt before their eyes.
        const joined = new TreeFireState();
        joined.receive({ trees: [{ id: "pine", fire: 0, damage: 16 }], whole: true, embers: [] }, 0);
        expect(joined.smouldering(0)).toEqual([]);
        // It burns again: no more smouldering.
        told(255, 8, 60_000);
        told(0, 16, 70_000);
        told(200, 16, 75_000);
        expect(state.smouldering(76_000)).toEqual([]);
    });
});
