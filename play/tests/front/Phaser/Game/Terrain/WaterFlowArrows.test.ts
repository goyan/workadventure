import { describe, expect, it } from "vitest";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import { WaterFlowOverlay } from "../../../../../src/front/Phaser/Game/Terrain/WaterFlowOverlay";

/** A scene that only counts what the overlay draws: its arrows are lines, two barbs and a shaft each. */
function countingScene(): { scene: ConstructorParameters<typeof WaterFlowOverlay>[0]; lines: () => number } {
    let lines = 0;
    const graphics = {
        setDepth: () => graphics,
        clear: () => graphics,
        lineStyle: () => graphics,
        fillStyle: () => graphics,
        fillRect: () => graphics,
        fillCircle: () => graphics,
        lineBetween: () => {
            lines++;
            return graphics;
        },
        destroy: () => undefined,
    };
    const text = {
        setOrigin: () => text,
        setDepth: () => text,
        setText: () => text,
        setPosition: () => text,
        setScale: () => text,
        setVisible: () => text,
        destroy: () => undefined,
    };
    const scene = {
        add: { graphics: () => graphics, text: () => text },
        cameras: { main: { zoom: 1, worldView: { x: 0, y: 0, width: 512, height: 512, right: 512, bottom: 512 } } },
        markDirty: () => undefined,
    };
    // A stand-in for the Phaser scene: only what the overlay calls.
    return { scene: scene as unknown as ConstructorParameters<typeof WaterFlowOverlay>[0], lines: () => lines };
}

/** A lake of 32 by 32 cells, 20 px deep, whose blocks the server tells running east at `units` quarters a second. */
function lake(units: number): TerrainWater {
    const water = new TerrainWater();
    const cells = 32 * 32;
    const depths = new Uint8Array(cells * 2);
    for (let index = 0; index < cells; index++) depths[index * 2] = 20 * 8;
    const speeds = new Uint8Array((32 / 4) * (32 / 4) * 2);
    for (let block = 0; block < speeds.length / 2; block++) speeds[block * 2] = units & 255;
    water.receive({ x: 0, y: 0, width: 32, height: 32, seq: 1, full: true, depths, speeds }, 0);
    water.receive({ x: 0, y: 0, width: 32, height: 32, seq: 2, full: true, depths, speeds }, 1000);
    return water;
}

function arrowsOver(water: TerrainWater): number {
    const { scene, lines } = countingScene();
    const overlay = new WaterFlowOverlay(scene, { water, inertia: () => true, shown: () => true });
    overlay.update(2000);
    // Two lines for the shaft (its dark outline, then its colour), two for the head.
    return lines() / 4;
}

describe("the arrows of the view of the flows", () => {
    it("draws an arrow over each block whose water the server tells running", () => {
        expect(arrowsOver(lake(4))).toBeGreaterThan(30);
    });

    it("draws none over water the server tells still", () => {
        expect(arrowsOver(lake(0))).toBe(0);
    });
});
