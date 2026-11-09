import { describe, expect, it, vi } from "vitest";
import { createLamp, type LampKind, type LampPlacement } from "../../../../../src/front/Phaser/Game/Lamps/LampVisuals";
import type { LampFrame } from "../../../../../src/front/Phaser/Game/Lamps/LampSignal";

// Phaser needs a browser to load: the visuals only use its blend mode constant, the images are the scene's.
vi.mock("phaser", () => ({ BlendModes: { ADD: 1 } }));

/** An image that takes every call the visuals make and answers with itself, like the chainable Phaser ones. */
class FakeImage {
    public destroyed = false;
    public visible = true;
    public alpha = 1;
    public position = { x: 0, y: 0 };
    constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly texture: string,
    ) {
        this.position = { x, y };
    }
    setOrigin(): this {
        return this;
    }
    setDisplaySize(): this {
        return this;
    }
    setBlendMode(): this {
        return this;
    }
    setDepth(): this {
        return this;
    }
    setTint(): this {
        return this;
    }
    setRotation(): this {
        return this;
    }
    setAlpha(alpha: number): this {
        this.alpha = alpha;
        return this;
    }
    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }
    setPosition(x: number, y: number): this {
        this.position = { x, y };
        return this;
    }
    destroy(): void {
        this.destroyed = true;
    }
}

function setup(withContainer: boolean, drawsBody = false) {
    const images: FakeImage[] = [];
    const scene = {
        add: {
            image: vi.fn((x: number, y: number, texture: string) => {
                const image = new FakeImage(x, y, texture);
                images.push(image);
                return image;
            }),
        },
    };
    const added: FakeImage[] = [];
    const container = { add: vi.fn((image: FakeImage) => added.push(image)) };
    const placement = {
        scene,
        x: 120,
        y: 80,
        depth: 5,
        reducedMotion: () => false,
        drawsBody,
        container: withContainer ? container : undefined,
    } as unknown as LampPlacement;
    return { scene, images, added, container, placement };
}

const KINDS: LampKind[] = ["spot", "disco", "neon", "strobe"];
const FRAME: LampFrame = { bass: 0.6, mid: 0.5, treble: 0.4, beat: true };

describe("createLamp", () => {
    for (const kind of KINDS) {
        describe(kind, () => {
            it("draws its images through the scene, where the lamp stands", () => {
                const { scene, images, placement } = setup(false);
                createLamp(kind, placement);
                expect(scene.add.image).toHaveBeenCalled();
                expect(images.length).toBeGreaterThan(0);
                for (const image of images) {
                    expect(image.position).toEqual({ x: 120, y: 80 });
                }
            });

            it("puts every image it draws in the container of its zone, so that the zone clips them", () => {
                const { images, added, container, placement } = setup(true);
                createLamp(kind, placement);
                expect(container.add).toHaveBeenCalledTimes(images.length);
                expect(added).toEqual(images);
            });

            it("draws straight on the scene, with no container, when nothing clips it", () => {
                const { container, placement } = setup(false);
                createLamp(kind, placement);
                expect(container.add).not.toHaveBeenCalled();
            });

            it("follows the music, moves, goes off and out without failing", () => {
                const { images, placement } = setup(true);
                const lamp = createLamp(kind, placement);
                lamp.setBrightness(0.5);
                lamp.update(FRAME, 1000);
                lamp.update({ ...FRAME, beat: false }, 1016);
                lamp.moveTo(300, 200);
                lamp.setVisible(false);
                lamp.setVisible(true);
                lamp.destroy();
                expect(images.every((image) => image.destroyed)).toBe(true);
            });
        });
    }

    it("draws the body of a demo lamp and leaves it to the object for a lamp of the map", () => {
        const demo = setup(false, true);
        const mapLamp = setup(false, false);
        const demoLamp = createLamp("strobe", demo.placement);
        const objectLamp = createLamp("strobe", mapLamp.placement);
        demoLamp.setVisible(true);
        objectLamp.setVisible(true);
        const visibleImages = (images: FakeImage[]) => images.filter((image) => image.visible).length;
        expect(visibleImages(demo.images)).toBeGreaterThan(visibleImages(mapLamp.images));
    });
});
