import { describe, expect, it } from "vitest";
import {
    drawZombieSheet,
    ZOMBIE_FEET_Y,
    ZOMBIE_FRAME_HEIGHT,
    ZOMBIE_FRAME_WIDTH,
    ZOMBIE_LOOKS,
    ZOMBIE_SHEET_WIDTH,
    ZOMBIE_SIDE,
    ZOMBIE_STEPS,
    ZOMBIE_WATERS,
    ZOMBIE_WAYS,
    zombieFrame,
    zombieFrameAt,
} from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieSprites";

/** The rows of a frame something is drawn on. */
function drawnRows(sheet: Uint8ClampedArray, frame: number): number[] {
    const { x, y } = zombieFrameAt(frame);
    const rows: number[] = [];
    for (let row = 0; row < ZOMBIE_FRAME_HEIGHT; row++) {
        for (let column = 0; column < ZOMBIE_FRAME_WIDTH; column++) {
            if (sheet[((y + row) * ZOMBIE_SHEET_WIDTH + x + column) * 4 + 3] > 0) {
                rows.push(row);
                break;
            }
        }
    }
    return rows;
}

describe("the sheet of the zombies", () => {
    const sheet = drawZombieSheet();

    it("numbers every frame once, side by side", () => {
        const seen = new Set<string>();
        for (let look = 0; look < ZOMBIE_LOOKS; look++) {
            for (let water = 0; water < ZOMBIE_WATERS; water++) {
                for (let way = 0; way < ZOMBIE_WAYS; way++) {
                    for (let step = 0; step < ZOMBIE_STEPS; step++) {
                        const { x, y } = zombieFrameAt(zombieFrame(look, water, way, step));
                        seen.add(`${x},${y}`);
                    }
                }
            }
        }
        expect(seen.size).toBe(ZOMBIE_LOOKS * ZOMBIE_WATERS * ZOMBIE_WAYS * ZOMBIE_STEPS);
    });

    it("draws a zombie standing on its feet dry, and less of it the deeper the water", () => {
        const dry = drawnRows(sheet, zombieFrame(0, 0, ZOMBIE_SIDE, 0));
        expect(Math.max(...dry)).toBeGreaterThanOrEqual(ZOMBIE_FEET_Y);
        expect(Math.min(...dry)).toBeLessThan(4);
        const knee = drawnRows(sheet, zombieFrame(0, 1, ZOMBIE_SIDE, 0));
        const waist = drawnRows(sheet, zombieFrame(0, 2, ZOMBIE_SIDE, 0));
        const under = drawnRows(sheet, zombieFrame(0, 3, ZOMBIE_SIDE, 0));
        expect(Math.max(...knee)).toBeLessThan(Math.max(...dry));
        expect(Math.max(...waist)).toBeLessThan(Math.max(...knee));
        expect(Math.max(...under)).toBeLessThan(Math.max(...waist));
        expect(under.length).toBeGreaterThan(0);
    });

    it("walks: its steps are not all the same picture", () => {
        const frames = [0, 1, 2, 3].map((step) => {
            const { x, y } = zombieFrameAt(zombieFrame(2, 0, ZOMBIE_SIDE, step));
            const pixels: number[] = [];
            for (let row = 0; row < ZOMBIE_FRAME_HEIGHT; row++) {
                const at = ((y + row) * ZOMBIE_SHEET_WIDTH + x) * 4;
                pixels.push(...sheet.slice(at, at + ZOMBIE_FRAME_WIDTH * 4));
            }
            return pixels.join(",");
        });
        expect(new Set(frames).size).toBeGreaterThan(2);
    });
});
