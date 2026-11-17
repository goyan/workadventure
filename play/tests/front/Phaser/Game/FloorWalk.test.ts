import { describe, expect, it } from "vitest";
import { FloorModel } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import { floorStep, restoredFloorState } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorWalk";
import type { FloorWalkState, StairSide } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorWalk";
import type { StairShape } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

const stair = (direction: StairShape["direction"], width: 1 | 2 = 1): StairShape => ({
    direction,
    width,
    rise: 52,
    open: false,
});

/** A floor at `elevation` over the tiles x0..x1, y0..y1. */
function slabs(model: FloorModel, elevation: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) model.setSlab(elevation, x, y, "parquet-clair");
}

type Pt = { x: number; y: number };
/** Where to walk to: a coordinate left out is not steered (the keys of the other axis are not pressed). */
type Target = { x?: number; y?: number };
const GROUND: FloorWalkState = { elevation: 0 };

/** Walks the feet of an avatar towards each point in turn, 2 px at a time, as the keys would. */
function walk(
    model: FloorModel,
    from: Pt,
    to: Target[],
    state: FloorWalkState = GROUND,
    closed?: (index: number, side: StairSide) => boolean,
): { state: FloorWalkState; p: Pt } {
    let p = from;
    let current = state;
    for (const target of to) {
        for (let i = 0; i < 400; i++) {
            const dx = target.x === undefined ? 0 : Math.max(-2, Math.min(2, target.x - p.x));
            const dy = target.y === undefined ? 0 : Math.max(-2, Math.min(2, target.y - p.y));
            if (dx === 0 && dy === 0) break;
            const result = floorStep(model, current, p, { x: p.x + dx, y: p.y + dy }, closed);
            if (result.p.x === p.x && result.p.y === p.y && result.state === current) break;
            p = result.p;
            current = result.state;
        }
    }
    return { state: current, p };
}

/** A floor at 52 px over the tiles 4..7 x 2..4, and a stair going north that arrives on its south edge. */
function northModel(): FloorModel {
    const model = new FloorModel();
    slabs(model, 52, 4, 2, 7, 4);
    // Run of 2 tiles: on the ground from y = 160 (top) to y = 224 (foot), x from 160 to 192.
    model.addStair(stair("n"), { x: 5, y: 6 }, 0);
    return model;
}

describe("restoredFloorState", () => {
    it("puts the avatar back on the floor it stood on before a reload, when a slab is still under it", () => {
        const model = new FloorModel();
        model.setSlab(52, 3, 5, "parquet-clair");
        // On the screen the avatar is 52 px north of the tile (3, 5) it stands over.
        expect(restoredFloorState(model, { x: 3 * 32 + 10, y: 5 * 32 + 10 - 52 }, 52)).toEqual({ elevation: 52 });
        // No slab under it any more, or another floor: the ground.
        expect(restoredFloorState(model, { x: 6 * 32 + 10, y: 5 * 32 + 10 - 52 }, 52)).toBeUndefined();
        expect(restoredFloorState(model, { x: 3 * 32 + 10, y: 5 * 32 + 10 - 84 }, 84)).toBeUndefined();
        expect(restoredFloorState(model, { x: 3 * 32 + 10, y: 5 * 32 + 10 }, 0)).toBeUndefined();
    });
});

