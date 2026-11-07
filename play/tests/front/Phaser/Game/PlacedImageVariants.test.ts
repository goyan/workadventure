import { describe, expect, it } from "vitest";
import {
    isResizedVariant,
    resizedVariantName,
    resizedVariantTag,
    resizedVariantTags,
    getResizedFrom,
} from "../../../../src/front/Phaser/Game/MapEditor/PlacedImageVariants";

describe("Resized image variants", () => {
    it("tags a resized image with its original and its size", () => {
        expect(resizedVariantTag("orig", { width: 206, height: 206 })).toBe("resized-from:orig:206x206");
    });

    it("keeps the tags of the original, category first, and replaces an older resize tag", () => {
        expect(
            resizedVariantTags(["Divers", "resized-from:orig:50x50", "fun"], "orig", { width: 280, height: 280 }),
        ).toEqual(["Divers", "fun", "resized-from:orig:280x280"]);
    });

    it("reads the original of a resized image, and nothing for an original", () => {
        expect(getResizedFrom({ tags: ["Divers", "resized-from:orig:280x280"] })).toBe("orig");
        expect(getResizedFrom({ tags: ["Divers"] })).toBeUndefined();
        expect(isResizedVariant({ tags: ["resized-from:orig:280x280"] })).toBe(true);
        expect(isResizedVariant({ tags: ["Divers"] })).toBe(false);
    });

    it("names a resized image after its original, with one size only", () => {
        expect(resizedVariantName("Le roi.png", { width: 206, height: 206 })).toBe("Le roi.png (206×206)");
    });
});
