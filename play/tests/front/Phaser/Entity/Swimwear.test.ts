import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import {
    drawSwimwearFrame,
    resolveSwimwear,
    Swimwear,
    tintBodyPixels,
} from "../../../../src/front/Phaser/Entity/Swimwear";

afterEach(() => vi.restoreAllMocks());

describe("swimwear anatomy", () => {
    it.each([Swimwear.Shorts, Swimwear.TwoPiece])(
        "uses native walking silhouettes and preserves the original head for %s",
        (style) => {
            const source = document.createElement("canvas");
            const nativeContext = mock<CanvasRenderingContext2D>();
            nativeContext.getImageData.mockImplementation(() => ({
                data: new Uint8ClampedArray(32 * 32 * 4),
                width: 32,
                height: 32,
                colorSpace: "srgb",
            }));
            vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(nativeContext);
            const assets = {
                body: mock<HTMLImageElement>(),
                shorts: mock<HTMLImageElement>(),
                briefs: mock<HTMLImageElement>(),
            };
            for (let frame = 0; frame < 12; frame++) {
                const context = mock<CanvasRenderingContext2D>();
                drawSwimwearFrame(context, source, assets, style, frame, "rgb(253,240,197)");
                expect(nativeContext.drawImage.mock.calls.at(-2)).toEqual([
                    assets.body,
                    (frame % 3) * 32,
                    Math.floor(frame / 3) * 32,
                    32,
                    32,
                    0,
                    0,
                    32,
                    32,
                ]);
                expect(nativeContext.drawImage.mock.calls.at(-1)).toEqual([
                    style === Swimwear.TwoPiece ? assets.briefs : assets.shorts,
                    (frame % 3) * 32,
                    Math.floor(frame / 3) * 32,
                    32,
                    32,
                    0,
                    0,
                    32,
                    32,
                ]);
                expect(context.drawImage.mock.calls.at(-1)).toEqual([source, 0, 0, 32, 20, 0, 0, 32, 20]);
            }
        },
    );

    it("recolors skin while preserving native shading, transparency and source pixels", () => {
        const pixels = new Uint8ClampedArray([255, 225, 175, 255, 83, 71, 33, 128, 0, 0, 0, 0]);
        expect([...tintBodyPixels(pixels, [170, 110, 70])]).toEqual([170, 110, 70, 255, 55, 35, 13, 128, 0, 0, 0, 0]);
        expect([...pixels]).toEqual([255, 225, 175, 255, 83, 71, 33, 128, 0, 0, 0, 0]);
    });

    it("honors an explicit choice for a custom avatar without gender metadata", () => {
        expect(resolveSwimwear(Swimwear.TwoPiece, ["body1", "hair2"])).toBe(Swimwear.TwoPiece);
        expect(resolveSwimwear(Swimwear.Auto, ["female2"])).toBe(Swimwear.TwoPiece);
    });
});
