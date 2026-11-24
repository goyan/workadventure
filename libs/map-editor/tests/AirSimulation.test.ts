import { describe, expect, it } from "vitest";
import { HURRICANE_RMAX_M, hurricaneHere, hurricaneMaxWind } from "../src/Catastrophe/Hurricane";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import {
    AIR_CORIOLIS,
    AIR_LAYER_M,
    AIR_ROUGHNESS_M,
    AIR_STEP_S,
    AIR_SURFACE_RATIO,
    AirSimulation,
    landFriction,
    seaDrag,
} from "../src/Weather/AirSimulation";

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
    const air = new AirSimulation({ ...MAP, roughness: () => drag });
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
        // At 10 m, where the category is defined.
        const kmh = Math.hypot(round, out) * AIR_SURFACE_RATIO;
        if (kmh > best.kmh) best = { kmh, radii };
    }
    return best;
}

describe("the air of a map under a hurricane (AirSimulation)", () => {
    it("keeps the strongest wind of its category at 10 m in categories 4 and 5, and its radius, over the sea", () => {
        for (const category of [4, 5]) {
            const best = strongest(spun(standing(category), "sea"));
            // The wind of the layer times 0.80 (Franklin et al. 2003): measured 195 km/h for 214 in category 4 (−9 %),
            // 235 for 250 in category 5 (−6 %).
            expect(Math.abs(best.kmh / hurricaneMaxWind(category) - 1), `category ${category}`).toBeLessThan(0.1);
            expect(best.radii).toBeGreaterThan(0.7);
            expect(best.radii).toBeLessThan(1.4);
        }
        // In category 1 the layer is barely over its gradient wind: 104 km/h at 10 m for 126 (−17 %), outside the
        // 10 % (Franklin et al. also found the share reaching the surface lowest for 40 to 60 m/s at the top of the
        // layer: one ratio does not fit every wind).
        const weak = strongest(spun(standing(1), "sea"));
        expect(Math.abs(weak.kmh / hurricaneMaxWind(1) - 1)).toBeLessThan(0.2);
    }, 60_000);

    it("turns anticlockwise in the north, clockwise in the south", () => {
        expect(ring(spun(standing(4), "sea"), 1).round).toBeGreaterThan(150);
        expect(ring(spun(standing(4, true), "sea"), 1).round).toBeLessThan(-150);
    }, 60_000);

    it("keeps its eye calm over the sea, the land and a forest, from category 1 to 5", () => {
        for (const drag of ["sea", AIR_ROUGHNESS_M.land, AIR_ROUGHNESS_M.forest] as const) {
            for (const category of [1, 4, 5]) {
                const eye = ring(spun(standing(category), drag), 0.2);
                expect(Math.hypot(eye.round, eye.out), `${drag} ${category}`).toBeLessThan(
                    0.15 * hurricaneMaxWind(category),
                );
            }
        }
    }, 120_000);

    it("turns in towards the eye across the isobars, by the drag: about 20° over the sea, more over land and a forest", () => {
        const inflow = (drag: number | "sea", category = 4): number => {
            const air = spun(standing(category), drag);
            return (ring(air, 1).inflow + ring(air, 1.5).inflow + ring(air, 2).inflow) / 3;
        };
        for (const category of [4, 5]) {
            // About 20° measured on real hurricanes (−22.6° ± 2.2°, Zhang and Uhlhorn 2012).
            expect(inflow("sea", category), `category ${category}`).toBeGreaterThan(15);
            expect(inflow("sea", category), `category ${category}`).toBeLessThan(25);
        }
        // Rougher, more: measured 20.0° over the sea, 22.0° over open land, 25.8° over a forest in category 4. The
        // geostrophic drag law gives 17.7°, 20.5° and 27.1° across the isobars of a straight wind of 50 m/s over the
        // same surfaces (sin a = B u* / (κ G)): the same order, not the same flow (a vortex is not an Ekman layer).
        const sea = inflow("sea");
        const land = inflow(AIR_ROUGHNESS_M.land);
        expect(land).toBeGreaterThan(sea + 1);
        expect(inflow(AIR_ROUGHNESS_M.forest)).toBeGreaterThan(land + 1);
    }, 60_000);

    /** The wind at 1.2 radii east and west of an eye going north at 3 m/s for half a minute, and in the eye. */
    function moving(drag: number | "sea", southern = false): { east: number; west: number; eye: number } {
        const travel = -3 * PX_PER_M * 1e6;
        const hurricane: Hurricane = {
            ...standing(4, southern),
            fromY: 4200 - 0.5 * travel,
            toY: 4200 + 0.5 * travel,
        };
        const air = new AirSimulation({ ...MAP, roughness: () => drag });
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
        const speed = (w: { east: number; north: number }): number => Math.hypot(w.east, w.north) * 3.6;
        const eye = ring(air, 0.2, 3840, eyeY);
        return {
            east: speed(air.windAt(3840 + r, eyeY)),
            west: speed(air.windAt(3840 - r, eyeY)),
            // Round the eye at a fifth of the radius of the strongest winds, as for a standing one.
            eye: Math.hypot(eye.round, eye.out),
        };
    }

    it("blows harder on the right of a low that moves in the north, on its left in the south; calm in its eye", () => {
        for (const drag of ["sea", AIR_ROUGHNESS_M.land] as const) {
            const north = moving(drag);
            const south = moving(drag, true);
            expect(north.east, `${drag}`).toBeGreaterThan(north.west);
            expect(south.west, `${drag}`).toBeGreaterThan(south.east);
        }
        for (const drag of ["sea", AIR_ROUGHNESS_M.land] as const) {
            expect(moving(drag).eye, `${drag}`).toBeLessThan(0.15 * hurricaneMaxWind(4));
        }
    }, 60_000);

    it("keeps the radius of the strongest winds over a forest", () => {
        expect(strongest(spun(standing(4), AIR_ROUGHNESS_M.forest)).radii).toBeGreaterThan(0.7);
    }, 60_000);
    it("keeps the eye of a low moving over a forest calm", () => {
        expect(moving(AIR_ROUGHNESS_M.forest).eye).toBeLessThan(0.15 * hurricaneMaxWind(4));
    }, 60_000);
    it("blows harder on the right of a low moving over a forest, in the north", () => {
        const forest = moving(AIR_ROUGHNESS_M.forest);
        expect(forest.east).toBeGreaterThan(forest.west);
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

    /**
     * The wind a uniform wind of the room settles to over a surface of roughness `z0` (m), the pressure that keeps it
     * over the sea: where that pressure, the Coriolis force and the drag balance in a step of the air,
     * (1 + k dt) u − R u = P dt, R turning by f dt, k = Cd F |u| / h (Cd the sea's, F its landFriction).
     */
    function settledOver(z0: number, room: { east: number; north: number }): { east: number; north: number } {
        const [pe, pn] = AirSimulation.roomPressureForce(room);
        const dt = AIR_STEP_S;
        const c = Math.cos(AIR_CORIOLIS * dt);
        const s = Math.sin(AIR_CORIOLIS * dt);
        let { east, north } = room;
        for (let turn = 0; turn < 100; turn++) {
            const k0 = (seaDrag(Math.hypot(east, north)) * Math.hypot(east, north)) / AIR_LAYER_M;
            // The drag is that of the wind before it (1 + k dt times this one).
            const before = Math.hypot(east, north) * (1 + k0 * dt);
            const k = (seaDrag(before) * landFriction(before, z0) * before) / AIR_LAYER_M;
            const m = 1 + k * dt - c;
            const det = m * m + s * s;
            east = ((m * pe + s * pn) * dt) / det;
            north = ((m * pn - s * pe) * dt) / det;
        }
        return { east, north };
    }

    it("slows a wind over a forest and turns it towards the low, and nowhere else", () => {
        // A forest over a square in the middle of the map, the sea around. The wind crosses it in 8 s, far less than
        // the 90 s its drag takes to settle it: slowed and turned a little, not yet settled.
        const patch = (x: number, y: number): number | "sea" =>
            Math.abs(x - 3840) < 1200 && Math.abs(y - 2560) < 1200 ? AIR_ROUGHNESS_M.forest : "sea";
        const air = new AirSimulation({ ...MAP, roughness: patch });
        air.fill(() => ({ east: 10, north: 0 }));
        for (let step = 0; step < 1200; step++) air.step({ epoch: step * 100, room: { east: 10, north: 0 } });
        const inside = air.windAt(3840, 2560);
        const outside = air.windAt(600, 300);
        expect(Math.hypot(inside.east, inside.north)).toBeLessThan(Math.hypot(outside.east, outside.north) - 0.05);
        // The low of a west wind in the north lies to its north: the wind slowed turns that way.
        expect(inside.north).toBeGreaterThan(0);
        expect(Math.abs(outside.east - 10)).toBeLessThan(0.05);
        expect(Math.abs(outside.north)).toBeLessThan(0.05);
        // A forest all over: the wind settles where its drag, the Coriolis force and the pressure balance (measured
        // 9.82 m/s, turned 5.9° towards the low: tan a = k / f grows from 0.12 over the sea to 0.23 over a forest).
        const wood = new AirSimulation({ ...MAP, roughness: () => AIR_ROUGHNESS_M.forest });
        wood.fill(() => ({ east: 10, north: 0 }));
        for (let step = 0; step < 6000; step++) wood.step({ epoch: step * 100, room: { east: 10, north: 0 } });
        const settled = wood.windAt(3840, 2560);
        const balance = settledOver(AIR_ROUGHNESS_M.forest, { east: 10, north: 0 });
        expect(Math.hypot(settled.east, settled.north)).toBeLessThan(10 - 0.1);
        expect(Math.abs(settled.east - balance.east)).toBeLessThan(0.01);
        expect(Math.abs(settled.north - balance.north)).toBeLessThan(0.01);
        expect((Math.atan2(settled.north, settled.east) * 180) / Math.PI).toBeGreaterThan(3);
    }, 60_000);
});
