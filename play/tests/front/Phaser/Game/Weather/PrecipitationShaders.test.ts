import { describe, expect, it } from "vitest";
import {
    RAIN_PERSPECTIVE_VERT,
    RAIN_VERT,
    SNOW_PERSPECTIVE_VERT,
    SNOW_VERT,
} from "../../../../../src/front/Phaser/Game/Weather/PrecipitationShaders";

// Seen from above a near drop is far from where it lands: it showed over a roof (the rain in a room at a strong zoom,
// measured: 5.9 % of a room covered at a scale of 8) when only its landing place was read in the outdoor mask.
describe("the outdoor mask of the shaders", () => {
    it("is read where a drop or a flake seen from above is seen, not only where it lands", () => {
        expect(RAIN_PERSPECTIVE_VERT).toContain("outdoor(land)");
        expect(RAIN_PERSPECTIVE_VERT).toContain("outdoor(head.xy)");
        expect(RAIN_PERSPECTIVE_VERT).toContain("outdoor(tail.xy)");
        expect(SNOW_PERSPECTIVE_VERT).toContain("outdoor(land)");
        expect(SNOW_PERSPECTIVE_VERT).toContain("outdoor(seen.xy)");
    });

    it("is read where the flat rain and snow are drawn", () => {
        expect(RAIN_VERT).toContain("outdoor(head)");
        expect(SNOW_VERT).toContain("outdoor(place / fine)");
    });
});
