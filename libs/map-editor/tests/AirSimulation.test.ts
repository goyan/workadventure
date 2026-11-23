import { describe, expect, it } from "vitest";
import { HURRICANE_RMAX_M, hurricaneHere, hurricaneMaxWind } from "../src/Catastrophe/Hurricane";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import { AIR_DRAG, AirSimulation } from "../src/Weather/AirSimulation";

/** The map of Antoine: 240 x 160 tiles of 32 px; map pixels in a metre. */
const MAP = { width: 7680, height: 5120 };
const PX_PER_M = 32 / Math.sqrt(1.2);
const EPOCH = 500_000_000;

/** A hurricane standing over (x, y) of the map for as long as the test lasts. */
function standing(category: number, southern = false, x = 3840, y = 2560): Hurricane {
    return {
        id: 1,
        startedAt: 0,
        durationMs: 1_000_000_000,
        category,
        heading: 0,
        southern,
        fromX: x,
        fromY: y,
        toX: x,
        toY: y,
        anchorX: x,
        anchorY: y,
    };
}

/** The air of the map under a standing hurricane, from the formula of the wind, after `seconds` of its own physics. */
function spun(hurricane: Hurricane, drag: number | "sea", seconds = 120): AirSimulation {
    const air = new AirSimulation({ ...MAP, drag: () => drag });
    air.fill((x, y) => {
        const here = hurricaneHere(hurricane, EPOCH, x, y);
        if (!here) return { east: 0, north: 0 };
        const to = ((here.windFrom + 180) * Math.PI) / 180;
        return { east: (here.windSpeed / 3.6) * Math.sin(to), north: (here.windSpeed / 3.6) * Math.cos(to) };
    });
    for (let step = 0; step < seconds * 10; step++) air.step({ hurricane, epoch: EPOCH, room: { east: 0, north: 0 } });
    return air;
}

/** The mean wind round a circle of `radii` radii of the strongest winds about the eye: round it (anticlockwise
 * positive) and outward (km/h), and the inflow angle (degrees, positive inward). */
function ring(air: AirSimulation, radii: number, x = 3840, y = 2560): { round: number; out: number; inflow: number } {
    let round = 0;
    let out = 0;
    const count = 72;
    for (let at = 0; at < count; at++) {
        const angle = (at / count) * 2 * Math.PI;
        const r = radii * HURRICANE_RMAX_M * PX_PER_M;
        const wind = air.windAt(x + r * Math.cos(angle), y - r * Math.sin(angle));
        out += wind.east * Math.cos(angle) + wind.north * Math.sin(angle);
        round += -wind.east * Math.sin(angle) + wind.north * Math.cos(angle);
    }
    round = (round / count) * 3.6;
    out = (out / count) * 3.6;
    return { round, out, inflow: (Math.atan2(-out, Math.abs(round)) * 180) / Math.PI };
}

/** The strongest mean wind round the eye and its radius (radii of the strongest winds of the formula). */
function strongest(air: AirSimulation): { kmh: number; radii: number } {
    let best = { kmh: 0, radii: 0 };
    for (let radii = 0.3; radii <= 3; radii += 0.05) {
        const { round, out } = ring(air, radii);
        const kmh = Math.hypot(round, out);
        if (kmh > best.kmh) best = { kmh, radii };
    }
    return best;
}

