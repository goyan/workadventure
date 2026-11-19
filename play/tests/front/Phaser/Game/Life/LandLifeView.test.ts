import { describe, expect, it, vi } from "vitest";
import { AquaticLife } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";
import { directionOf, landFrame, LandLifeView } from "../../../../../src/front/Phaser/Game/Life/LandLifeView";
import { drinkStance } from "../../../../../src/front/Phaser/Game/Wander/WanderDrink";
import { isLandKind, landSpeciesOf } from "../../../../../src/front/Phaser/Game/Life/LandSprites";

vi.mock("../../../../../src/front/Phaser/Game/Life/LandSprites", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    ensureLandTexture: (_scene: unknown, species: string) => `drawn:${species}`,
}));

interface FakeSprite {
    x: number;
    y: number;
    key: string;
    alpha: number;
    depth: number;
    flipX: boolean;
    frame: { name: number | string };
    destroyed: boolean;
    angle: number;
    scaleY: number;
}

/** A scene that keeps the sprites it is asked for; `sheets` are the sheets already loaded, with their columns. */
function createScene(sheets: Record<string, number> = {}) {
    const sprites: FakeSprite[] = [];
    const loaded: string[] = [];
    const markDirty = vi.fn();
    const scene = {
        markDirty,
        cameras: { main: { worldView: { x: 0, y: 0, width: 400, height: 400 } } },
        textures: {
            exists: (key: string) => key in sheets,
            get: (key: string) => ({
                getSourceImage: () => ({ width: sheets[key] * 32, height: 128 }),
                frameTotal: sheets[key] * 4 + 1,
            }),
        },
        load: {
            spritesheet: (key: string) => loaded.push(key),
            start: vi.fn(),
        },
        add: {
            sprite: (x: number, y: number, key: string) => {
                const sprite = {
                    x,
                    y,
                    key,
                    alpha: 1,
                    depth: 0,
                    flipX: false,
                    frame: { name: -1 as number | string },
                    destroyed: false,
                    angle: 0,
                    scaleY: 1,
                    setAngle: (angle: number) => {
                        sprite.angle = angle;
                        return sprite;
                    },
                    setScale: (_x: number, y: number) => {
                        sprite.scaleY = y;
                        return sprite;
                    },
                    setOrigin: () => sprite,
                    setTexture: (next: string) => {
                        sprite.key = next;
                        return sprite;
                    },
                    setPosition: (nextX: number, nextY: number) => {
                        sprite.x = nextX;
                        sprite.y = nextY;
                        return sprite;
                    },
                    setDepth: (depth: number) => {
                        sprite.depth = depth;
                        return sprite;
                    },
                    setAlpha: (alpha: number) => {
                        sprite.alpha = alpha;
                        return sprite;
                    },
                    setFlipX: (flip: boolean) => {
                        sprite.flipX = flip;
                        return sprite;
                    },
                    setFrame: (frame: number) => {
                        sprite.frame = { name: frame };
                        return sprite;
                    },
                    destroy: () => {
                        sprite.destroyed = true;
                    },
                };
                sprites.push(sprite);
                return sprite;
            },
        },
    };
    return { scene, sprites, loaded, markDirty };
}
type SceneOfView = ConstructorParameters<typeof LandLifeView>[0];

function createView({
    sheets = {},
    sheetOf = () => undefined as string | undefined,
    shown = { value: true },
    lead,
    grassAt,
}: {
    sheets?: Record<string, number>;
    sheetOf?: (species: string) => string | undefined;
    shown?: { value: boolean };
    lead?: ConstructorParameters<typeof LandLifeView>[5];
    grassAt?: ConstructorParameters<typeof LandLifeView>[6];
} = {}) {
    const { scene, sprites, loaded, markDirty } = createScene(sheets);
    const life = new AquaticLife(isLandKind);
    const view = new LandLifeView(
        scene as unknown as SceneOfView,
        life,
        () => shown.value,
        () => false,
        sheetOf,
        lead,
        grassAt,
    );
    return { view, life, sprites, loaded, markDirty, shown };
}

describe("the kinds of the land", () => {
    it("are the antelope, the lion and the tiger, males and females", () => {
        expect([4, 5, 6, 7, 8, 9].map(landSpeciesOf)).toEqual([
            "antelope",
            "antelope",
            "lion",
            "lion",
            "tiger",
            "tiger",
        ]);
        expect([0, 1, 2, 3, 10].map(isLandKind)).toEqual([false, false, false, false, false]);
    });
});

