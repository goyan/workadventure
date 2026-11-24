import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import { ContourView, contourPictureScale } from "@wa/front/Phaser/Game/Terrain/ContourView";

/** What the view makes of a game object of Phaser: whether it is shown, and whether it was let go. */
function shown() {
    const object = {
        visible: true,
        destroyed: false,
        setVisible: vi.fn((visible: boolean) => {
            object.visible = visible;
            return object;
        }),
        setDepth: () => object,
        setOrigin: () => object,
        setScale: () => object,
        destroy: vi.fn(() => {
            object.destroyed = true;
        }),
    };
    return object;
}

function sceneOf(zoom: number) {
    const camera = { zoom, worldView: { x: 0, y: 0, right: 1280, bottom: 720 } };
    const graphics = () =>
        Object.assign(shown(), {
            clear: vi.fn(),
            lineStyle: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            strokePath: vi.fn(),
        });
    const made: ReturnType<typeof graphics>[] = [];
    const pictures: (ReturnType<typeof shown> & { render: ReturnType<typeof vi.fn> })[] = [];
    const scene = {
        cameras: { main: camera },
        markDirty: vi.fn(),
        add: {
            graphics: () => {
                const object = graphics();
                made.push(object);
                return object;
            },
            renderTexture: () => {
                const picture = Object.assign(shown(), { clear: vi.fn(), draw: vi.fn(), render: vi.fn() });
                pictures.push(picture);
                return picture;
            },
        },
        make: { graphics: () => graphics() },
    };
    return { scene, camera, made, pictures };
}

// A hollow of 40 px in the first region of the map: stronger lines all around it.
const hollow = withHeights(undefined, new Map([[cellKey(3, 3), -40]]));

describe("contourPictureScale", () => {
    it("draws the lines as such from half the zoom on, as pictures under it at a power of two at least the zoom", () => {
        expect(contourPictureScale(1)).toBeUndefined();
        expect(contourPictureScale(0.5)).toBeUndefined();
        expect(contourPictureScale(0.3)).toBe(0.25);
        expect(contourPictureScale(0.25)).toBe(0.25);
        expect(contourPictureScale(0.12)).toBe(0.125);
        expect(contourPictureScale(0.05)).toBe(0.0625);
        expect(contourPictureScale(0)).toBeUndefined();
    });
});

describe("ContourView", () => {
    it("draws lines close up, and a picture of them painted once when zoomed out, again only when they change", () => {
        const { scene, camera, made, pictures } = sceneOf(1);
        const view = new ContourView(scene as never, 10);
        view.setWanted(true, hollow);
        const [minor, major] = made;
        expect(major.visible).toBe(true);
        expect(minor.visible).toBe(true);
        expect(pictures).toHaveLength(0);

        camera.zoom = 0.12;
        Object.assign(camera.worldView, { right: 10000, bottom: 6000 });
        view.update(hollow);
        expect(major.visible).toBe(false);
        expect(minor.visible).toBe(false);
        // One picture for the stronger lines, one for the fine ones (few lines in view: both shown).
        expect(pictures).toHaveLength(2);
        expect(pictures.every((picture) => picture.visible)).toBe(true);
        view.update(hollow);
        view.update(hollow);
        expect(pictures.map((picture) => picture.render.mock.calls.length)).toEqual([1, 1]);

        // A stroke in that region: painted again, once.
        const deeper = withHeights(hollow, new Map([[cellKey(4, 3), -80]]));
        view.update(deeper);
        view.update(deeper);
        expect(pictures.map((picture) => picture.render.mock.calls.length)).toEqual([2, 2]);

        // Close up again: the pictures are let go, the lines shown.
        camera.zoom = 1;
        view.update(deeper);
        expect(pictures.every((picture) => picture.destroyed)).toBe(true);
        expect(major.visible).toBe(true);
    });

    it("shows nothing of a region out of view, nor when the panel hides the lines", () => {
        const { scene, camera, made, pictures } = sceneOf(0.12);
        Object.assign(camera.worldView, { x: 5000, y: 5000, right: 9000, bottom: 8000 });
        const view = new ContourView(scene as never, 10);
        view.setWanted(true, hollow);
        expect(made.every((graphics) => !graphics.visible)).toBe(true);
        expect(pictures).toHaveLength(0);
        Object.assign(camera.worldView, { x: 0, y: 0 });
        view.update(hollow);
        expect(pictures.some((picture) => picture.visible)).toBe(true);
        view.setWanted(false, hollow);
        expect(pictures.every((picture) => !picture.visible)).toBe(true);
    });
});