describe("the air of a map under a hurricane (AirSimulation)", () => {
    it("keeps the strongest wind of its category and its radius, from category 1 to 5, over the sea", () => {
        for (const category of [1, 4, 5]) {
            const best = strongest(spun(standing(category), "sea"));
            // The loss of the advection (bilinear) and the slab, measured: within 10 % of the formula.
            expect(Math.abs(best.kmh / hurricaneMaxWind(category) - 1), `category ${category}`).toBeLessThan(0.1);
            expect(best.radii).toBeGreaterThan(0.7);
            expect(best.radii).toBeLessThan(1.4);
        }
    }, 60_000);

    it("turns anticlockwise in the north, clockwise in the south, and keeps its eye calm", () => {
        const north = spun(standing(4), "sea");
        const south = spun(standing(4, true), "sea");
        expect(ring(north, 1).round).toBeGreaterThan(150);
        expect(ring(south, 1).round).toBeLessThan(-150);
        for (const air of [north, south]) {
            const eye = ring(air, 0.2);
            expect(Math.hypot(eye.round, eye.out)).toBeLessThan(0.15 * hurricaneMaxWind(4));
        }
    }, 60_000);

    it("turns in towards the eye across the isobars, by the drag: more over land, more again over a forest", () => {
        const inflow = (drag: number | "sea"): number => {
            const air = spun(standing(4), drag);
            return (ring(air, 1).inflow + ring(air, 1.5).inflow + ring(air, 2).inflow) / 3;
        };
        const sea = inflow("sea");
        const forest = inflow(AIR_DRAG.forest);
        // Over the sea, a few to some twenty degrees (about 20° measured on real hurricanes, Zhang and Uhlhorn 2012).
        expect(sea).toBeGreaterThan(3);
        expect(sea).toBeLessThan(30);
        expect(forest).toBeGreaterThan(sea + 10);
    }, 60_000);

    it("blows harder on the right of a low that moves, in the north", () => {
        // Going north at 3 m/s over the sea for half a minute, from the south of the map (in the middle of its passage).
        const travel = -3 * PX_PER_M * 1e6;
        const hurricane: Hurricane = {
            ...standing(4),
            fromY: 4200 - 0.5 * travel,
            toY: 4200 + 0.5 * travel,
        };
        const air = new AirSimulation({ ...MAP });
        air.fill((x, y) => {
            const here = hurricaneHere(hurricane, EPOCH, x, y);
            if (!here) return { east: 0, north: 0 };
            const to = ((here.windFrom + 180) * Math.PI) / 180;
            return { east: (here.windSpeed / 3.6) * Math.sin(to), north: (here.windSpeed / 3.6) * Math.cos(to) };
        });
        for (let step = 0; step < 300; step++) {
            air.step({ hurricane, epoch: EPOCH + step * 100, room: { east: 0, north: 0 } });
        }
        const eyeY = 4200 - 3 * PX_PER_M * 30;
        const r = 1.2 * HURRICANE_RMAX_M * PX_PER_M;
        const east = air.windAt(3840 + r, eyeY);
        const west = air.windAt(3840 - r, eyeY);
        expect(Math.hypot(east.east, east.north)).toBeGreaterThan(Math.hypot(west.east, west.north));
    }, 60_000);
});

describe("the air of a map without a hurricane", () => {
    it("keeps a uniform wind of the room uniform for ten minutes, with no rotation of its own", () => {
        const air = new AirSimulation({ ...MAP });
        air.fill(() => ({ east: 10, north: 0 }));
        for (let step = 0; step < 6000; step++) air.step({ epoch: step * 100, room: { east: 10, north: 0 } });
        let most = 0;
        for (let at = 0; at < air.east.length; at++) {
            most = Math.max(most, Math.abs(air.east[at] - 10), Math.abs(air.north[at]));
        }
        expect(most).toBeLessThan(1e-3);
    }, 60_000);

    it("slows a wind over a forest and turns it towards the low, and nowhere else", () => {
        // A forest over a square in the middle of the map, the sea around.
        const patch = (x: number, y: number): number | "sea" =>
            Math.abs(x - 3840) < 1200 && Math.abs(y - 2560) < 1200 ? AIR_DRAG.forest : "sea";
        const air = new AirSimulation({ ...MAP, drag: patch });
        air.fill(() => ({ east: 10, north: 0 }));
        for (let step = 0; step < 1200; step++) air.step({ epoch: step * 100, room: { east: 10, north: 0 } });
        const inside = air.windAt(3840, 2560);
        const outside = air.windAt(600, 300);
        expect(Math.hypot(inside.east, inside.north)).toBeLessThan(Math.hypot(outside.east, outside.north) - 0.5);
        // The low of a west wind in the north lies to its north: the wind slowed turns that way.
        expect(inside.north).toBeGreaterThan(0);
        expect(Math.abs(outside.east - 10)).toBeLessThan(0.05);
        expect(Math.abs(outside.north)).toBeLessThan(0.05);
        // A forest all over: the wind settles slower, turned towards the low by the angle of its drag to the
        // Coriolis force (tan a = k / f, about 20° here).
        const wood = new AirSimulation({ ...MAP, drag: () => AIR_DRAG.forest });
        wood.fill(() => ({ east: 10, north: 0 }));
        for (let step = 0; step < 3000; step++) wood.step({ epoch: step * 100, room: { east: 10, north: 0 } });
        const settled = wood.windAt(3840, 2560);
        const turned = (Math.atan2(settled.north, settled.east) * 180) / Math.PI;
        expect(Math.hypot(settled.east, settled.north)).toBeLessThan(9.5);
        expect(turned).toBeGreaterThan(5);
        expect(turned).toBeLessThan(45);
    }, 60_000);
});