describe("floorStep", () => {
    it("takes the avatar up a stair going north, onto the floor", () => {
        const model = northModel();
        const half = walk(model, { x: 176, y: 230 }, [{ x: 176, y: 166 }]);
        expect(half.state.stair).toBe(0);
        expect(half.state.elevation).toBeCloseTo(26, 0);
        const top = walk(model, { x: 176, y: 230 }, [{ x: 176, y: 90 }]);
        expect(top.state).toEqual({ elevation: 52 });
        expect(top.p).toEqual({ x: 176, y: 90 });
    });

    it("takes it down again", () => {
        const model = northModel();
        const down = walk(model, { x: 176, y: 90 }, [{ x: 176, y: 236 }], { elevation: 52 });
        expect(down.state).toEqual({ elevation: 0 });
        expect(down.p).toEqual({ x: 176, y: 236 });
    });

    it("lets it step down from the very edge of the width of the stair", () => {
        const model = northModel();
        // The stair spans x 160..192: an avatar walking along x = 160 is still over it.
        const down = walk(model, { x: 160, y: 90 }, [{ y: 236 }], { elevation: 52 });
        expect(down.state).toEqual({ elevation: 0 });
    });

    it("keeps an avatar on a floor over its slabs: the edge is a railing", () => {
        const model = northModel();
        // On the screen the floor spans x 128..256 and y 12..108.
        const west = walk(model, { x: 176, y: 90 }, [{ x: 90, y: 90 }], { elevation: 52 });
        expect(west.state).toEqual({ elevation: 52 });
        // Half its body (7 px) stays over the slabs: it does not hang over the edge.
        expect(west.p.x).toBeGreaterThanOrEqual(135);
        expect(west.p.x).toBeLessThan(141);
        // South of the floor, beside the stair: no way down.
        const south = walk(model, { x: 220, y: 90 }, [{ x: 220, y: 140 }], { elevation: 52 });
        expect(south.state).toEqual({ elevation: 52 });
        expect(south.p.y).toBeLessThanOrEqual(108);
    });

    it("lets an avatar of the ground walk under the floor, but not through the side of a stair", () => {
        const model = northModel();
        const under = walk(model, { x: 100, y: 60 }, [{ x: 240, y: 60 }]);
        expect(under).toEqual({ state: { elevation: 0 }, p: { x: 240, y: 60 } });
        // The stair shows from y = 108 to y = 224; at y = 130 it is too high to step on.
        const side = walk(model, { x: 140, y: 130 }, [{ x: 180, y: 130 }]);
        expect(side.state).toEqual({ elevation: 0 });
        expect(side.p.x).toBeLessThanOrEqual(160);
    });

    it("lets it step on and off the first steps of a stair by its side", () => {
        const model = northModel();
        const on = walk(model, { x: 140, y: 214 }, [{ x: 176, y: 214 }]);
        expect(on.state.stair).toBe(0);
        const off = walk(model, { x: 140, y: 214 }, [
            { x: 176, y: 214 },
            { x: 210, y: 214 },
        ]);
        expect(off.state).toEqual({ elevation: 0 });
        expect(off.p.x).toBe(210);
    });

    it("takes the avatar up and down a stair going south, shorter on the screen than on the ground", () => {
        const model = new FloorModel();
        slabs(model, 52, 4, 6, 7, 8);
        // Run of 3 tiles: on the ground from y = 96 (foot) to y = 192 (top); on the screen from 96 to 140.
        model.addStair(stair("s"), { x: 5, y: 3 }, 0);
        const up = walk(model, { x: 176, y: 90 }, [{ x: 176, y: 150 }]);
        expect(up.state).toEqual({ elevation: 52 });
        expect(up.p).toEqual({ x: 176, y: 150 });
        const down = walk(model, { x: 176, y: 150 }, [{ x: 176, y: 90 }], { elevation: 52 });
        expect(down).toEqual({ state: { elevation: 0 }, p: { x: 176, y: 90 } });
    });

    it("takes the avatar up a stair going east: walking east also takes it up the screen", () => {
        const model = new FloorModel();
        slabs(model, 52, 4, 2, 7, 4);
        // On the ground: x from 64 (foot) to 128 (top), the row 3 (y 96..128).
        model.addStair(stair("e"), { x: 2, y: 3 }, 0);
        const up = walk(model, { x: 56, y: 112 }, [{ x: 140 }]);
        expect(up.state).toEqual({ elevation: 52 });
        expect(up.p).toEqual({ x: 140, y: 60 });
        const down = walk(model, { x: 140, y: 60 }, [{ x: 56 }], { elevation: 52 });
        expect(down).toEqual({ state: { elevation: 0 }, p: { x: 56, y: 112 } });
    });

    it("takes the avatar up a stair going west", () => {
        const model = new FloorModel();
        slabs(model, 52, 4, 2, 7, 4);
        // On the ground: x from 320 (foot) down to 256 (top), the row 3.
        model.addStair(stair("o"), { x: 9, y: 3 }, 0);
        const up = walk(model, { x: 330, y: 112 }, [{ x: 240 }]);
        expect(up.state).toEqual({ elevation: 52 });
        expect(up.p).toEqual({ x: 240, y: 60 });
    });

    it("does not let the avatar off the top of a stair that leads to no slab", () => {
        const model = new FloorModel();
        model.addStair(stair("n"), { x: 5, y: 6 }, 0);
        const top = walk(model, { x: 176, y: 230 }, [{ x: 176, y: 60 }]);
        expect(top.state.stair).toBe(0);
        expect(top.state.elevation).toBeLessThan(52);
        expect(top.p.y).toBeGreaterThan(108);
    });

    it("goes from a floor up to the next one", () => {
        const model = new FloorModel();
        slabs(model, 52, 4, 5, 7, 8);
        slabs(model, 104, 4, 2, 7, 4);
        // Standing on the floor at 52: on the ground from y = 160 to y = 224, drawn 52 px higher.
        model.addStair(stair("n"), { x: 5, y: 6 }, 52);
        const start = { x: 176, y: 250 - 52 };
        const up = walk(model, start, [{ x: 176, y: 140 - 104 }], { elevation: 52 });
        expect(up.state).toEqual({ elevation: 104 });
        const down = walk(model, { x: 176, y: 140 - 104 }, [start], { elevation: 104 });
        expect(down).toEqual({ state: { elevation: 52 }, p: start });
    });

    it("keeps the avatar off a wall standing at the foot or along a side of a stair", () => {
        const model = new FloorModel();
        slabs(model, 52, 4, 2, 7, 4);
        model.addStair(stair("e"), { x: 2, y: 3 }, 0);
        const footClosed = (_index: number, side: StairSide) => side === "foot";
        const down = walk(model, { x: 140, y: 60 }, [{ x: 40 }], { elevation: 52 }, footClosed);
        // Stopped before the wall, still on the first steps; it steps off by the side.
        expect(down.state.stair).toBe(0);
        expect(down.p.x).toBe(64 + 18);
        const off = walk(model, down.p, [{ y: down.p.y + 40 }], down.state, footClosed);
        expect(off.state).toEqual({ elevation: 0 });
    });

    it("drops to the ground an avatar whose slab was removed under it", () => {
        const model = northModel();
        model.removeSlab(52, 5, 2);
        // It stood over the tile (5, 2), which no longer has a slab: it is not kept there by the railing.
        const result = floorStep(model, { elevation: 52 }, { x: 176, y: 30 }, { x: 178, y: 30 });
        expect(result).toEqual({ state: { elevation: 0 }, p: { x: 178, y: 30 } });
    });

    describe("a stair with an open side", () => {
        const openStair = (open: boolean): FloorModel => {
            const model = new FloorModel();
            slabs(model, 52, 4, 2, 7, 4);
            // On the ground: x from 64 (foot) to 128 (top), the row 3 (y 96..128). It is 40 px high from x = 113.
            model.addStair({ ...stair("e"), open }, { x: 2, y: 3 }, 0);
            return model;
        };

        it("lets an avatar of the ground walk under its high end", () => {
            const under = walk(openStair(true), { x: 120, y: 90 }, [{ y: 140 }]);
            expect(under).toEqual({ state: { elevation: 0 }, p: { x: 120, y: 140 } });
        });

        it("still stops it where there is no headroom", () => {
            const blocked = walk(openStair(true), { x: 100, y: 90 }, [{ y: 140 }]);
            expect(blocked.state).toEqual({ elevation: 0 });
            expect(blocked.p.y).toBeLessThanOrEqual(96);
        });

        it("still takes it up by its first steps, and down to the ground", () => {
            const up = walk(openStair(true), { x: 56, y: 112 }, [{ x: 140 }]);
            expect(up.state).toEqual({ elevation: 52 });
            const down = walk(openStair(true), { x: 140, y: 60 }, [{ x: 56 }], { elevation: 52 });
            expect(down).toEqual({ state: { elevation: 0 }, p: { x: 56, y: 112 } });
        });

        it("does not take up the stair an avatar that walks under it towards its foot", () => {
            // Under the high end, then west along the row: stopped where the headroom ends, still on the ground.
            const along = walk(openStair(true), { x: 120, y: 90 }, [{ y: 112 }, { x: 70 }]);
            expect(along.state).toEqual({ elevation: 0 });
            expect(along.p.x).toBeGreaterThanOrEqual(113);
        });

        it("is a wall all along when its side is full", () => {
            const blocked = walk(openStair(false), { x: 120, y: 90 }, [{ y: 140 }]);
            expect(blocked.p.y).toBeLessThanOrEqual(96);
        });
    });

    it("reads an avatar that jumped (a teleport) as standing on the ground", () => {
        const model = northModel();
        const result = floorStep(model, { elevation: 52 }, { x: 176, y: 90 }, { x: 600, y: 400 });
        expect(result).toEqual({ state: { elevation: 0 }, p: { x: 600, y: 400 } });
    });
});
