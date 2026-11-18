import { Season } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import { TreeSeasonEffects } from "../../../../../src/front/Phaser/Game/Nature/TreeSeasonEffects";

interface FakeImage {
    key: string;
    x: number;
    y: number;
    alpha: number;
    displayWidth: number;
    depth: number;
    destroyed: boolean;
    /** Share of the image hidden from its top (0 to 1): the snowy tree shows there. */
    snow: number;
}

function fixture(
    overrides: { season?: Season; enabled?: boolean; reducedMotion?: boolean; coverage?: number; pose?: number } = {},
) {
    const state = {
        season: overrides.season ?? Season.Autumn,
        enabled: overrides.enabled ?? true,
        coverage: overrides.coverage ?? 1,
        outdoor: true,
        view: { x: 0, y: 0, width: 800, height: 600 },
    };
    const newGraphics = () => ({
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
    });
    /** What falls, over the trees; and the leaves lying on the ground, under everyone. */
    const graphics = newGraphics();
    const ground = newGraphics();
    const made = [graphics, ground];
    const images: FakeImage[] = [];
    const markDirty = vi.fn();
    const scene = {
        markDirty,
        textures: { exists: () => true },
        add: {
            graphics: () => made.shift() ?? newGraphics(),
            image: (x: number, y: number, key: string) => {
                const image = {
                    key,
                    x,
                    y,
                    alpha: 1,
                    depth: 0,
                    rotation: 0,
                    displayWidth: 0,
                    displayHeight: 0,
                    destroyed: false,
                    snow: 0,
                    // A bent image is 4 px wider on each side than the tree's own.
                    get frame() {
                        return { width: image.key.includes("@") ? 40 : 32, height: 48 };
                    },
                    setCrop: (x: number, y: number, width: number, height: number) => {
                        expect([x, width, y + height]).toEqual([0, image.frame.width, 48]);
                        image.snow = y / 48;
                        return image;
                    },
                    setOrigin: () => image,
                    setPosition: (px: number, py: number) => {
                        image.x = px;
                        image.y = py;
                        return image;
                    },
                    setDisplaySize: (width: number, height: number) => {
                        image.displayWidth = width;
                        image.displayHeight = height;
                        return image;
                    },
                    setDepth: (depth: number) => {
                        image.depth = depth;
                        return image;
                    },
                    setAlpha: (alpha: number) => {
                        image.alpha = alpha;
                        return image;
                    },
                    setTexture: (texture: string) => {
                        image.key = texture;
                        return image;
                    },
                    destroy: () => {
                        image.destroyed = true;
                    },
                };
                images.push(image);
                return image;
            },
        },
    };
    const seasonal = { spring: "green.png", summer: "green.png", autumn: "autumn.png", winter: "snow.png" };
    const tree = (id: string, x: number, withSeasons = true) => ({
        id,
        object: {
            x,
            y: 200,
            displayWidth: 64,
            displayHeight: 96,
            depth: 900_000,
            visible: true,
            getPrefab: () => ({ imagePath: "autumn.png", ...(withSeasons ? { seasonal } : {}) }),
        },
    });
    const trees = [tree("oak", 100), tree("far", 5000), tree("plain", 300, false)];
    const effects = new TreeSeasonEffects(scene as never, {
        trees: () => trees,
        season: () => state.season,
        autumnProgress: () => 0.5,
        windSpeed: () => 80,
        windFrom: () => 270,
        snowCoverage: () => state.coverage,
        enabled: () => state.enabled,
        isOutdoor: () => state.outdoor,
        view: () => state.view,
        reducedMotion: overrides.reducedMotion ?? false,
    });
    return { effects, graphics, ground, images, markDirty, state, trees };
}

/** Server time of a drawing: `second` seconds into a fixed day. */
const at = (second: number) => 1_700_000_000_000 + second * 1000;

