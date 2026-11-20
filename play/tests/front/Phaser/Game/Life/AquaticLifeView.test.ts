import { describe, expect, it, vi } from "vitest";
import { AquaticLife } from "../../../../../src/front/Phaser/Game/Life/AquaticLife";
import { AquaticLifeView } from "../../../../../src/front/Phaser/Game/Life/AquaticLifeView";

vi.mock("../../../../../src/front/Phaser/Game/Life/AquaticSprites", () => ({
    ensureAquaticTexture: () => "texture",
}));

/** A scene that keeps the images it is asked for, and whose camera sees the map from 0 to 200 on both axes. */
function createScene() {
    const images: { x: number; y: number; alpha: number; flipX: boolean; destroyed: boolean }[] = [];
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
                    flipX: false,
                    tint: undefined as number | undefined,
                    destroyed: false,
                    setDepth: () => image,
                    setPosition: (nextX: number, nextY: number) => {
                        image.x = nextX;
                        image.y = nextY;
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

function createView(shown = { value: true }, frozen = { value: false }) {
    const { scene, images, markDirty } = createScene();
    const life = new AquaticLife();
    // The fake scene has only what the view uses.
    const view = new AquaticLifeView(
        scene as unknown as SceneOfView,
        life,
        () => shown.value,
        () => false,
        () => frozen.value,
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