describe("how an animal of the land is drawn", () => {
    it("faces where it goes, and keeps its side when it stands", () => {
        expect(directionOf(5, 1, "down")).toBe("right");
        expect(directionOf(-5, 1, "down")).toBe("left");
        expect(directionOf(1, -5, "down")).toBe("up");
        expect(directionOf(1, 5, "up")).toBe("down");
        expect(directionOf(0, 0, "left")).toBe("left");
    });

    it("walks through the frames of its row, and stands on the middle one", () => {
        // A sheet of five columns: the row of "left" starts at the frame 5.
        expect(landFrame("left", false, 0, 5)).toBe(6);
        expect([0, 150, 300, 450, 600].map((now) => landFrame("left", true, now, 5))).toEqual([5, 6, 7, 6, 5]);
    });
});

describe("LandLifeView", () => {
    it("draws only the animals of the land, among the avatars: its depth is its place", () => {
        const { view, life, sprites } = createView();
        life.receive(
            [
                { id: 1, kind: 0, x: 10, y: 10 },
                { id: 2, kind: 4, x: 100, y: 50 },
                { id: 3, kind: 7, x: 200, y: 80 },
            ],
            0,
        );
        view.update(0);
        expect(sprites.map((sprite) => sprite.key)).toEqual(["drawn:antelope", "drawn:lion"]);
        expect(sprites[0]).toMatchObject({ x: 100, y: 50, depth: 50 });
    });

    it("turns the image drawn here towards where the animal goes", () => {
        const { view, life, sprites } = createView();
        life.receive([{ id: 1, kind: 4, x: 100, y: 50 }], 0);
        view.update(0);
        life.receive([{ id: 1, kind: 4, x: 60, y: 50 }], 1000);
        view.update(1500);
        expect(sprites[0]).toMatchObject({ x: 80, flipX: true });
    });

    it("asks for the sheet of a lion once, then draws it with its frames", () => {
        const sheets: Record<string, number> = {};
        const { view, life, sprites, loaded } = createView({
            sheets,
            sheetOf: (species) => (species === "lion" ? "lion-sheet.png" : undefined),
        });
        life.receive([{ id: 1, kind: 6, x: 100, y: 50 }], 0);
        view.update(0);
        view.update(16);
        expect(loaded).toEqual(["lion-sheet.png"]);
        expect(sprites[0].key).toBe("drawn:lion");
        // The sheet came.
        sheets["lion-sheet.png"] = 5;
        life.receive([{ id: 1, kind: 6, x: 100, y: 90 }], 1000);
        view.update(1500);
        expect(sprites[0].key).toBe("lion-sheet.png");
        expect(sprites[0].flipX).toBe(false);
        // It walks down: the first row of the sheet.
        expect([0, 1, 2]).toContain(sprites[0].frame.name);
    });

    it("removes an animal the server tells no more, and all of them while the jungle is hidden", () => {
        const { view, life, sprites, shown } = createView();
        life.receive(
            [
                { id: 1, kind: 4, x: 100, y: 50 },
                { id: 2, kind: 5, x: 120, y: 50 },
            ],
            0,
        );
        view.update(0);
        life.receive([{ id: 1, kind: 4, x: 100, y: 50 }], 1000);
        view.update(2000);
        expect(sprites.map((sprite) => sprite.destroyed)).toEqual([false, true]);
        shown.value = false;
        view.update(2100);
        expect(sprites.every((sprite) => sprite.destroyed)).toBe(true);
    });
});

describe("LandLifeView, a tamed animal", () => {
    it("is drawn where its master leads it, turned and walking as told", () => {
        const { view, life, sprites } = createView({
            sheets: { "lion.png": 3 },
            sheetOf: (species) => (species === "lion" ? "lion.png" : undefined),
            lead: (animal) => (animal.owner === 7 ? { x: 300, y: 200, direction: "up", moving: false } : undefined),
        });
        life.receive(
            [
                { id: 1, kind: 6, x: 100, y: 100, owner: 7 },
                { id: 2, kind: 6, x: 50, y: 60 },
            ],
            0,
        );
        view.update(0);
        expect(sprites[0]).toMatchObject({ x: 300, y: 200, depth: 200 });
        expect(sprites[0].frame.name).toBe(landFrame("up", false, 0, 3));
        expect(sprites[1]).toMatchObject({ x: 50, y: 60 });
    });

    it("is not drawn while its master is out of view, and comes back with them", () => {
        const away = { value: true };
        const { view, life, sprites } = createView({
            lead: () => (away.value ? "hidden" : { x: 300, y: 200, direction: "left", moving: true }),
        });
        life.receive([{ id: 1, kind: 6, x: 100, y: 100, owner: 7 }], 0);
        view.update(0);
        expect(sprites).toHaveLength(0);
        away.value = false;
        view.update(16);
        expect(sprites).toHaveLength(1);
        away.value = true;
        view.update(32);
        expect(sprites[0].destroyed).toBe(true);
    });
});

