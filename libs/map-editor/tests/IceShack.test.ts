import { describe, expect, it } from "vitest";
import { ICE_BEARS_MM, ICE_SHACK_MM } from "../src/Terrain/Ice";
import {
    ICE_SHACK_CRACK_MS,
    ICE_SHACK_MAX_PER_ROOM,
    ICE_SHACK_MIN_SPACING_PX,
    ICE_SHACK_OWNER_AWAY_MS,
    ICE_SHACK_READY_MS,
    iceShackAbandoned,
    iceShackAt,
    iceShackFootprintTiles,
    iceShackIce,
    iceShackPlacement,
    iceShackReady,
    iceShackSeat,
    iceShackSite,
    stepIceShackIce,
} from "../src/Life/IceShack";
import type { IceShack, IceShackGround } from "../src/Life/IceShack";

/** A lake everywhere, 40 px deep, under `iceMm` of ice; `pool` cells are a pool. */
function lake(iceMm: number, more: Partial<IceShackGround> = {}): IceShackGround {
    return { iceMmAt: () => iceMm, depthPxAt: () => 40, inPool: () => false, ...more };
}

const shack = (id: number, x: number, y: number, ownerKey = `owner-${id}`, more: Partial<IceShack> = {}): IceShack => ({
    id,
    x,
    y,
    ownerKey,
    ownerName: ownerKey,
    builtAt: 0,
    ownerSeenAt: 0,
    ...more,
});

describe("where a shack goes up", () => {
    it("drills its hole beside the avatar, who sits on the stool in front of it", () => {
        const hole = iceShackAt({ x: 300, y: 200 });
        const seat = iceShackSeat(hole);
        expect(seat).toEqual({ x: 300, y: 200 });
        expect(hole.x).toBeGreaterThan(seat.x);
        expect(Math.abs(hole.y - seat.y)).toBeLessThan(8);
    });

    it("stands on solid ice over deep water", () => {
        expect(iceShackSite(iceShackAt({ x: 300, y: 200 }), lake(ICE_SHACK_MM))).toBe("ok");
    });

    it("asks for the ice of the guidelines for a light shelter on foot (4 inches), more than a walker", () => {
        expect(ICE_SHACK_MM).toBe(102);
        expect(ICE_SHACK_MM).toBeGreaterThan(ICE_BEARS_MM);
        expect(iceShackSite(iceShackAt({ x: 300, y: 200 }), lake(ICE_SHACK_MM - 1))).toBe("thinIce");
        // Ice that bears a walker is still too thin for a shack.
        expect(iceShackSite(iceShackAt({ x: 300, y: 200 }), lake(ICE_BEARS_MM))).toBe("thinIce");
    });

    it("is refused where there is no ice at all", () => {
        expect(iceShackSite(iceShackAt({ x: 300, y: 200 }), lake(0))).toBe("noIce");
    });

    it("needs the ice under the whole shack, not only under its hole", () => {
        const hole = iceShackAt({ x: 300, y: 200 });
        const tiles = iceShackFootprintTiles(hole);
        expect(tiles.length).toBeGreaterThan(1);
        const shore = tiles[0];
        const ground = lake(200, {
            iceMmAt: (tileX, tileY) => (tileX === shore.tileX && tileY === shore.tileY ? 30 : 200),
        });
        expect(iceShackIce(hole, ground)).toBe(30);
        expect(iceShackSite(hole, ground)).toBe("thinIce");
    });

    it("is refused over a frozen puddle: no deep water under its hole", () => {
        expect(iceShackSite(iceShackAt({ x: 300, y: 200 }), lake(200, { depthPxAt: () => 10 }))).toBe("shallow");
    });

    it("is refused on a frozen pool: no fish in it", () => {
        expect(iceShackSite(iceShackAt({ x: 300, y: 200 }), lake(200, { inPool: () => true }))).toBe("pool");
    });

    it("reads the ice by tile of 32 px and the water by cell of 16 px", () => {
        const hole = { x: 330, y: 205 };
        const tilesRead: string[] = [];
        const cellsRead: string[] = [];
        iceShackSite(hole, {
            iceMmAt: (tileX, tileY) => {
                tilesRead.push(`${tileX},${tileY}`);
                return 200;
            },
            depthPxAt: (cellX, cellY) => {
                cellsRead.push(`${cellX},${cellY}`);
                return 40;
            },
            inPool: () => false,
        });
        expect(tilesRead).toContain("10,6");
        expect(cellsRead).toContain("20,12");
    });
});

