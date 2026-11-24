import { describe, expect, it, vi } from "vitest";
import { AquaticLife } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";
import {
    GULL_ALTITUDE_PX,
    GULL_FLIGHT_DEPTH,
    GullLifeView,
    isGullKind,
} from "../../../../../src/front/Phaser/Game/Life/GullLifeView";

vi.mock("../../../../../src/front/Phaser/Game/Life/GullSprites", () => ({
    ensureGullTexture: (_scene: unknown, pose: string) => `gull:${pose}`,
    GULL_FLAP_MS: 200,
}));

interface Drawn {
    kind: "sprite" | "ellipse";
    x: number;
    y: number;
    key: string;
    depth: number;
    alpha: number;
    flipX: boolean;
    visible: boolean;
    destroyed: boolean;
}

function create(shown = { value: true }, dropAt?: (x: number, y: number) => number) {
    const drawn: Drawn[] = [];
    const make = (kind: Drawn["kind"], x: number, y: number, key: string) => {
        const object = {
            kind,
            x,
            y,
            key,
            depth: 0,
            alpha: 1,
            flipX: false,
            visible: true,
            destroyed: false,
            setOrigin: () => object,
            setTexture: (next: string) => ((object.key = next), object),
            setPosition: (nextX: number, nextY: number) => ((object.x = nextX), (object.y = nextY), object),
            setDepth: (depth: number) => ((object.depth = depth), object),
            setAlpha: (alpha: number) => ((object.alpha = alpha), object),
            setFlipX: (flip: boolean) => ((object.flipX = flip), object),
            setVisible: (visible: boolean) => ((object.visible = visible), object),
            destroy: () => {
                object.destroyed = true;
            },
        };
        drawn.push(object);
        return object;
    };
    const markDirty = vi.fn();
    const scene = {
        markDirty,
        cameras: { main: { worldView: { x: 0, y: 0, width: 800, height: 800 } } },
        textures: {},
        add: {
            sprite: (x: number, y: number, key: string) => make("sprite", x, y, key),
            ellipse: (x: number, y: number) => make("ellipse", x, y, ""),
        },
    };
    const life = new AquaticLife(isGullKind);
    const view = new GullLifeView(
        scene as unknown as ConstructorParameters<typeof GullLifeView>[0],
        life,
        () => shown.value,
        () => false,
        dropAt,
    );
    const sprites = () => drawn.filter((one) => one.kind === "sprite" && !one.destroyed);
    const shadows = () => drawn.filter((one) => one.kind === "ellipse" && !one.destroyed);
    return { view, life, drawn, sprites, shadows, markDirty, shown };
}

describe("GullLifeView", () => {
    it("knows the kinds of the gulls: the sixth species", () => {
        expect([9, 10, 11, 12].map(isGullKind)).toEqual([false, true, true, false]);
    });

    it("draws a flying gull above everything, raised over its shadow on the ground", () => {
        const { view, life, sprites, shadows } = create();
        life.receive([{ id: 1, kind: 10, x: 100, y: 200, state: 1 }], 0);
        view.update(0);
        expect(sprites()).toHaveLength(1);
        expect(sprites()[0]).toMatchObject({ x: 100, y: 200 - GULL_ALTITUDE_PX, depth: GULL_FLIGHT_DEPTH });
        expect(shadows()[0]).toMatchObject({ x: 100, y: 200, visible: true });
        expect(shadows()[0].depth).toBeLessThan(GULL_FLIGHT_DEPTH);
    });

    it("over a relief seen in 3/4 has its shadow where the ground or the water is drawn, and flies as high over it", () => {
        // A lake at the bottom of a hollow, its surface drawn 40 px lower.
        const { view, life, sprites, shadows } = create(undefined, () => 40);
        life.receive(
            [
                { id: 1, kind: 10, x: 100, y: 200, state: 1 },
                { id: 2, kind: 11, x: 300, y: 200, state: 2 },
            ],
            0,
        );
        view.update(0);
        expect(shadows()[0]).toMatchObject({ x: 100, y: 240 });
        expect(sprites()[0]).toMatchObject({ x: 100, y: 240 - GULL_ALTITUDE_PX, depth: GULL_FLIGHT_DEPTH });
        // Landed: on the ground where it is drawn, sorted by its place.
        expect(sprites()[1]).toMatchObject({ x: 300, y: 240, depth: 200 });
    });

    it("flaps its wings as it flies", () => {
        const { view, life, sprites } = create();
        life.receive([{ id: 1, kind: 10, x: 100, y: 200, state: 1 }], 0);
        view.update(0);
        const first = sprites()[0].key;
        view.update(200);
        expect(sprites()[0].key).not.toBe(first);
        view.update(400);
        expect(sprites()[0].key).toBe(first);
    });

    it("draws a landed gull on the ground among the avatars, without a shadow apart", () => {
        const { view, life, sprites, shadows } = create();
        life.receive([{ id: 1, kind: 11, x: 100, y: 200, state: 2 }], 0);
        view.update(0);
        expect(sprites()[0]).toMatchObject({ x: 100, y: 200, depth: 200, key: "gull:landed" });
        expect(shadows()[0].visible).toBe(false);
    });

    it("draws nothing while the life of the water is hidden, and takes away a gull that is gone", () => {
        const { view, life, sprites, shadows, shown } = create();
        life.receive([{ id: 1, kind: 10, x: 100, y: 200, state: 1 }], 0);
        view.update(0);
        shown.value = false;
        view.update(16);
        expect(sprites()).toHaveLength(0);
        expect(shadows()).toHaveLength(0);
        shown.value = true;
        view.update(32);
        expect(sprites()).toHaveLength(1);
        life.receive([], 1000);
        view.update(1400);
        expect(sprites()).toHaveLength(0);
    });
});