describe("LandLifeView, what is drawn now", () => {
    it("tells each animal drawn, its species, whether it walks and whether it is led", () => {
        const { view, life } = createView({
            lead: (animal) => (animal.owner === 7 ? { x: 300, y: 200, direction: "up", moving: true } : undefined),
        });
        life.receive(
            [
                { id: 1, kind: 6, x: 100, y: 100, owner: 7 },
                { id: 2, kind: 4, x: 50, y: 60 },
            ],
            0,
        );
        view.update(0);
        view.update(16);
        const told: unknown[] = [];
        view.forEachShown((id, sprite, animal) => told.push({ id, x: sprite.x, ...animal }));
        expect(told).toEqual([
            { id: 1, x: 300, species: "lion", moving: true, led: true },
            { id: 2, x: 50, species: "antelope", moving: false, led: false },
        ]);
    });
});

describe("an animal that glides slowly", () => {
    it("keeps facing where it goes, whatever the rounding of its place on screen", () => {
        const { view, life, sprites } = createView({ sheets: { lion: 3 }, sheetOf: () => "lion" });
        life.receive([{ id: 1, kind: 6, x: 100, y: 100 }], 0);
        view.update(0);
        // Twelve pixels to the right and eight down in a second: less than a pixel a frame.
        life.receive([{ id: 1, kind: 6, x: 112, y: 108 }], 1000);
        const rows = new Set<number>();
        for (let now = 1016; now < 2000; now += 16) {
            view.update(now);
            rows.add(Math.floor(Number(sprites[0].frame.name) / 3));
        }
        expect([...rows]).toEqual([Math.floor(landFrame("right", false, 0, 3) / 3)]);
    });

    it("does not turn round when it is drawn here (the antelope)", () => {
        const { view, life, sprites } = createView();
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 0);
        view.update(0);
        life.receive([{ id: 1, kind: 4, x: 112, y: 108 }], 1000);
        const flips = new Set<boolean>();
        for (let now = 1016; now < 2000; now += 16) {
            view.update(now);
            flips.add(sprites[0].flipX);
        }
        expect([...flips]).toEqual([false]);
    });
});

describe("LandLifeView, a drinking animal", () => {
    it("bows to the water while the server says it drinks, and stands up again after", () => {
        const { view, life, sprites } = createView();
        life.receive([{ id: 1, kind: 4, x: 100, y: 100, state: 3 }], 0);
        view.update(0);
        view.update(16);
        // The image drawn here heads right: bowed that way.
        expect(sprites[0].angle).toBe(drinkStance("right", 0, false).angle);
        expect(sprites[0].angle).not.toBe(0);
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 1000);
        view.update(1016);
        expect(sprites[0]).toMatchObject({ angle: 0, scaleY: 1, x: 100, y: 100 });
    });

    it("a tamed animal never bows: it follows its master", () => {
        const { view, life, sprites } = createView({
            lead: () => ({ x: 300, y: 200, direction: "right", moving: false }),
        });
        life.receive([{ id: 1, kind: 6, x: 100, y: 100, owner: 7, state: 3 }], 0);
        view.update(0);
        expect(sprites[0].angle).toBe(0);
    });
});

describe("LandLifeView, an antelope on grass", () => {
    it("grazes head down while it stands still on grass, and not while it walks nor on bare ground", () => {
        // Grass on the left of the map only.
        const { view, life, sprites } = createView({ grassAt: (x) => x < 200 });
        life.receive(
            [
                { id: 1, kind: 4, x: 100, y: 100 },
                { id: 2, kind: 4, x: 300, y: 100 },
            ],
            0,
        );
        view.update(0);
        view.update(16);
        expect(sprites[0].angle).not.toBe(0);
        expect(sprites[1].angle).toBe(0);
        // It walks away: head up.
        life.receive(
            [
                { id: 1, kind: 4, x: 160, y: 100 },
                { id: 2, kind: 4, x: 300, y: 100 },
            ],
            1000,
        );
        view.update(1500);
        expect(sprites[0].angle).toBe(0);
    });

    it("a lion does not graze", () => {
        const { view, life, sprites } = createView({ grassAt: () => true });
        life.receive([{ id: 1, kind: 6, x: 100, y: 100 }], 0);
        view.update(0);
        view.update(16);
        expect(sprites[0].angle).toBe(0);
    });
});
