import { describe, expect, it } from "vitest";
import { refreshCanvasTexture } from "../../../../src/front/Phaser/Game/CanvasTextureRefresh";

const LINEAR = 0;
const NEAREST = 1;

/**
 * A canvas texture as Phaser 4.2 handles it: setFilter keeps the mode asked for and sets it on the GPU; refresh uploads
 * the canvas again with the filter of the game (nearest, the game runs without antialiasing).
 */
function texture(asked: number) {
    const source = { scaleMode: asked, gpuFilter: asked };
    return {
        source: [source],
        setFilter(mode: number) {
            source.scaleMode = mode;
            source.gpuFilter = mode;
            return this;
        },
        refresh() {
            source.gpuFilter = NEAREST;
            return this;
        },
    };
}

describe("a canvas texture drawn again", () => {
    it("keeps the smoothing it asked for", () => {
        const smooth = texture(LINEAR);
        refreshCanvasTexture(smooth);
        expect(smooth.source[0].gpuFilter).toBe(LINEAR);
    });

    it("keeps sharp pixels when it asked for them", () => {
        const sharp = texture(NEAREST);
        refreshCanvasTexture(sharp);
        expect(sharp.source[0].gpuFilter).toBe(NEAREST);
    });
});
