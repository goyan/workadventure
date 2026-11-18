import { describe, expect, it } from "vitest";
import { AquaticLife, FADE_MS, GLIDE_MS } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";

const fish = (id: number, x: number, y = 0, kind = 0) => ({ id, kind, x, y });

describe("AquaticLife", () => {
    it("glides an animal from where it is shown to where the server last told, in a second", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 100)], 0);
        life.receive([fish(1, 140)], 1000);
        expect(life.shown(1000 + GLIDE_MS / 2, false)[0].x).toBeCloseTo(120);
        expect(life.shown(1000 + GLIDE_MS, false)[0].x).toBeCloseTo(140);
        expect(life.shown(1000 + 5 * GLIDE_MS, false)[0].x).toBeCloseTo(140);
    });

    it("starts a glide from the place shown when a message comes before the end of the last one", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 0)], 0);
        life.receive([fish(1, 100)], 1000);
        life.receive([fish(1, 100)], 1500);
        expect(life.shown(1500, false)[0].x).toBeCloseTo(50);
        expect(life.shown(2000, false)[0].x).toBeCloseTo(75);
    });

    it("fades a newborn in, and shows the animals of the first message at once", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 0)], 0);
        expect(life.shown(0, false)[0].alpha).toBe(1);
        life.receive([fish(1, 0), fish(2, 50)], 1000);
        const young = (now: number) => life.shown(now, false).find((animal) => animal.id === 2);
        expect(young(1000)?.alpha).toBe(0);
        expect(young(1000 + FADE_MS / 2)?.alpha).toBeCloseTo(0.5);
        expect(young(1000 + FADE_MS)?.alpha).toBe(1);
        expect(young(1000)?.x).toBe(50);
    });

    it("fades out an animal the server no longer tells, then forgets it", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 0), fish(2, 50)], 0);
        life.receive([fish(1, 0)], 1000);
        const gone = (now: number) => life.shown(now, false).find((animal) => animal.id === 2);
        expect(gone(1000 + FADE_MS / 2)?.alpha).toBeCloseTo(0.5);
        expect(gone(1000 + FADE_MS)).toBeUndefined();
        expect(life.shown(1000 + FADE_MS, false)).toHaveLength(1);
    });

    it("turns an animal towards where it goes, and keeps it turned while it stays", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 100)], 0);
        life.receive([fish(1, 60)], 1000);
        expect(life.shown(1200, false)[0].facingLeft).toBe(true);
        life.receive([fish(1, 60)], 2000);
        expect(life.shown(2500, false)[0].facingLeft).toBe(true);
        life.receive([fish(1, 90)], 3000);
        expect(life.shown(3200, false)[0].facingLeft).toBe(false);
    });

    it("puts animals where they are told, whole, with reduced motion", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 0)], 0);
        life.receive([fish(1, 100), fish(2, 50)], 1000);
        const shown = life.shown(1000, true);
        expect(shown.find((animal) => animal.id === 1)?.x).toBe(100);
        expect(shown.find((animal) => animal.id === 2)?.alpha).toBe(1);
        life.receive([fish(1, 100)], 2000);
        expect(life.shown(2000, true)).toHaveLength(1);
    });

    it("counts the fish and the dolphins, and ignores a kind it does not know", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 0, 0, 0), fish(2, 0, 0, 1), fish(3, 0, 0, 2), fish(5, 0, 0, 3), fish(4, 0, 0, 9)], 0);
        expect(life.counts()).toEqual({ fish: 2, dolphins: 2 });
        expect(life.shown(0, false)).toHaveLength(4);
    });

    it("forgets the dead by itself, even when nothing is drawn", () => {
        const life = new AquaticLife();
        life.receive([fish(1, 0)], 0);
        life.receive([], 1000);
        expect(life.isEmpty()).toBe(false);
        life.receive([], 2000);
        expect(life.isEmpty()).toBe(true);
    });
});
