import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { drawSwimwearFrame, resolveSwimwear, Swimwear } from "../../../../src/front/Phaser/Entity/Swimwear";

describe("swimwear anatomy", () => {
    it.each(Object.values(Swimwear))("keeps faces and ponytails above the outfit for %s in all 12 frames", (style) => {
        const source = mock<HTMLCanvasElement>();
        source.getContext.mockReturnValue(mock<CanvasRenderingContext2D>());
        for (let frame = 0; frame < 12; frame++) {
            const context = mock<CanvasRenderingContext2D>();
            drawSwimwearFrame(context, source, style, frame, "rgb(253,240,197)");
            expect(context.drawImage.mock.calls[0]).toEqual([source, 0, 0, 32, 20, 0, 0, 32, 20]);
            expect(context.fillRect.mock.calls.every(([, y]) => y >= 20)).toBe(true);
            expect(context.fillRect.mock.calls.every(([, y, , height]) => y + height <= 32)).toBe(true);
        }
    });

    it("honors an explicit choice for a custom avatar without gender metadata", () => {
        expect(resolveSwimwear(Swimwear.TwoPiece, ["body1", "hair2"])).toBe(Swimwear.TwoPiece);
        expect(resolveSwimwear(Swimwear.Auto, ["female2"])).toBe(Swimwear.TwoPiece);
    });
});
