import { describe, expect, it } from "vitest";
import { findNerfPrison, isInZone, zoneCenter } from "../../../../../src/front/Phaser/Game/Nerf/NerfPrison";

const zone = { x: 3488, y: 32, width: 640, height: 352 };

describe("NerfPrison", () => {
    it.each(["Prison des régressions", "prison des RÉGRESSIONS", "  Prison  des régressions "])(
        "finds the area named %j",
        (name) => {
            expect(
                findNerfPrison([
                    { name: "Salle", x: 0, y: 0, width: 32, height: 32 },
                    { name, ...zone },
                ]),
            ).toEqual(zone);
        },
    );

    it("ignores other names and unnamed areas", () => {
        expect(findNerfPrison([{ name: "Prison", ...zone }, { ...zone }])).toBeUndefined();
        expect(findNerfPrison([])).toBeUndefined();
    });

    it("tells whether a point is strictly inside", () => {
        expect(isInZone(zone, { x: 3500, y: 100 })).toBe(true);
        expect(isInZone(zone, { x: 3488, y: 100 })).toBe(false);
        expect(isInZone(zone, { x: 3000, y: 100 })).toBe(false);
        expect(isInZone(undefined, { x: 3500, y: 100 })).toBe(false);
    });

    it("gives the middle of the zone", () => {
        expect(zoneCenter(zone)).toEqual({ x: 3808, y: 208 });
    });
});
