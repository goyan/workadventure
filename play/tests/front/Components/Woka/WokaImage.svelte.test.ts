import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import WokaImage from "@wa/front/Components/Woka/WokaImage.svelte";
import type { WokaData } from "@wa/front/Components/Woka/WokaTypes";

const emptyLayer = () => ({ collections: [] });
const wokaData: WokaData = {
    body: emptyLayer(),
    eyes: emptyLayer(),
    hair: emptyLayer(),
    clothes: emptyLayer(),
    hat: emptyLayer(),
    accessory: emptyLayer(),
    woka: {
        collections: [
            { name: "default", position: 0, textures: [{ id: "male1", name: "male1", url: "male1.png", position: 0 }] },
        ],
    },
};

describe("WokaImage", () => {
    const NativeImage = window.Image;
    let frames: FrameRequestCallback[];
    let drawImage: ReturnType<typeof vi.fn>;
    let createdImages: HTMLImageElement[];
    let component: ReturnType<typeof mount> | undefined;

    const runFrames = () => {
        const pending = frames;
        frames = [];
        for (const frame of pending) frame(0);
    };

    beforeEach(() => {
        frames = [];
        createdImages = [];
        drawImage = vi.fn();
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            frames.push(callback);
            return frames.length;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            clearRect: vi.fn(),
            drawImage,
            imageSmoothingEnabled: false,
        } as unknown as CanvasRenderingContext2D);
        // jsdom never loads images: each one is reported as loaded, and its load event is fired by the test.
        class LoadedImage extends NativeImage {
            constructor() {
                super();
                Object.defineProperty(this, "complete", { value: true });
                Object.defineProperty(this, "naturalWidth", { value: 96 });
                createdImages.push(this);
            }
        }
        window.Image = LoadedImage;
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        document.body.replaceChildren();
        window.Image = NativeImage;
        vi.restoreAllMocks();
    });

    const mountImage = (props: { direction: number }) => {
        const state = $state(props);
        component = mount(WokaImage, {
            target: document.body,
            props: {
                selectedTextures: { woka: "male1" },
                wokaData,
                get direction() {
                    return state.direction;
                },
            },
        });
        flushSync();
        return state;
    };

    it("stops requesting frames once the thumbnail is drawn", () => {
        mountImage({ direction: 0 });

        runFrames();
        runFrames();

        expect(drawImage).toHaveBeenCalled();
        expect(frames).toHaveLength(0);
    });

    it("redraws when an image finishes loading", () => {
        mountImage({ direction: 0 });
        runFrames();
        drawImage.mockClear();

        createdImages[createdImages.length - 1].dispatchEvent(new Event("load"));
        runFrames();

        expect(drawImage).toHaveBeenCalledTimes(1);
    });

    it("redraws when the direction changes", () => {
        const state = mountImage({ direction: 0 });
        runFrames();
        drawImage.mockClear();

        state.direction = 2;
        flushSync();
        runFrames();

        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 64, 32, 32, 0, 0, 64, 64);
    });
});
