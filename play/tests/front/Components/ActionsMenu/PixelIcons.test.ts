import { describe, expect, it } from "vitest";
import { PIXEL_ICONS, PIXEL_ICON_COLORS } from "../../../../src/front/Components/ActionsMenu/PixelIcons";

describe("PixelIcons", () => {
    it("draws every icon on 16 × 16 pixels, with known colors only", () => {
        for (const [name, rows] of Object.entries(PIXEL_ICONS)) {
            expect(rows, name).toHaveLength(16);
            for (const row of rows) {
                expect(row, name).toHaveLength(16);
                for (const pixel of row)
                    if (pixel !== ".") expect(PIXEL_ICON_COLORS, `${name}: ${pixel}`).toHaveProperty(pixel);
            }
        }
    });

    it("has an icon for each action of the wheel and each family of sound effects", () => {
        expect(Object.keys(PIXEL_ICONS).sort()).toEqual(
            [
                "bell",
                "coffee",
                "dance",
                "door",
                "footsteps",
                "nerf",
                "onePiece",
                "outfit",
                "shorts",
                "skateboard",
                "swimwear",
                "torch",
                "twoPiece",
                "weather",
            ].sort(),
        );
    });
});
