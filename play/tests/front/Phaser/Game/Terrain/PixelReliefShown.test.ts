import { afterEach, describe, expect, it } from "vitest";
import { classicPoolsShown } from "../../../../../src/front/Phaser/Game/Terrain/ImagePools";
import {
    pixelReliefShownNow,
    tellPixelReliefShown,
} from "../../../../../src/front/Phaser/Game/Terrain/PixelReliefShown";

afterEach(() => tellPixelReliefShown(undefined));

describe("what is far from the scene asks whether the relief is shown in 3/4", () => {
    it("is not, until a scene tells it, and no more once the scene is gone", () => {
        expect(pixelReliefShownNow()).toBe(false);
        const shown = { value: true };
        tellPixelReliefShown(() => shown.value);
        expect(pixelReliefShownNow()).toBe(true);
        shown.value = false;
        expect(pixelReliefShownNow()).toBe(false);
        shown.value = true;
        tellPixelReliefShown(undefined);
        expect(pixelReliefShownNow()).toBe(false);
    });

    it("keeps the image of the pools placed as images while the relief is shown in 3/4: no shader draws them there", () => {
        expect(classicPoolsShown()).toBe(false);
        tellPixelReliefShown(() => true);
        expect(classicPoolsShown()).toBe(true);
    });
});
