import { describe, expect, it, vi } from "vitest";
import { floorDepth } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorDepth";
import { AquaticLife } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";
import {
    directionOf,
    headingOf,
    landFrame,
    LandLifeView,
} from "../../../../../src/front/Phaser/Game/Life/LandLifeView";
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
    liftAt,
    dropAt,
}: {
    sheets?: Record<string, number>;
    sheetOf?: (species: string) => string | undefined;
    shown?: { value: boolean };
    lead?: ConstructorParameters<typeof LandLifeView>[5];
    grassAt?: ConstructorParameters<typeof LandLifeView>[6];
    liftAt?: ConstructorParameters<typeof LandLifeView>[7];
    dropAt?: ConstructorParameters<typeof LandLifeView>[8];
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
        liftAt,
        dropAt,
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

    it("on a bridge is drawn as high as its deck, over the slabs of that height", () => {
        const { view, life, sprites } = createView({ liftAt: (x) => (x >= 100 ? 20 : 0) });
        life.receive(
            [
                { id: 1, kind: 4, x: 50, y: 80 },
                { id: 2, kind: 4, x: 100, y: 80 },
            ],
            0,
        );
        view.update(0);
        expect(sprites[0]).toMatchObject({ x: 50, y: 80, depth: 80 });
        expect(sprites[1]).toMatchObject({ x: 100, y: 60, depth: floorDepth(20, 80) });
        // The slabs of the deck are drawn just under what stands on it.
        expect(sprites[1].depth).toBeGreaterThan(floorDepth(20, 0) - 1);
    });

    it("on a relief seen in 3/4 is drawn where its ground is, and still sorted by its place", () => {
        // A hollow drawn 40 px lower from x 100 on, a mount drawn 30 px higher from x 300 on.
        const dropAt = (x: number): number => (x >= 300 ? -30 : x >= 100 ? 40 : 0);
        const { view, life, sprites } = createView({ dropAt, liftAt: (x) => (x >= 400 ? 20 : 0) });
        life.receive(
            [
                { id: 1, kind: 4, x: 50, y: 80 },
                { id: 2, kind: 4, x: 100, y: 80 },
                { id: 3, kind: 4, x: 300, y: 80 },
                { id: 4, kind: 4, x: 400, y: 80 },
            ],
            0,
        );
        view.update(0);
        expect(sprites[0]).toMatchObject({ x: 50, y: 80, depth: 80 });
        expect(sprites[1]).toMatchObject({ x: 100, y: 120, depth: 80 });
        expect(sprites[2]).toMatchObject({ x: 300, y: 50, depth: 80 });
        // On the deck of a bridge it passes over the relief: as high as the deck, no more.
        expect(sprites[3]).toMatchObject({ x: 400, y: 60, depth: floorDepth(20, 80) });
    });

    it("a tamed animal on the deck of a bridge with its master passes over the relief, as they do", () => {
        // A hollow drawn 40 px lower everywhere; the master is on a deck over it, then back on the ground.
        let onDeck = true;
        const { view, life, sprites } = createView({
            dropAt: () => 40,
            lead: () => ({ x: 300, y: 200, direction: "down", moving: false, ...(onDeck ? { drop: 0 } : {}) }),
        });
        life.receive([{ id: 1, kind: 4, x: 50, y: 80 }], 0);
        view.update(0);
        expect(sprites[0]).toMatchObject({ x: 300, y: 200, depth: 200 });
        // Its master walks on the ground of the hollow: it is drawn as low as that ground, like them.
        onDeck = false;
        view.update(16);
        expect(sprites[0]).toMatchObject({ x: 300, y: 240, depth: 200 });
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
            // With how much lower each is drawn on a relief seen in 3/4 (none here): its shadow lies under it.
            { id: 1, x: 300, species: "lion", moving: true, led: true, drop: 0 },
            { id: 2, x: 50, species: "antelope", moving: false, led: false, drop: 0 },
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

describe("an animal of a herd", () => {
    /** A sheet of five columns, as the antelope of the catalogue: the rows down, left, right, up. */
    const rowOf = (frame: number | string): number => Math.floor(Number(frame) / 5);
    const herdView = (grassAt?: (x: number, y: number) => boolean) =>
        createView({ sheets: { antelope: 5 }, sheetOf: () => "antelope", grassAt });

    it("keeps its side while its way leans less than about 56° from it, and turns round when it comes back", () => {
        expect(headingOf(10, 12, "right")).toBe("right");
        expect(headingOf(10, 16, "right")).toBe("down");
        expect(headingOf(12, -10, "up")).toBe("up");
        expect(headingOf(-10, 1, "right")).toBe("left");
        expect(headingOf(1, 10, "up")).toBe("down");
        expect(headingOf(0, 0, "left")).toBe("left");
    });

    it("walks through the frames of its row while it glides slowly, even when a message comes late", () => {
        const { view, life, sprites } = herdView();
        // Twenty-five pixels a second to the right: less than half a pixel a frame.
        const told = [0, 1000, 2000, 3250, 4250];
        const frames = new Set<number | string>();
        const moving = new Set<boolean>();
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 0);
        view.update(0);
        for (let now = 16, next = 1; now < 4250; now += 16) {
            if (next < told.length && now >= told[next]) {
                life.receive([{ id: 1, kind: 4, x: 100 + 25 * next, y: 100 }], now);
                next++;
            }
            view.update(now);
            // It sets out with the first message, a second after the first place.
            if (now < 1300) continue;
            frames.add(sprites[0].frame.name);
            view.forEachShown((_id, _sprite, animal) => moving.add(animal.moving));
        }
        // The three frames of the walk to the right, never the frame it stands on alone.
        expect([...frames].sort()).toEqual([10, 11, 12]);
        expect([...moving]).toEqual([true]);
    });

    it("does not turn round for a step back nor aside of a few pixels", () => {
        const { view, life, sprites } = herdView();
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 0);
        view.update(0);
        // To the right, a step back of three pixels, a step down of four, and to the right again.
        const places = [
            [130, 100],
            [127, 100],
            [128, 104],
            [160, 104],
        ];
        const rows = new Set<number>();
        let now = 0;
        for (const [x, y] of places) {
            life.receive([{ id: 1, kind: 4, x, y }], now);
            for (const end = now + 1000; now < end; now += 16) {
                view.update(now);
                if (now >= 500) rows.add(rowOf(sprites[0].frame.name));
            }
        }
        expect([...rows]).toEqual([rowOf(landFrame("right", false, 0, 5))]);
    });

    it("bows to the grass only once it stood a while, not between two slow steps", () => {
        const { view, life, sprites } = herdView(() => true);
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 0);
        view.update(0);
        life.receive([{ id: 1, kind: 4, x: 120, y: 100 }], 16);
        let bowed = false;
        for (let now = 32; now <= 1024; now += 16) {
            view.update(now);
            bowed ||= sprites[0].angle !== 0 || sprites[0].scaleY !== 1;
        }
        expect(bowed).toBe(false);
        // It stopped at 1016, seen at 1024: head up for over a second (a message may come late), then down.
        view.update(1024 + 1200);
        expect(sprites[0].scaleY).toBe(1);
        expect(sprites[0].angle).toBe(0);
        view.update(1024 + 1400);
        expect(sprites[0].angle !== 0 || sprites[0].scaleY !== 1).toBe(true);
    });

    it("with reduced motion, does not bow to the grass between two messages while it walks", () => {
        const { scene, sprites } = createScene({ antelope: 5 });
        const life = new AquaticLife(isLandKind);
        const view = new LandLifeView(
            scene as unknown as SceneOfView,
            life,
            () => true,
            () => true,
            () => "antelope",
            undefined,
            () => true,
        );
        let bowed = false;
        for (let now = 0, second = 0; now < 5000; now += 16) {
            // A message a second, each one 20 pixels further: it jumps there at once.
            if (now >= second * 1000) life.receive([{ id: 1, kind: 4, x: 100 + 20 * second++, y: 100 }], now);
            view.update(now);
            if (now >= 1000) bowed ||= sprites[0].angle !== 0 || sprites[0].scaleY !== 1;
        }
        expect(bowed).toBe(false);
    });

    it("walks however slow it goes and however many frames a second are drawn", () => {
        const { view, life } = herdView();
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 0);
        view.update(0);
        // Three pixels in a second, drawn at 120 frames a second: 0.025 pixel a frame.
        life.receive([{ id: 1, kind: 4, x: 103, y: 100 }], 1);
        const moving = new Set<boolean>();
        for (let now = 9; now < 1000; now += 1000 / 120) {
            view.update(now);
            view.forEachShown((_id, _sprite, animal) => moving.add(animal.moving));
        }
        expect([...moving]).toEqual([true]);
    });

    it("drawn here, rises a pixel every other step while it walks, and keeps its side going down", () => {
        const { view, life, sprites } = createView();
        life.receive([{ id: 1, kind: 4, x: 100, y: 100 }], 0);
        view.update(0);
        life.receive([{ id: 1, kind: 4, x: 60, y: 100 }], 16);
        const heights = new Set<number>();
        for (let now = 32; now < 1000; now += 16) {
            view.update(now);
            heights.add(sprites[0].y);
        }
        expect([...heights].sort((a, b) => a - b)).toEqual([99, 100]);
        expect(sprites[0].flipX).toBe(true);
        // Down: still turned to the left.
        life.receive([{ id: 1, kind: 4, x: 60, y: 140 }], 1016);
        for (let now = 1032; now < 2000; now += 16) view.update(now);
        expect(sprites[0].flipX).toBe(true);
        // Once it stands, on its feet.
        view.update(2500);
        expect(sprites[0].y).toBe(140);
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
