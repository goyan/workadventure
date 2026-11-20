import { describe, expect, it } from "vitest";
import { mapSnowCoverage } from "@wa/front/Phaser/Game/Weather/SnowCover";

describe("snow lying on the map", () => {
    it("is none for now: no weather lays a scripted cover, the snow that holds is yet to be worked out", () => {
        expect(mapSnowCoverage()).toBe(0);
    });
});