describe("the shacks of a room", () => {
    it("one a player", () => {
        expect(iceShackPlacement([shack(1, 0, 0, "ana")], { x: 900, y: 900 }, "ana", [])).toBe("onePerPlayer");
        expect(iceShackPlacement([shack(1, 0, 0, "ana")], { x: 900, y: 900 }, "bob", [])).toBeUndefined();
    });

    it("so many a room", () => {
        const shacks = Array.from({ length: ICE_SHACK_MAX_PER_ROOM }, (_, index) => shack(index + 1, index * 500, 0));
        expect(iceShackPlacement(shacks, { x: 0, y: 5000 }, "new", [])).toBe("roomFull");
    });

    it("not too close to another", () => {
        const others = [shack(1, 100, 100)];
        expect(iceShackPlacement(others, { x: 100 + ICE_SHACK_MIN_SPACING_PX - 1, y: 100 }, "new", [])).toBe(
            "tooClose",
        );
        expect(iceShackPlacement(others, { x: 100 + ICE_SHACK_MIN_SPACING_PX, y: 100 }, "new", [])).toBeUndefined();
    });

    it("not on an object of the map", () => {
        expect(iceShackPlacement([], { x: 100, y: 100 }, "new", [{ x: 90, y: 90 }])).toBe("object");
        expect(iceShackPlacement([], { x: 100, y: 100 }, "new", [{ x: 300, y: 300 }])).toBeUndefined();
    });
});

describe("a shack on the ice", () => {
    it("is used once its hole is drilled and it is up", () => {
        expect(iceShackReady(shack(1, 0, 0, "a", { builtAt: 1000 }), 1000 + ICE_SHACK_READY_MS - 1)).toBe(false);
        expect(iceShackReady(shack(1, 0, 0, "a", { builtAt: 1000 }), 1000 + ICE_SHACK_READY_MS)).toBe(true);
    });

    it("stands while its ice is thick enough", () => {
        const standing = shack(1, 0, 0);
        expect(stepIceShackIce(standing, ICE_SHACK_MM, 5000)).toBe("standing");
        expect(standing.crackingSince).toBeUndefined();
    });

    it("cracks when the ice thaws under it, and goes when it went on cracking", () => {
        const thawing = shack(1, 0, 0);
        expect(stepIceShackIce(thawing, ICE_SHACK_MM - 10, 1000)).toBe("cracking");
        expect(thawing.crackingSince).toBe(1000);
        expect(stepIceShackIce(thawing, ICE_SHACK_MM - 10, 1000 + ICE_SHACK_CRACK_MS - 1)).toBe("cracking");
        expect(stepIceShackIce(thawing, ICE_SHACK_MM - 10, 1000 + ICE_SHACK_CRACK_MS)).toBe("collapse");
    });

    it("stops cracking when the ice thickens again", () => {
        const thawing = shack(1, 0, 0);
        stepIceShackIce(thawing, ICE_SHACK_MM - 10, 1000);
        expect(stepIceShackIce(thawing, ICE_SHACK_MM + 5, 2000)).toBe("standing");
        expect(thawing.crackingSince).toBeUndefined();
    });

    it("goes at once when its ice melted away", () => {
        expect(stepIceShackIce(shack(1, 0, 0), 0, 1000)).toBe("collapse");
    });

    it("is taken down when who put it up stayed away a day", () => {
        expect(iceShackAbandoned(shack(1, 0, 0, "a", { ownerSeenAt: 0 }), ICE_SHACK_OWNER_AWAY_MS - 1)).toBe(false);
        expect(iceShackAbandoned(shack(1, 0, 0, "a", { ownerSeenAt: 0 }), ICE_SHACK_OWNER_AWAY_MS)).toBe(true);
        expect(ICE_SHACK_OWNER_AWAY_MS).toBe(24 * 3600 * 1000);
    });
});
