import { describe, expect, it } from "vitest";
import { cellKey, withHeights, withSoils } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import { MeadowState } from "../../../../../../src/front/Phaser/Game/Terrain/MeadowState";
import {
    cellMaterial,
    outlineOf,
    pickMaterial,
} from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/MaterialField";
import type { Material } from "../../../../../../src/front/Phaser/Game/Terrain/Pixel/PixelPalette";

/** A dug cell painted with a soil (its number in SOILS: 4 sand). */
function painted(soil: number): TerrainData {
    const dug = withHeights(undefined, new Map([[cellKey(4, 4), -32]]));
    return withSoils(dug, new Map([[cellKey(4, 4), soil]]));
}

/** A meadow of 8 × 8 tiles where every tile has these values. */
function meadow(values: { grass?: number; dryness?: number; fire?: number; ash?: number }): MeadowState {
    const state = new MeadowState();
    const tiles = 64;
    const fill = (value = 0) => new Uint8Array(tiles).fill(value);
    state.receive({
        width: 8,
        height: 8,
        grass: fill(values.grass),
        moisture: fill(),
        dryness: fill(values.dryness),
        fire: fill(values.fire),
        ash: fill(values.ash),
    });
    return state;
}

describe("what covers a cell of the terrain", () => {
    it("the grass of the meadow over the soil painted under it, the soil without grass", () => {
        expect(cellMaterial({ terrain: painted(4), meadow: meadow({ grass: 255 }), snowShown: 0 }, 4, 4)).toBe("grass");
        expect(cellMaterial({ terrain: painted(4), meadow: meadow({}), snowShown: 0 }, 4, 4)).toBe("sand");
        expect(cellMaterial({ terrain: painted(4), snowShown: 0 }, 4, 4)).toBe("sand");
    });

    it("snow over everything when it lies, embers where it burns, then ash, then straw", () => {
        expect(cellMaterial({ terrain: painted(4), meadow: meadow({ grass: 255 }), snowShown: 1 }, 4, 4)).toBe("snow");
        expect(
            cellMaterial({ terrain: painted(1), meadow: meadow({ grass: 255, fire: 200 }), snowShown: 0 }, 4, 4),
        ).toBe("ember");
        expect(cellMaterial({ terrain: painted(1), meadow: meadow({ ash: 200 }), snowShown: 0 }, 4, 4)).toBe("ash");
        expect(
            cellMaterial({ terrain: painted(1), meadow: meadow({ grass: 255, dryness: 255 }), snowShown: 0 }, 4, 4),
        ).toBe("straw");
    });

    it("grass where nothing is painted nor grows", () => {
        expect(cellMaterial({ terrain: painted(4), snowShown: 0 }, 9, 9)).toBe("grass");
    });
});

describe("what covers a point between cells", () => {
    // Grass west of the cell 24 (x 384), sand from it on.
    const cells = (cellX: number): Material => (cellX >= 24 ? "sand" : "grass");
    const at = (x: number, y: number) => pickMaterial((cellX) => cells(cellX), x, y);

    it("the material of a cell at its centre", () => {
        expect(at(16 * 10 + 8, 100)).toBe("grass");
        expect(at(16 * 30 + 8, 100)).toBe("sand");
    });

    it("an irregular border, the same at every call", () => {
        const switches = new Set<number>();
        for (let y = 0; y < 320; y += 20) {
            let first: number | undefined;
            for (let x = 360; x < 410; x++) if (first === undefined && at(x, y) === "sand") first = x;
            expect(first).toBeDefined();
            switches.add(first ?? 0);
            expect(at(first ?? 0, y)).toBe("sand");
        }
        expect(switches.size).toBeGreaterThanOrEqual(3);
    });
});

describe("the line drawn where two materials meet", () => {
    it("dark on the grass side, light on the snow side, none on the side of the lighter material", () => {
        expect(outlineOf("grass", "sand")).toBe("dark");
        expect(outlineOf("sand", "grass")).toBeUndefined();
        expect(outlineOf("snow", "grass")).toBe("light");
        expect(outlineOf("grass", "grass")).toBeUndefined();
    });
});
