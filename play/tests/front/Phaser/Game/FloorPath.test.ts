import { describe, expect, it } from "vitest";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import { floorPath } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorPath";

/**
 * A floor at 52 px over the tiles x 2..4, y 4..6, reached by a stair going north whose foot is the tile (3, 8): it
 * covers the tiles (3, 7) and (3, 8), starts from the tile (3, 9) of the ground and arrives on the tile (3, 6).
 */
function layout(withStair = true): FloorModel {
    const model = new FloorModel();
    for (let x = 2; x <= 4; x++) for (let y = 4; y <= 6; y++) model.setSlab(52, x, y, "parquet-clair");
    if (withStair) model.addStair({ direction: "n", width: 1, rise: 52, open: false }, { x: 3, y: 8 }, 0);
    return model;
}
const everywhere = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 12 && y < 12;
const middle = (x: number, y: number, level = 0) => ({ x: x * 32 + 16, y: y * 32 + 16 - level });

describe("floorPath", () => {
    it("goes up the stair to a tile of the floor, through the foot and the head of the stair", () => {
        const to = middle(2, 4, 52);
        const path = floorPath({
            model: layout(),
            groundWalkable: everywhere,
            from: { ...middle(3, 10), elevation: 0 },
            to,
        });
        expect(path).toBeDefined();
        expect(path?.[0]).toEqual(middle(3, 10));
        expect(path?.at(-1)).toEqual(to);
        // The foot of the stair on the ground, then its head on the floor, 52 px further north on the screen.
        const foot = path?.findIndex((p) => p.x === 112 && p.y === 9 * 32) ?? -1;
        const head = path?.findIndex((p) => p.x === 112 && p.y === 7 * 32 - 52) ?? -1;
        expect(foot).toBeGreaterThan(0);
        expect(head).toBe(foot + 1);
    });

    it("comes back down by the same stair", () => {
        const path = floorPath({
            model: layout(),
            groundWalkable: everywhere,
            from: { ...middle(2, 4, 52), elevation: 52 },
            to: middle(3, 10),
        });
        const head = path?.findIndex((p) => p.x === 112 && p.y === 7 * 32 - 52) ?? -1;
        const foot = path?.findIndex((p) => p.x === 112 && p.y === 9 * 32) ?? -1;
        expect(head).toBeGreaterThan(0);
        expect(foot).toBe(head + 1);
        expect(path?.at(-1)).toEqual(middle(3, 10));
    });

    it("walks to the floor it is told, not to a higher one drawn at the same point", () => {
        // A second floor at 84 px drawn over the same point of the screen as the tile (2, 4) of the floor at 52 px,
        // hidden above the avatar in game: a click there aims at the floor at 52 px, which the avatar sees.
        const model = layout();
        const to = middle(2, 4, 52);
        const upper = Math.floor((to.y + 84) / 32);
        model.setSlab(84, 2, upper, "parquet-clair");
        const from = { ...middle(3, 10), elevation: 0 };
        // The highest floor drawn there: no stair leads to it.
        expect(floorPath({ model, groundWalkable: everywhere, from, to })).toBeUndefined();
        const path = floorPath({ model, groundWalkable: everywhere, from, to: { ...to, level: 52 } });
        expect(path?.at(-1)).toEqual(to);
        expect(path?.some((p) => p.y === 7 * 32 - 52)).toBe(true);
    });

    it("finds nothing to a floor no stair leads to", () => {
        expect(
            floorPath({
                model: layout(false),
                groundWalkable: everywhere,
                from: { ...middle(3, 10), elevation: 0 },
                to: middle(2, 4, 52),
            }),
        ).toBeUndefined();
    });

    it("walks around the stair on the ground, under the floor", () => {
        // The tile (3, 6) of the ground, under the floor: the point is drawn where no slab is (the slabs are 52 px
        // further north).
        const path = floorPath({
            model: layout(),
            groundWalkable: everywhere,
            from: { ...middle(3, 10), elevation: 0 },
            to: middle(3, 6),
        });
        expect(path?.at(-1)).toEqual(middle(3, 6));
        expect(path?.some((p) => p.x === 112 && (p.y === 7 * 32 + 16 || p.y === 8 * 32 + 16))).toBe(false);
    });

    it("goes around a wall of the floor, and finds nothing when the wall closes the way", () => {
        // A wall on the floor between the columns 3 and 4, on the rows 5 and 6: the row 4 stays open.
        const wall = (level: number, from: { x: number; y: number }, to: { x: number; y: number }): boolean =>
            level === 52 &&
            from.y === to.y &&
            from.y >= 5 &&
            Math.min(from.x, to.x) === 3 &&
            Math.max(from.x, to.x) === 4;
        const input = {
            model: layout(),
            groundWalkable: everywhere,
            from: { ...middle(3, 10), elevation: 0 },
            to: middle(4, 6, 52),
        };
        const around = floorPath({ ...input, blocked: wall });
        expect(around?.at(-1)).toEqual(middle(4, 6, 52));
        expect(around).toContainEqual(middle(3, 4, 52));
        const closed = floorPath({
            ...input,
            blocked: (level, from, to) => level === 52 && Math.min(from.x, to.x) === 3 && Math.max(from.x, to.x) === 4,
        });
        expect(closed).toBeUndefined();
    });

    it("finds nothing from a stair, nor to a tile one cannot stand on", () => {
        const model = layout();
        expect(
            floorPath({
                model,
                groundWalkable: everywhere,
                from: { ...middle(3, 8), elevation: 20 },
                to: middle(3, 10),
            }),
        ).toBeUndefined();
        expect(
            floorPath({
                model,
                groundWalkable: () => false,
                from: { ...middle(3, 10), elevation: 0 },
                to: middle(5, 10),
            }),
        ).toBeUndefined();
    });
});
