import { describe, expect, it, vi } from "vitest";
import { OutdoorGrid } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";

interface Shown {
    area: { x: number; y: number; columns: number; rows: number; cell: number };
    coverage: (index: number) => number;
    alpha: number;
}

const textured = vi.hoisted(() => ({ shown: [] as Shown[], hidden: 0, alpha: [] as number[] }));

vi.mock("../../../../../src/front/Phaser/Game/Terrain/TexturedGround", () => ({
    GROUND_TEXTURES: { snow: "snow" },
    TexturedGround: class {
        show(area: Shown["area"], coverage: Shown["coverage"], _stamp: number, alpha: number): void {
            textured.shown.push({ area, coverage, alpha });
        }
        hide(): void {
            textured.hidden++;
        }
        setAlpha(alpha: number): void {
            textured.alpha.push(alpha);
        }
        destroy(): void {}
    },
}));

import { SnowGround } from "../../../../../src/front/Phaser/Game/Christmas/SnowGround";

function sceneSeeing(view: { x: number; y: number; width: number; height: number }) {
    const worldView = { ...view, right: view.x + view.width, bottom: view.y + view.height };
    return { cameras: { main: { worldView } } } as unknown as Phaser.Scene;
}

/** The snowy cells of the last snow laid, as "column,row" of the map. */
function snowyOf(last: Shown): Set<string> {
    const snowy = new Set<string>();
    const { area } = last;
    for (let index = 0; index < area.columns * area.rows; index++) {
        if (last.coverage(index) > 0) {
            snowy.add(
                `${area.x / area.cell + (index % area.columns)},${area.y / area.cell + Math.floor(index / area.columns)}`,
            );
        }
    }
    return snowy;
}

describe("SnowGround", () => {
    it("covers the edge of a wall that touches the outside, never the room behind it", () => {
        textured.shown = [];
        // 6x6 cells of 8 px: a ring of walls (cells 1..4) around a room (cells 2..3).
        const walls = [
            { x: 8, y: 8, width: 32, height: 8 },
            { x: 8, y: 32, width: 32, height: 8 },
            { x: 8, y: 8, width: 8, height: 32 },
            { x: 32, y: 8, width: 8, height: 32 },
        ];
        new SnowGround(sceneSeeing({ x: 0, y: 0, width: 48, height: 48 })).draw(
            OutdoorGrid.fromWalls(48, 48, 8, walls),
        );
        const snowy = snowyOf(textured.shown[0]);
        expect(snowy.has("0,0")).toBe(true);
        // Walls start mid-cell on the map: the wall cell next to the outside gets snow (the wall image covers it).
        expect(snowy.has("1,1")).toBe(true);
        expect(snowy.has("4,2")).toBe(true);
        expect(snowy.has("2,2")).toBe(false);
        expect(snowy.has("3,3")).toBe(false);
    });

    it("lays the snow around the view only, again once the view left it", () => {
        textured.shown = [];
        const view = { x: 0, y: 0, width: 64, height: 64 };
        const scene = sceneSeeing(view);
        const ground = new SnowGround(scene);
        ground.draw(OutdoorGrid.fromWalls(3200, 3200, 32, []));
        expect(textured.shown).toHaveLength(1);
        expect(ground.follow()).toBe(false);
        const moved = sceneSeeing({ x: 2000, y: 2000, width: 64, height: 64 });
        Object.assign(scene.cameras.main.worldView, moved.cameras.main.worldView);
        expect(ground.follow()).toBe(true);
        expect(textured.shown.at(-1)?.area.x).toBeGreaterThan(1000);
    });

    it("keeps its fading when the snow is laid again, and lays nothing while hidden", () => {
        textured.shown = [];
        textured.hidden = 0;
        const ground = new SnowGround(sceneSeeing({ x: 0, y: 0, width: 64, height: 64 }));
        const grid = OutdoorGrid.fromWalls(64, 64, 32, []);
        ground.setAlpha(0.3);
        ground.draw(grid);
        expect(textured.alpha.at(-1)).toBe(0.3);
        expect(textured.shown.at(-1)?.alpha).toBe(0.3);
        ground.setVisible(false);
        expect(textured.hidden).toBe(1);
        expect(ground.follow()).toBe(false);
    });
});
