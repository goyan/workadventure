import * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import { RgbLampVisual } from "../../../../../src/front/Phaser/Game/Lamps/RgbLampVisual";

class FakeImage {
    public destroyed = false;
    public visible = true;
    public position = { x: 0, y: 0 };
    public size = { width: 0, height: 0 };
    public tint = 0;
    public texture = "";
    public blendMode = 0;
    public depth = 0;
    setOrigin(): this {
        return this;
    }
    setBlendMode(mode: number): this {
        this.blendMode = mode;
        return this;
    }
    setAlpha(): this {
        return this;
    }
    setDepth(depth: number): this {
        this.depth = depth;
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
    setDisplaySize(width: number, height: number): this {
        this.size = { width, height };
        return this;
    }
    setTint(tint: number): this {
        this.tint = tint;
        return this;
    }
    setTexture(key: string): this {
        this.texture = key;
        return this;
    }
    destroy(): void {
        this.destroyed = true;
    }
}

/** A canvas texture that records what is drawn into it. */
class FakeTexture {
    public destroyed = false;
    public refreshed = 0;
    public cleared = 0;
    public paths: { x: number; y: number }[][] = [];
    public stops: { offset: number; colour: string }[] = [];
    constructor(
        public readonly key: string,
        public readonly width: number,
    ) {}
    getContext() {
        const path: { x: number; y: number }[] = [];
        return {
            clearRect: () => {
                this.cleared += 1;
            },
            createRadialGradient: () => ({
                addColorStop: (offset: number, colour: string) => this.stops.push({ offset, colour }),
            }),
            beginPath: () => undefined,
            moveTo: (x: number, y: number) => path.push({ x, y }),
            lineTo: (x: number, y: number) => path.push({ x, y }),
            closePath: () => undefined,
            fill: () => this.paths.push(path),
            fillStyle: undefined as unknown,
        };
    }
    refresh(): void {
        this.refreshed += 1;
    }
    setFilter(): void {}
    destroy(): void {
        this.destroyed = true;
    }
}

function setup() {
    const image = new FakeImage();
    const textures: FakeTexture[] = [];
    const scene = {
        add: { image: vi.fn(() => image) },
        textures: {
            createCanvas: vi.fn((key: string, width: number) => {
                const texture = new FakeTexture(key, width);
                textures.push(texture);
                return texture;
            }),
        },
    };
    const visual = new RgbLampVisual(scene as unknown as ConstructorParameters<typeof RgbLampVisual>[0], "lamp-1", 7);
    return { image, textures, visual };
}

const square = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 300 },
    { x: 100, y: 300 },
];
const light = { x: 200, y: 200, radius: 192, direction: 90, angle: 360 };

describe("RgbLampVisual", () => {
    it("adds its light to the scene at the depth it is given, hidden until it is lit", () => {
        const { image } = setup();
        expect(image.blendMode).toBe(Phaser.BlendModes.ADD);
        expect(image.depth).toBe(7);
        expect(image.visible).toBe(false);
    });

    it("covers the square of the reach around the lamp, in the colour of the lamp", () => {
        const { image, visual } = setup();
        visual.draw(light, square, 0x00ff80);
        expect(image.position).toEqual({ x: 8, y: 8 });
        expect(image.size).toEqual({ width: 384, height: 384 });
        expect(image.tint).toBe(0x00ff80);
        expect(image.texture).toBe(visual.textureKey);
    });

    it("draws the lit polygon into a texture of its own, one texel for four pixels of the map", () => {
        const { textures, visual } = setup();
        visual.draw(light, square, 0xffffff);
        expect(textures).toHaveLength(1);
        expect(textures[0].width).toBe(96);
        expect(textures[0].key).toBe(visual.textureKey);
        // The polygon, from the corner of the square of the reach (8, 8), at a quarter of its size.
        expect(textures[0].paths).toEqual([
            [
                { x: 23, y: 23 },
                { x: 73, y: 23 },
                { x: 73, y: 73 },
                { x: 23, y: 73 },
            ],
        ]);
        expect(textures[0].refreshed).toBe(1);
    });

    it("fades from full at the lamp to nothing at the end of the reach", () => {
        const { textures, visual } = setup();
        visual.draw(light, square, 0xffffff);
        const { stops } = textures[0];
        expect(stops[0]).toEqual({ offset: 0, colour: "rgba(255, 255, 255, 1)" });
        expect(stops.at(-1)).toEqual({ offset: 1, colour: "rgba(255, 255, 255, 0)" });
    });

    it("draws again into the same texture while the reach does not change: a lamp that moves or turns", () => {
        const { textures, visual } = setup();
        visual.draw(light, square, 0xffffff);
        const key = visual.textureKey;
        visual.draw({ ...light, x: 232, direction: 0, angle: 90 }, square, 0xffffff);
        expect(textures).toHaveLength(1);
        expect(visual.textureKey).toBe(key);
        expect(textures[0].cleared).toBe(2);
        expect(textures[0].refreshed).toBe(2);
    });

    it("takes a new texture when the reach changes, and lets go of the old one", () => {
        const { image, textures, visual } = setup();
        visual.draw(light, square, 0xffffff);
        const key = visual.textureKey;
        visual.draw({ ...light, radius: 320 }, square, 0xffffff);
        expect(textures).toHaveLength(2);
        expect(textures[1].width).toBe(160);
        expect(visual.textureKey).not.toBe(key);
        expect(image.texture).toBe(visual.textureKey);
        expect(textures[0].destroyed).toBe(true);
        expect(textures[1].destroyed).toBe(false);
    });

    it("clears the light of a lamp that reaches nothing", () => {
        const { textures, visual } = setup();
        visual.draw(light, [], 0xffffff);
        expect(textures[0].cleared).toBe(1);
        expect(textures[0].paths).toEqual([]);
    });

    it("is shown and hidden with its lamp, and takes its texture away when it goes", () => {
        const { image, textures, visual } = setup();
        visual.draw(light, square, 0xffffff);
        visual.setVisible(true);
        expect(image.visible).toBe(true);
        visual.destroy();
        expect(image.destroyed).toBe(true);
        expect(textures[0].destroyed).toBe(true);
    });
});
