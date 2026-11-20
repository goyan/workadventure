import { describe, expect, it, vi } from "vitest";
import {
    FOOTPRINT_TINTS,
    footprintSurface,
    GroundFootprints,
} from "../../../../../src/front/Phaser/Game/Terrain/Footprints";
import type { FootprintSurface } from "../../../../../src/front/Phaser/Game/Terrain/Footprints";

/** A scene that records the prints laid: their place and their tint. */
function scene() {
    const prints: { x: number; y: number; tint: number }[] = [];
    const image = (x: number, y: number) => {
        const print = { x, y, tint: -1 };
        prints.push(print);
        const object = {
            setRotation: () => object,
            setOrigin: () => object,
            setDisplaySize: () => object,
            setDepth: () => object,
            setAlpha: () => object,
            setVisible: () => object,
            setTint: (tint: number) => {
                print.tint = tint;
                return object;
            },
            destroy: vi.fn(),
        };
        return object;
    };
    const canvas = {
        getContext: () => ({ beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), fillRect: vi.fn() }),
        refresh: vi.fn(),
    };
    return {
        prints,
        scene: {
            add: { image: vi.fn(image) },
            textures: { exists: () => false, createCanvas: () => canvas },
        },
    };
}

/** A player walking 80 px east from x 100, at y. */
function walk(footprints: GroundFootprints, y: number) {
    for (let step = 0; step <= 10; step++) {
        footprints.update(step * 100, [{ id: "a", x: 100 + step * 8, y, running: false }]);
    }
}

describe("the footprints on the ground", () => {
    it("are left in the snow, the mud and the sand only", () => {
        expect(footprintSurface("snow")).toBe("snow");
        expect(footprintSurface("mud")).toBe("mud");
        expect(footprintSurface("sand")).toBe("sand");
        expect(footprintSurface("grass")).toBeUndefined();
        expect(footprintSurface("earth")).toBeUndefined();
        expect(footprintSurface("none")).toBeUndefined();
    });

    it("take the colour of the ground they are left in", () => {
        for (const surface of ["snow", "mud", "sand"] as FootprintSurface[]) {
            const { scene: fake, prints } = scene();
            const footprints = new GroundFootprints(
                fake as never,
                () => surface,
                () => 0,
            );
            walk(footprints, 50);
            expect(prints.length).toBeGreaterThan(0);
            expect(prints.every((print) => print.tint === FOOTPRINT_TINTS[surface].color)).toBe(true);
        }
    });

    it("are not left on the grass", () => {
        const { scene: fake, prints } = scene();
        const footprints = new GroundFootprints(
            fake as never,
            () => undefined,
            () => 0,
        );
        walk(footprints, 50);
        expect(prints).toHaveLength(0);
    });

    it("are laid as low as the ground they fall on, at the bottom of a hollow", () => {
        const { scene: fake, prints } = scene();
        const footprints = new GroundFootprints(
            fake as never,
            () => "snow",
            () => 32,
        );
        walk(footprints, 50);
        expect(prints.length).toBeGreaterThan(0);
        expect(prints.every((print) => print.y >= 50 + 32 - 4)).toBe(true);
    });
});
