import { describe, expect, it, vi } from "vitest";
import { ZombieBlastView } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieBlastView";
import { DEPTH_LAMP_LIGHT_INDEX } from "../../../../../src/front/Phaser/Game/DepthIndexes";
import { floorDepth } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorDepth";

vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0 } }));

interface FakeImage {
    x: number;
    y: number;
    depth: number;
    visible: boolean;
}

/** A scene whose textures are drawn already, that keeps the images it is asked for. */
function createScene() {
    const images: FakeImage[] = [];
    const scene = {
        markDirty: vi.fn(),
        textures: { exists: () => true },
        add: {
            image: () => {
                const made: FakeImage = { x: 0, y: 0, depth: 0, visible: true };
                images.push(made);
                const image = {
                    setTexture: () => image,
                    setTint: () => image,
                    setAlpha: () => image,
                    setScale: () => image,
                    setRotation: () => image,
                    setBlendMode: () => image,
                    setDepth: (depth: number) => {
                        made.depth = depth;
                        return image;
                    },
                    setPosition: (x: number, y: number) => {
                        made.x = x;
                        made.y = y;
                        return image;
                    },
                    setVisible: (visible: boolean) => {
                        made.visible = visible;
                        return image;
                    },
                };
                return image;
            },
        },
    };
    return { scene: scene as unknown as ConstructorParameters<typeof ZombieBlastView>[0], images };
}

/** The slabs of a deck 20 px up are drawn just under floorDepth(20, 0) (floorPieceDepth). */
const SLABS_20 = floorDepth(20, 0) - 1 + 1e-3;

describe("ZombieBlastView", () => {
    it("draws a grenade rolling on the deck of a bridge, and its shadow, over the slabs and as high as the deck", () => {
        const { scene, images } = createScene();
        const view = new ZombieBlastView(scene, (x) => (x >= 500 ? 20 : 0));
        view.setGrenades([
            { x: 520, y: 300, z: 0 },
            { x: 100, y: 300, z: 0 },
        ]);
        const [shadowOnDeck, onDeck, shadowOnGround, onGround] = images;
        expect(shadowOnDeck.depth).toBeGreaterThan(SLABS_20);
        // Its shadow under whatever stands on the deck, even at the top of the map.
        expect(shadowOnDeck.depth).toBeLessThan(floorDepth(20, 1));
        expect(onDeck.depth).toBeGreaterThan(SLABS_20);
        expect(shadowOnDeck.y).toBe(280);
        expect(onDeck.y).toBe(276);
        // On the ground, as before.
        expect(shadowOnGround.depth).toBeLessThan(1);
        expect(onGround.depth).toBe(301);
        expect(onGround.y).toBe(296);
    });

    it("draws the blast of a grenade gone off on a deck over its slabs: none of it under them", () => {
        const { scene, images } = createScene();
        const view = new ZombieBlastView(scene, () => 20);
        view.blast(520, 300, 0, false);
        view.flame(520, 300, 0, 0, 3);
        expect(images.length).toBeGreaterThan(20);
        for (const image of images) expect(image.depth).toBeGreaterThan(SLABS_20);
        // The flash over the night stays over everything.
        expect(images[0].depth).toBe(DEPTH_LAMP_LIGHT_INDEX + 1);
    });

    it("throws less smoke and debris once many grenades go off together", () => {
        const { scene, images } = createScene();
        const view = new ZombieBlastView(scene);
        view.blast(100, 100, 0, false);
        const one = images.length;
        // Eight blasts at once: over half of its pool of images, not yet all of it.
        for (let blast = 1; blast < 8; blast++) view.blast(100 + blast * 50, 100, 0, false);
        expect(images.length).toBe(8 * one);
        view.blast(2000, 100, 0, false);
        // Past half its pool, a blast spawns as few bits as in reduced motion.
        expect(images.length - 8 * one).toBeLessThan(one / 2);
    });
});
