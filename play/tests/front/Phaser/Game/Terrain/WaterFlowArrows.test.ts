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

/**
 * A lake of 32 by 32 cells, 20 px deep, whose blocks the server tells running east at `units` quarters a second,
 * and at `slow` 250ths of a cell a second where that says nothing (absent: the server tells no slow speed).
 */
function lake(units: number, slow?: number): TerrainWater {
    const water = new TerrainWater();
    const cells = 32 * 32;
    const depths = new Uint8Array(cells * 2);
    for (let index = 0; index < cells; index++) depths[index * 2] = 20 * 8;
    const speeds = new Uint8Array((32 / 4) * (32 / 4) * 2);
    for (let block = 0; block < speeds.length / 2; block++) speeds[block * 2] = units & 255;
    const slowSpeeds = slow === undefined ? undefined : new Uint8Array(speeds.length);
    if (slowSpeeds && slow !== undefined)
        for (let block = 0; block < slowSpeeds.length / 2; block++) slowSpeeds[block * 2] = slow & 255;
    water.receive({ x: 0, y: 0, width: 32, height: 32, seq: 1, full: true, depths, speeds, slowSpeeds }, 0);
    water.receive({ x: 0, y: 0, width: 32, height: 32, seq: 2, full: true, depths, speeds, slowSpeeds }, 1000);
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
        expect(arrowsOver(lake(0, 0))).toBe(0);
    });

    it("draws the slow currents the server tells apart: 0.06 m/s, under a quarter of a cell a second", () => {
        // 27 250ths of a cell a second: about 6 cm a second, the current of a pond a source feeds.
        expect(arrowsOver(lake(0, 27))).toBeGreaterThan(30);
        // 5 250ths: about a centimetre a second, the slowest told, still shown.
        expect(arrowsOver(lake(0, 5))).toBeGreaterThan(30);
        // Slower than that: no arrow (the server tells none of it anyway).
        expect(arrowsOver(lake(0, 3))).toBe(0);
    });

    it("falls back on the speeds alone from a server that tells no slow speed", () => {
        expect(arrowsOver(lake(0))).toBe(0);
        expect(arrowsOver(lake(4))).toBe(arrowsOver(lake(4, 0)));
    });
});
