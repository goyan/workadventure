import { describe, expect, it } from "vitest";
import {
    NIGHT_HALO_IDLE_RADIUS_PX,
    NIGHT_HALO_MOVING_RADIUS_PX,
    NIGHT_HALO_MOVING_WINDOW_MS,
    NIGHT_HALO_TRANSITION_MS,
    NightHalos,
} from "../../../../../src/front/Phaser/Game/Night/NightHalos";

const FRAME_MS = 50;

describe("NightHalos", () => {
    it("uses the approved values", () => {
        expect(NIGHT_HALO_IDLE_RADIUS_PX).toBe(48);
        expect(NIGHT_HALO_MOVING_RADIUS_PX).toBe(96);
        expect(NIGHT_HALO_TRANSITION_MS).toBe(300);
        expect(NIGHT_HALO_MOVING_WINDOW_MS).toBe(200);
    });

    it("gives a still player the idle radius, centred on its body", () => {
        const halos = new NightHalos();
        expect(halos.update(0, [{ id: "local", x: 10, y: 20 }])).toEqual([{ id: "local", x: 10, y: 20, radius: 48 }]);
        expect(halos.update(FRAME_MS, [{ id: "local", x: 10, y: 20 }])[0].radius).toBe(48);
        expect(halos.isAnimating()).toBe(false);
    });

    it("grows the radius linearly while the player moves", () => {
        const halos = new NightHalos();
        halos.update(0, [{ id: "p", x: 0, y: 0 }]);
        let radius = 0;
        for (let t = FRAME_MS; t <= 150; t += FRAME_MS) {
            radius = halos.update(t, [{ id: "p", x: t, y: 0 }])[0].radius;
        }
        // Moving since t=0 (first position), 150 ms of growth.
        expect(radius).toBeCloseTo(72);
        expect(halos.isAnimating()).toBe(true);
        for (let t = 200; t <= 300; t += FRAME_MS) {
            radius = halos.update(t, [{ id: "p", x: t, y: 0 }])[0].radius;
        }
        expect(radius).toBeCloseTo(96);
        radius = halos.update(400, [{ id: "p", x: 400, y: 0 }])[0].radius;
        expect(radius).toBe(96);
    });

    it("keeps the moving radius during the window after the last move, then shrinks back", () => {
        const halos = new NightHalos();
        halos.update(0, [{ id: "p", x: 0, y: 0 }]);
        for (let t = FRAME_MS; t <= 1000; t += FRAME_MS) {
            halos.update(t, [{ id: "p", x: t, y: 0 }]);
        }
        const still = [{ id: "p", x: 1000, y: 0 }];
        for (let t = 1050; t <= 1200; t += FRAME_MS) {
            expect(halos.update(t, still)[0].radius).toBe(96);
        }
        expect(halos.update(1350, still)[0].radius).toBeCloseTo(72);
        expect(halos.isAnimating()).toBe(true);
        expect(halos.update(1500, still)[0].radius).toBeCloseTo(48);
        expect(halos.isAnimating()).toBe(false);
        expect(halos.update(1600, still)[0].radius).toBe(48);
    });

    it("fades the halo out in a lit area and back in when leaving it", () => {
        const halos = new NightHalos();
        expect(halos.update(0, [{ id: "p", x: 0, y: 0 }])[0].radius).toBe(48);
        // Still player entering an area (e.g. its feet crossed the edge): 48 -> 0 in 300 ms.
        expect(halos.update(150, [{ id: "p", x: 0, y: 0, sheltered: true }])[0].radius).toBeCloseTo(24);
        expect(halos.isAnimating()).toBe(true);
        expect(halos.update(300, [{ id: "p", x: 0, y: 0, sheltered: true }])).toEqual([]);
        expect(halos.isAnimating()).toBe(false);
        expect(halos.update(400, [{ id: "p", x: 0, y: 0, sheltered: true }])).toEqual([]);
        // Leaving: grows back from 0 to the idle radius.
        expect(halos.update(550, [{ id: "p", x: 0, y: 0 }])[0].radius).toBeCloseTo(24);
        expect(halos.update(700, [{ id: "p", x: 0, y: 0 }])[0].radius).toBe(48);
        expect(halos.isAnimating()).toBe(false);
    });

    it("shrinks a moving halo to nothing in 600 ms inside a lit area", () => {
        const halos = new NightHalos();
        halos.update(0, [{ id: "p", x: 0, y: 0 }]);
        for (let t = FRAME_MS; t <= 400; t += FRAME_MS) {
            halos.update(t, [{ id: "p", x: t, y: 0 }]);
        }
        let last = halos.update(450, [{ id: "p", x: 450, y: 0, sheltered: true }]);
        expect(last[0].radius).toBeCloseTo(88);
        for (let t = 500; t <= 950; t += FRAME_MS) {
            last = halos.update(t, [{ id: "p", x: t, y: 0, sheltered: true }]);
        }
        expect(last[0].radius).toBeCloseTo(8);
        // 600 ms after the shrink started (t=400).
        expect(halos.update(1000, [{ id: "p", x: 1000, y: 0, sheltered: true }])).toEqual([]);
    });

    it("gives no halo to a player first seen inside a lit area", () => {
        const halos = new NightHalos();
        expect(halos.update(0, [{ id: "p", x: 0, y: 0, sheltered: true }])).toEqual([]);
        expect(halos.isAnimating()).toBe(false);
    });

    it("drops the halo of a player who left", () => {
        const halos = new NightHalos();
        halos.update(0, [
            { id: "a", x: 0, y: 0 },
            { id: "b", x: 100, y: 0 },
        ]);
        expect(halos.update(FRAME_MS, [{ id: "a", x: 0, y: 0 }]).map((halo) => halo.id)).toEqual(["a"]);
    });

    it("starts fresh after a reset", () => {
        const halos = new NightHalos();
        halos.update(0, [{ id: "p", x: 0, y: 0 }]);
        for (let t = FRAME_MS; t <= 500; t += FRAME_MS) {
            halos.update(t, [{ id: "p", x: t, y: 0 }]);
        }
        halos.reset();
        expect(halos.update(60_000, [{ id: "p", x: 999, y: 0 }])).toEqual([{ id: "p", x: 999, y: 0, radius: 48 }]);
        expect(halos.isAnimating()).toBe(false);
    });
});
