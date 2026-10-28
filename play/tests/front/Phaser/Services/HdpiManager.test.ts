import { describe, expect, it } from "vitest";
import { HdpiManager } from "../../../../src/front/Phaser/Services/HdpiManager";

describe("Test HdpiManager", () => {
    it("should match screen size if size is too small.", () => {
        const hdpiManager = new HdpiManager(640 * 480, 64 * 64);

        const result = hdpiManager.getOptimalGameSize({ width: 320, height: 200 });
        expect(result.game.width).toEqual(320);
        expect(result.game.height).toEqual(200);
        expect(result.real.width).toEqual(320);
        expect(result.real.height).toEqual(200);
    });

    it("should match multiple just above.", () => {
        const hdpiManager = new HdpiManager(640 * 480, 64 * 64);

        // The default zoom goes by steps of 0.25: 960x600 is 1.37 times the recommended size, so the zoom is 1.25.
        let result = hdpiManager.getOptimalGameSize({ width: 960, height: 600 });
        expect(result.game.width).toEqual(Math.ceil(960 / 1.25));
        expect(result.game.height).toEqual(600 / 1.25);

        result = hdpiManager.getOptimalGameSize({ width: 640 * 2 + 50, height: 480 * 2 + 50 });
        expect(result.game.width).toEqual(Math.ceil((640 * 2 + 50) / 2));
        expect(result.game.height).toEqual((480 * 2 + 50) / 2);

        result = hdpiManager.getOptimalGameSize({ width: 640 * 3 + 50, height: 480 * 3 + 50 });
        expect(result.game.width).toEqual(Math.ceil((640 * 3 + 50) / 3));
        expect(result.game.height).toEqual(Math.ceil((480 * 3 + 50) / 3));
        expect(result.real.width).toEqual(result.game.width * 3);
        expect(result.real.height).toEqual(result.game.height * 3);
    });

    it("should not zoom in too much.", () => {
        const hdpiManager = new HdpiManager(640 * 480, 64 * 64);

        hdpiManager.zoomModifier = 11;

        const result = hdpiManager.getOptimalGameSize({ width: 640, height: 640 });
        expect(result.game.width).toEqual(64);
        expect(result.game.height).toEqual(64);
        expect(hdpiManager.zoomModifier).toEqual(10);
    });

    it("should not zoom out too much.", () => {
        const hdpiManager = new HdpiManager(640 * 480, 64 * 64);

        hdpiManager.zoomModifier = 1 / 10;

        const screen = { width: 1280, height: 768 };
        const result = hdpiManager.getOptimalGameSize({ width: 1280, height: 768 });
        expect(result.game.width).toBeGreaterThanOrEqual(screen.width);
        expect(result.game.width).toBeLessThanOrEqual(screen.width * 1.1);
        expect(result.game.height).toBeGreaterThanOrEqual(screen.height);
        expect(result.game.height).toBeLessThanOrEqual(screen.height * 1.1);
        // 1280x768 gives an optimal zoom of 1.75: the zoom modifier is clamped so that the canvas is not zoomed out further.
        expect(hdpiManager.zoomModifier).toEqual(1 / 1.75);
    });

    it("should compute the default zoom by steps of 0.25.", () => {
        const hdpiManager = new HdpiManager(640 * 480, 64 * 64);

        expect(hdpiManager.getOptimalZoomLevel(1366 * 768)).toEqual(1.75);
        expect(hdpiManager.getOptimalZoomLevel(1920 * 1080)).toEqual(2.5);
        expect(hdpiManager.getOptimalZoomLevel(2560 * 1440)).toEqual(3.25);
        // Exact multiples of the recommended size are unchanged.
        expect(hdpiManager.getOptimalZoomLevel(640 * 2 * 480 * 2)).toEqual(2);
        expect(hdpiManager.getOptimalZoomLevel(640 * 4 * 480 * 4)).toEqual(4);
        // Never below 1.
        expect(hdpiManager.getOptimalZoomLevel(640 * 480)).toEqual(1);
    });
});
