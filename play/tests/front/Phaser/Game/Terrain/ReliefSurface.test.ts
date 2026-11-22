import { describe, expect, it, vi } from "vitest";
import * as Phaser from "phaser";
import { createReliefSurface } from "../../../../../src/front/Phaser/Game/Terrain/ReliefSurface";

/** `size` × `size` pixels (RGBA) of one value. */
const pixelsOf = (size: number, value: number) => new Uint8ClampedArray(size * size * 4).fill(value);

function fakeImage() {
    const image = {
        setOrigin: () => image,
        setDisplaySize: vi.fn(() => image),
        setDepth: vi.fn(() => image),
        setVisible: () => image,
        destroy: vi.fn(),
    };
    return image;
}

/** A scene drawn with WebGL: what is sent to the graphics card is copied when it is sent. */
function webglScene() {
    const sent: { key: string; data: unknown; bytes: Uint8Array; how: "created" | "updated"; args: unknown[] }[] = [];
    const textures = new Map<string, { destroy: ReturnType<typeof vi.fn> }>();
    const images: ReturnType<typeof fakeImage>[] = [];
    const scene = {
        sys: { game: { renderer: { type: Phaser.WEBGL } } },
        textures: {
            createCanvas: vi.fn(),
            addUint8Array: vi.fn((key: string, data: Uint8Array, width: number, height: number) => {
                sent.push({ key, data, bytes: Uint8Array.from(data), how: "created", args: [width, height] });
                const texture = {
                    key,
                    setFilter: vi.fn(),
                    destroy: vi.fn(),
                    source: [
                        {
                            glTexture: {
                                flipY: true,
                                wrapS: 11,
                                wrapT: 12,
                                minFilter: 13,
                                magFilter: 14,
                                format: 15,
                                update: (pixels: Uint8Array, ...args: unknown[]) =>
                                    sent.push({
                                        key,
                                        data: pixels,
                                        bytes: Uint8Array.from(pixels),
                                        how: "updated",
                                        args,
                                    }),
                            },
                        },
                    ],
                };
                textures.set(key, texture);
                return texture;
            }),
        },
        add: {
            image: vi.fn(() => {
                const image = fakeImage();
                images.push(image);
                return image;
            }),
        },
    };
    return { scene, sent, textures, images };
}

const allOf = (bytes: Uint8Array, value: number) => bytes.every((byte) => byte === value);

describe("the surface a block of the terrain is shown on", () => {
    it("sends its pixels straight to the graphics card, with no drawing surface of its own", () => {
        const { scene, sent, images } = webglScene();
        const surface = createReliefSurface(
            scene as never,
            "relief-block:1,1@4",
            256,
            512,
            64,
            256,
            0.655,
            pixelsOf(64, 5),
        );
        expect(surface).toBeDefined();
        expect(scene.textures.createCanvas).not.toHaveBeenCalled();
        expect(sent).toHaveLength(1);
        expect(sent[0].how).toBe("created");
        expect(sent[0].args).toEqual([64, 64]);
        expect(sent[0].bytes.length).toBe(64 * 64 * 4);
        expect(allOf(sent[0].bytes, 5)).toBe(true);
        expect(scene.add.image).toHaveBeenCalledWith(256, 512, "relief-block:1,1@4");
        expect(images[0].setDisplaySize).toHaveBeenCalledWith(256, 256);
        expect(images[0].setDepth).toHaveBeenCalledWith(0.655);
    });

    it("shows each of two blocks of the same size its own pixels, through one shared buffer", () => {
        const { scene, sent } = webglScene();
        createReliefSurface(scene as never, "a", 0, 0, 64, 256, 0.655, pixelsOf(64, 1));
        createReliefSurface(scene as never, "b", 256, 0, 64, 256, 0.655, pixelsOf(64, 2));
        expect(allOf(sent[0].bytes, 1)).toBe(true);
        expect(allOf(sent[1].bytes, 2)).toBe(true);
        // The same array for both: the graphics library keeps a reference to it, none a block.
        expect(sent[1].data).toBe(sent[0].data);
        // Another size, another buffer.
        createReliefSurface(scene as never, "c", 512, 0, 128, 256, 0.655, pixelsOf(128, 3));
        expect(sent[2].data).not.toBe(sent[0].data);
        expect(sent[2].bytes.length).toBe(128 * 128 * 4);
    });

    it("updates its texture in place when it is shown again, as the texture was set up", () => {
        const { scene, sent } = webglScene();
        const surface = createReliefSurface(scene as never, "a", 0, 0, 64, 256, 0.655, pixelsOf(64, 1));
        const other = createReliefSurface(scene as never, "b", 256, 0, 64, 256, 0.655, pixelsOf(64, 2));
        surface?.show(pixelsOf(64, 7));
        other?.show(pixelsOf(64, 8));
        expect(sent.map((each) => `${each.key}:${each.how}`)).toEqual([
            "a:created",
            "b:created",
            "a:updated",
            "b:updated",
        ]);
        expect(allOf(sent[2].bytes, 7)).toBe(true);
        expect(allOf(sent[3].bytes, 8)).toBe(true);
        expect(sent[2].args).toEqual([64, 64, true, 11, 12, 13, 14, 15]);
        expect(scene.textures.addUint8Array).toHaveBeenCalledTimes(2);
    });

    it("lets go of its texture and of its image", () => {
        const { scene, textures, images } = webglScene();
        const surface = createReliefSurface(scene as never, "a", 0, 0, 64, 256, 0.655, pixelsOf(64, 1));
        surface?.destroy();
        expect(textures.get("a")?.destroy).toHaveBeenCalled();
        expect(images[0].destroy).toHaveBeenCalled();
    });

    it("is none when the texture cannot be made", () => {
        const { scene } = webglScene();
        scene.textures.addUint8Array.mockReturnValueOnce(null as never);
        expect(createReliefSurface(scene as never, "a", 0, 0, 64, 256, 0.655, pixelsOf(64, 1))).toBeUndefined();
        expect(scene.add.image).not.toHaveBeenCalled();
    });

    it("draws on a canvas where the game is not drawn with WebGL", () => {
        const put: Uint8ClampedArray[] = [];
        const texture = {
            key: "a",
            source: [{ scaleMode: 0 }],
            setFilter: vi.fn(),
            refresh: vi.fn(),
            destroy: vi.fn(),
            getContext: () => ({
                createImageData: (width: number, height: number) => ({
                    data: new Uint8ClampedArray(width * height * 4),
                }),
                putImageData: (image: { data: Uint8ClampedArray }) => put.push(image.data.slice()),
            }),
        };
        const scene = {
            textures: { createCanvas: vi.fn(() => texture), addUint8Array: vi.fn() },
            add: { image: vi.fn(() => fakeImage()) },
        };
        const surface = createReliefSurface(scene as never, "a", 0, 0, 64, 256, 0.655, pixelsOf(64, 4));
        expect(scene.textures.createCanvas).toHaveBeenCalledWith("a", 64, 64);
        expect(scene.textures.addUint8Array).not.toHaveBeenCalled();
        expect(put).toHaveLength(1);
        expect(put[0].every((byte) => byte === 4)).toBe(true);
        surface?.show(pixelsOf(64, 6));
        expect(put[1].every((byte) => byte === 6)).toBe(true);
        expect(texture.refresh).toHaveBeenCalledTimes(2);
    });
});
