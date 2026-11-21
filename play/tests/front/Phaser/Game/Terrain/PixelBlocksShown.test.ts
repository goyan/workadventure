import { afterEach, describe, expect, it } from "vitest";
import { classicPoolsShown } from "../../../../../src/front/Phaser/Game/Terrain/ImagePools";
import {
    pixelBlocksShownNow,
    tellPixelBlocksShown,
} from "../../../../../src/front/Phaser/Game/Terrain/PixelBlocksShown";

afterEach(() => tellPixelBlocksShown(undefined));

describe("what is far from the scene asks whether the relief is shown in 3/4", () => {
    it("is not, until a scene tells it, and no more once the scene is gone", () => {
        expect(pixelBlocksShownNow()).toBe(false);
        const shown = { value: true };
        tellPixelBlocksShown(() => shown.value);
        expect(pixelBlocksShownNow()).toBe(true);
        shown.value = false;
        expect(pixelBlocksShownNow()).toBe(false);
        shown.value = true;
        tellPixelBlocksShown(undefined);
        expect(pixelBlocksShownNow()).toBe(false);
    });

    it("keeps the image of the pools placed as images while the relief is shown in 3/4: no shader draws them there", () => {
        expect(classicPoolsShown()).toBe(false);
        tellPixelBlocksShown(() => true);
        expect(classicPoolsShown()).toBe(true);
    });
});