describe("TreeSeasonEffects", () => {
    it("drops no leaf from an evergreen, whose autumn image is its summer one", () => {
        const { effects, graphics, ground, trees } = fixture({ season: Season.Autumn });
        const evergreen = { spring: "fir.png", summer: "fir.png", autumn: "fir.png", winter: "fir-snow.png" };
        for (const { object } of trees) object.getPrefab = () => ({ imagePath: "fir.png", seasonal: evergreen });
        effects.update(0, at(0));
        expect(graphics.fillRect).not.toHaveBeenCalled();
        expect(ground.fillRect).not.toHaveBeenCalled();
    });

    it("drops leaves under the autumn trees in view, and nothing in summer", () => {
        const { effects, graphics, markDirty, state, images } = fixture();
        effects.update(0, at(0));
        // Two trees in view in a storm: six leaves each, none for the tree far outside the screen.
        expect(graphics.fillRect).toHaveBeenCalledTimes(12);
        for (const [x] of graphics.fillRect.mock.calls) expect(x).toBeLessThan(1000);
        expect(markDirty).toHaveBeenCalled();
        expect(images).toEqual([]);

        state.season = Season.Summer;
        graphics.fillRect.mockClear();
        effects.update(1000, at(1));
        expect(graphics.fillRect).not.toHaveBeenCalled();
        expect(graphics.clear).toHaveBeenCalled();
    });

    it("lays the fallen leaves on the ground under the autumn trees, below the characters", () => {
        const { effects, ground, graphics, state } = fixture();
        effects.update(0, at(0));
        // Half way into autumn: half of the forty leaves of each of the two trees in view.
        expect(ground.fillRect).toHaveBeenCalledTimes(40);
        const groundDepth = ground.setDepth.mock.calls[0][0] as number;
        expect(groundDepth).toBeLessThan(2);
        expect(graphics.setDepth.mock.calls[0][0]).toBeGreaterThan(900_000);
        state.season = Season.Winter;
        ground.fillRect.mockClear();
        effects.update(1000, at(1));
        expect(ground.fillRect).not.toHaveBeenCalled();
    });

    it("draws 15 times a second at most", () => {
        const { effects, graphics } = fixture();
        effects.update(0, at(0));
        effects.update(10, at(0.01));
        expect(graphics.clear).toHaveBeenCalledTimes(1);
        effects.update(100, at(0.1));
        expect(graphics.clear).toHaveBeenCalledTimes(2);
    });

    it("leaves the trees indoors alone", () => {
        const { effects, graphics, state } = fixture();
        state.outdoor = false;
        effects.update(0, at(0));
        expect(graphics.fillRect).not.toHaveBeenCalled();
    });

    it.each([
        ["while editing the map", { enabled: false }],
        ["with reduced motion", { reducedMotion: true }],
    ])("does nothing %s", (_, overrides) => {
        const { effects, graphics, images } = fixture({ ...overrides, season: Season.Winter });
        effects.update(0, at(0));
        expect(graphics.fillRect).not.toHaveBeenCalled();
        expect(images).toEqual([]);
    });

    it("shows the snowy tree whole: nothing is drawn over it, whatever the season under the snow", () => {
        const { effects, images } = fixture({ season: Season.Winter });
        for (let second = 0; second < 600; second += 2) effects.update(second * 1000, at(second));
        expect(images).toEqual([]);
    });

    it("drops snow on each side of the tree now and then", () => {
        const { effects, graphics } = fixture({ season: Season.Winter });
        for (let tenth = 0; tenth < 3000; tenth++) effects.update(tenth * 100, at(tenth / 10));
        const xs = graphics.fillRect.mock.calls.map(([x]) => x as number);
        // The seasonal tree in view stands from 100 to 164: snow falls on both sides of its middle.
        expect(xs.some((x) => x < 132)).toBe(true);
        expect(xs.some((x) => x > 132)).toBe(true);
    });

    it("drops no snow while the map has little", () => {
        const { effects, graphics } = fixture({ season: Season.Winter, coverage: 0.1 });
        for (let tenth = 0; tenth < 3000; tenth++) effects.update(tenth * 100, at(tenth / 10));
        expect(graphics.fillRect).not.toHaveBeenCalled();
    });

    it("removes its drawings when destroyed", () => {
        const { effects, graphics } = fixture({ season: Season.Winter });
        for (let tenth = 0; tenth < 3000; tenth++) effects.update(tenth * 100, at(tenth / 10));
        effects.destroy();
        expect(graphics.destroy).toHaveBeenCalled();
    });
});
