import { describe, expect, it, vi } from "vitest";
import { AquaticLife } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";
import { AquaticLifeView } from "../../../../../src/front/Phaser/Game/Life/AquaticLifeView";

vi.mock("../../../../../src/front/Phaser/Game/Life/AquaticSprites", () => ({
    ensureAquaticTexture: () => "texture",
}));

/** A scene that keeps the images it is asked for, and whose camera sees the map from 0 to 200 on both axes. */
function createScene() {
    const images: { x: number; y: number; alpha: number; flipX: boolean; destroyed: boolean; visible: boolean }[] = [];
    const markDirty = vi.fn();
    const scene = {
        markDirty,
        cameras: { main: { worldView: { x: 0, y: 0, width: 200, height: 200 } } },
        add: {
            image: (x: number, y: number) => {
                const image = {
                    x,
                    y,
                    alpha: 1,
                    visible: true,
                    flipX: false,
                    tint: undefined as number | undefined,
                    destroyed: false,
                    setDepth: () => image,
                    setPosition: (nextX: number, nextY: number) => {
                        image.x = nextX;
                        image.y = nextY;
                        return image;
                    },
                    setVisible: (visible: boolean) => {
                        image.visible = visible;
                        return image;
                    },
                    setAlpha: (alpha: number) => {
                        image.alpha = alpha;
                        return image;
                    },
                    setFlipX: (flip: boolean) => {
                        image.flipX = flip;
                        return image;
                    },
                    setTint: (tint: number) => {
                        image.tint = tint;
                        return image;
                    },
                    clearTint: () => {
                        image.tint = undefined;
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
    return { scene, images, markDirty };
}
type SceneOfView = ConstructorParameters<typeof AquaticLifeView>[0];

function createView(
    shown = { value: true },
    frozen = { value: false },
    dropAt?: (x: number, y: number) => number,
    hiddenAt?: (x: number, y: number) => boolean,
) {
    const { scene, images, markDirty } = createScene();
    const life = new AquaticLife();
    // The fake scene has only what the view uses.
    const view = new AquaticLifeView(
        scene as unknown as SceneOfView,
        life,
        () => shown.value,
        () => false,
        () => frozen.value,
        dropAt,
        hiddenAt,
    );
    return { view, life, images, markDirty, shown, frozen };
}

describe("AquaticLifeView", () => {
    it("stops an animal caught in the ice, pale and blue, and lets it swim on once the water thaws", () => {
        const { view, life, images, frozen } = createView();
        life.receive([{ id: 1, kind: 0, x: 100, y: 50 }], 0);
        view.update(0);
        frozen.value = true;
        life.receive([{ id: 1, kind: 0, x: 60, y: 50 }], 1000);
        view.update(1500);
        expect(images[0]).toMatchObject({ x: 100, y: 50, tint: 0xbfe0f0 });
        expect(images[0].alpha).toBeCloseTo(0.45);
        frozen.value = false;
        view.update(2000);
        expect(images[0]).toMatchObject({ x: 60, y: 50, tint: undefined });
        expect(images[0].alpha).toBeCloseTo(0.7);
    });

    it("draws an image for each animal, where it is, turned towards where it goes", () => {
        const { view, life, images } = createView();
        life.receive([{ id: 1, kind: 0, x: 100, y: 50 }], 0);
        life.receive([{ id: 1, kind: 0, x: 60, y: 50 }], 1000);
        view.update(1500);
        expect(images).toHaveLength(1);
        expect(images[0]).toMatchObject({ x: 80, y: 50, flipX: true });
        expect(images[0].alpha).toBeCloseTo(0.7);
    });

    it("draws a fish of a lake at the bottom of a hollow on the water drawn lower", () => {
        const { view, life, images } = createView({ value: true }, { value: false }, () => 30);
        life.receive([{ id: 1, kind: 0, x: 100, y: 50 }], 0);
        view.update(0);
        expect(images[0]).toMatchObject({ x: 100, y: 80 });
    });

    it("does not draw a fish of the part of a lake that the south rim of its hollow hides", () => {
        const { view, life, images } = createView(
            { value: true },
            { value: false },
            () => 30,
            (_x, y) => y > 100,
        );
        life.receive(
            [
                { id: 1, kind: 0, x: 100, y: 50 },
                { id: 2, kind: 0, x: 100, y: 150 },
            ],
            0,
        );
        view.update(0);
        expect(images.map((image) => image.visible)).toEqual([true, false]);
    });

    it("does not look at the water under an animal far out of the screen", () => {
        const dropAt = vi.fn(() => 30);
        const hiddenAt = vi.fn(() => false);
        const { view, life, images } = createView({ value: true }, { value: false }, dropAt, hiddenAt);
        life.receive(
            [
                { id: 1, kind: 0, x: 900, y: 900 },
                { id: 2, kind: 0, x: 100, y: 50 },
            ],
            0,
        );
        view.update(0);
        expect(images).toHaveLength(2);
        // The one on screen only.
        expect(dropAt.mock.calls).toEqual([[100, 50]]);
        expect(hiddenAt.mock.calls).toEqual([[100, 50]]);
    });

    it("still places an animal out of the screen whose water is drawn in it (a lake on a mount, south of the view)", () => {
        const dropAt = vi.fn(() => -120);
        const { view, life, images } = createView({ value: true }, { value: false }, dropAt);
        life.receive([{ id: 1, kind: 0, x: 100, y: 300 }], 0);
        view.update(0);
        expect(images[0]).toMatchObject({ x: 100, y: 180 });
    });

    it("asks ten times a second at most whether the rim of its hollow hides an animal", () => {
        const hidden = { value: false };
        const hiddenAt = vi.fn(() => hidden.value);
        const { view, life, images } = createView({ value: true }, { value: false }, () => 0, hiddenAt);
        life.receive([{ id: 1, kind: 0, x: 100, y: 50 }], 0);
        for (const now of [0, 16, 33, 50, 66, 83]) view.update(now);
        expect(hiddenAt).toHaveBeenCalledTimes(1);
        hidden.value = true;
        view.update(99);
        expect(images[0].visible).toBe(true);
        view.update(100);
        expect(hiddenAt).toHaveBeenCalledTimes(2);
        expect(images[0].visible).toBe(false);
    });

    it("asks for the scene to be drawn again only while an animal on screen moves or fades", () => {
        const { view, life, markDirty } = createView();
        life.receive([{ id: 1, kind: 0, x: 100, y: 50 }], 0);
        view.update(0);
        markDirty.mockClear();
        // At rest: nothing to draw again.
        view.update(100);
        view.update(200);
        expect(markDirty).not.toHaveBeenCalled();
        // It swims.
        life.receive([{ id: 1, kind: 0, x: 140, y: 50 }], 1000);
        view.update(1500);
        expect(markDirty).toHaveBeenCalled();
    });

    it("does not ask for anything while the animals that move are out of the screen", () => {
        const { view, life, markDirty } = createView();
        life.receive([{ id: 1, kind: 0, x: 900, y: 900 }], 0);
        view.update(0);
        markDirty.mockClear();
        life.receive([{ id: 1, kind: 0, x: 940, y: 900 }], 1000);
        view.update(1500);
        expect(markDirty).not.toHaveBeenCalled();
    });

    it("removes the image of an animal that is gone, and all of them when the player hides the life", () => {
        const { view, life, images, shown } = createView();
        life.receive(
            [
                { id: 1, kind: 0, x: 10, y: 10 },
                { id: 2, kind: 1, x: 20, y: 10 },
            ],
            0,
        );
        view.update(0);
        life.receive([{ id: 1, kind: 0, x: 10, y: 10 }], 1000);
        view.update(2000);
        expect(images.filter((image) => image.destroyed)).toHaveLength(1);
        shown.value = false;
        view.update(2100);
        expect(images.every((image) => image.destroyed)).toBe(true);
    });
});
