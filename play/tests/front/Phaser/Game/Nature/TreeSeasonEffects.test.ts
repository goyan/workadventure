import { Season } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import { TreeSeasonEffects } from "../../../../../src/front/Phaser/Game/Nature/TreeSeasonEffects";

interface FakeImage {
    key: string;
    x: number;
    y: number;
    alpha: number;
    depth: number;
    destroyed: boolean;
}

function fixture(overrides: { season?: Season; enabled?: boolean; reducedMotion?: boolean; coverage?: number } = {}) {
    const state = {
        season: overrides.season ?? Season.Autumn,
        enabled: overrides.enabled ?? true,
        coverage: overrides.coverage ?? 1,
        outdoor: true,
        view: { x: 0, y: 0, width: 800, height: 600 },
    };
    const graphics = {
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
    };
    const images: FakeImage[] = [];
    const markDirty = vi.fn();
    const scene = {
        markDirty,
        textures: { exists: () => true },
        add: {
            graphics: () => graphics,
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
        bareSeason: () => Season.Autumn,
        windSpeed: () => 80,
        windFrom: () => 270,
        snowCoverage: () => state.coverage,
        enabled: () => state.enabled,
        isOutdoor: () => state.outdoor,
        view: () => state.view,
        reducedMotion: overrides.reducedMotion ?? false,
    });
    return { effects, graphics, images, markDirty, state, trees };
}

/** Server time of a drawing: `second` seconds into a fixed day. */
const at = (second: number) => 1_700_000_000_000 + second * 1000;

describe("TreeSeasonEffects", () => {
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

    it("shows the bare tree through the snowy one, less and less as the snow builds up", () => {
        const { effects, images, trees } = fixture({ season: Season.Winter });
        const alphas: number[] = [];
        for (let second = 0; second < 600; second += 2) {
            effects.update(second * 1000, at(second));
            alphas.push(images[0].alpha);
        }
        // Only the seasonal tree in view gets its bare image, right over it.
        expect(images.length).toBe(1);
        expect(images[0].key).toBe("autumn.png");
        expect(images[0].x).toBe(trees[0].object.x);
        expect(images[0].depth).toBeGreaterThan(trees[0].object.depth);
        expect(images[0].depth).toBeLessThan(trees[0].object.depth + 1);
        // The tree whitens (the bare image fades), then its snow falls off (the bare image comes back).
        expect(Math.min(...alphas)).toBeLessThan(0.05);
        expect(Math.max(...alphas)).toBeGreaterThan(0.8);
        const drops = alphas.filter((alpha, index) => index > 0 && alpha > alphas[index - 1] + 0.5).length;
        expect(drops).toBeGreaterThanOrEqual(2);
        expect([...effects.overlays()].map((overlay) => overlay.id)).toEqual(["oak"]);
    });

    it("drops snow on each side of the tree when it reaches its threshold", () => {
        const { effects, graphics, images } = fixture({ season: Season.Winter });
        let previous = 0;
        let fell = false;
        for (let tenth = 0; tenth < 3000 && !fell; tenth++) {
            graphics.fillRect.mockClear();
            effects.update(tenth * 100, at(tenth / 10));
            const alpha = images[0].alpha;
            if (tenth > 0 && alpha > previous + 0.5) {
                fell = true;
                const xs = graphics.fillRect.mock.calls.map(([x]) => x as number);
                expect(xs.some((x) => x < 132)).toBe(true);
                expect(xs.some((x) => x > 132)).toBe(true);
            }
            previous = alpha;
        }
        expect(fell).toBe(true);
    });

    it("carries no more snow than the map has, and drops none while there is little", () => {
        const { effects, graphics, images } = fixture({ season: Season.Winter, coverage: 0.1 });
        for (let tenth = 0; tenth < 3000; tenth++) effects.update(tenth * 100, at(tenth / 10));
        expect(images[0].alpha).toBeGreaterThanOrEqual(0.9);
        expect(graphics.fillRect).not.toHaveBeenCalled();
    });

    it("takes the bare images away when the snow is over, and when destroyed", () => {
        const { effects, images, state, graphics } = fixture({ season: Season.Winter });
        effects.update(0, at(0));
        expect(images[0].destroyed).toBe(false);
        state.season = Season.Summer;
        effects.update(1000, at(1));
        expect(images[0].destroyed).toBe(true);
        expect([...effects.overlays()]).toEqual([]);
        effects.destroy();
        expect(graphics.destroy).toHaveBeenCalled();
    });
});
