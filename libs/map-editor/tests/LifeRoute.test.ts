import { describe, expect, it } from "vitest";
import type { Animal } from "../src/Life/Animal";
import { landPlacesOf } from "../src/Life/LandPlaces";
import { ROUTE_RETRY_MS, swim } from "../src/Life/Swim";
import { waterBodiesOf } from "../src/Life/WaterBodies";
import { gridOf, scripted } from "./lifeHelpers";

/** A land drawn row by row, a character a cell: "." dry, "w" water one swims in (20 px). */
function landOf(rows: string[]) {
    return landPlacesOf({
        width: rows[0].length,
        height: rows.length,
        walls: { east: new Set(), south: new Set() },
        depthAt: (x, y) => (rows[y]?.[x] === "w" ? 20 : 0),
    });
}
const middle = (cell: number): number => cell * 16 + 8;
const animalAt = (kind: Animal["kind"], cellX: number, cellY: number): Animal => ({
    id: 1,
    kind,
    sex: "male",
    x: middle(cellX),
    y: middle(cellY),
    bornAt: 0,
    lifespanMs: 1e9,
    readyAt: 0,
});

/** A river from the third row down, dry above it: the only way across, as a bridge far from the straight line. */
const RIVER = [
    "............",
    "............",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
    ".....ww.....",
];

describe("an animal stopped on its straight way", () => {
    it("goes round the water by the bridge to its target, and never into the water", () => {
        const land = landOf(RIVER);
        const antelope = animalAt("antelope", 2, 9);
        antelope.targetX = middle(9);
        antelope.targetY = middle(9);
        antelope.speed = 48;
        let reached = false;
        for (let step = 0; step < 60 && !reached; step++) {
            expect(swim(antelope, land, undefined, 48, 500, step * 500, scripted())).toBe(true);
            expect(RIVER[Math.floor(antelope.y / 16)][Math.floor(antelope.x / 16)]).toBe(".");
            reached = Math.hypot(antelope.x - middle(9), antelope.y - middle(9)) < 1;
        }
        expect(reached).toBe(true);
    });

    it("keeps its target while it goes round", () => {
        const land = landOf(RIVER);
        const antelope = animalAt("antelope", 2, 9);
        antelope.targetX = middle(9);
        antelope.targetY = middle(9);
        antelope.speed = 48;
        for (let step = 0; step < 5; step++) swim(antelope, land, undefined, 48, 500, step * 500, scripted());
        expect(antelope.targetX).toBe(middle(9));
        expect(antelope.targetY).toBe(middle(9));
        // On its way up to the bridge.
        expect(antelope.y).toBeLessThan(middle(9));
    });

    it("drops a target on a land no bridge leads to, and does not look for a way again at once", () => {
        const island = RIVER.map((row) => row.slice(0, 5) + "ww" + row.slice(7));
        const land = landOf(island);
        const antelope = animalAt("antelope", 2, 9);
        antelope.targetX = middle(9);
        antelope.targetY = middle(9);
        antelope.speed = 48;
        // Straight to the bank, where it is stopped.
        for (let step = 0; step < 6 && antelope.targetX !== undefined; step++) {
            swim(antelope, land, undefined, 48, 500, step * 500, scripted());
        }
        expect(antelope.targetX).toBeUndefined();
        expect(ROUTE_RETRY_MS).toBeGreaterThan(0);
    });

    it("follows a new way when its target moves far from where the first one led", () => {
        const land = landOf(RIVER);
        const antelope = animalAt("antelope", 2, 9);
        antelope.targetX = middle(9);
        antelope.targetY = middle(9);
        antelope.speed = 48;
        for (let step = 0; step < 4; step++) swim(antelope, land, undefined, 48, 500, step * 500, scripted());
        // Its prey ran back to its own bank: straight to it, the bridge is no longer the way.
        antelope.targetX = middle(1);
        antelope.targetY = middle(10);
        let reached = false;
        for (let step = 4; step < 30 && !reached; step++) {
            swim(antelope, land, undefined, 48, 500, step * 500, scripted());
            reached = Math.hypot(antelope.x - middle(1), antelope.y - middle(10)) < 1;
        }
        expect(reached).toBe(true);
        expect(antelope.x).toBeLessThan(middle(5));
    });

    it("in the water too: a fish swims round an island", () => {
        const pond = ["sssssss", "sss.sss", "sss.sss", "sss.sss", "sss.sss", "sss.sss"];
        const grid = gridOf(pond);
        const bodies = waterBodiesOf(grid);
        const fish = animalAt("fish", 1, 4);
        fish.targetX = middle(5);
        fish.targetY = middle(4);
        fish.speed = 48;
        let reached = false;
        for (let step = 0; step < 40 && !reached; step++) {
            expect(swim(fish, bodies, grid, 48, 500, step * 500, scripted())).toBe(true);
            expect(pond[Math.floor(fish.y / 16)][Math.floor(fish.x / 16)]).toBe("s");
            reached = Math.hypot(fish.x - middle(5), fish.y - middle(4)) < 1;
        }
        expect(reached).toBe(true);
    });
});
