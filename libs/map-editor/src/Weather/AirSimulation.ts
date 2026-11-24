import { TILE_PX } from "../types";
import { TILE_AREA_M2 } from "../Terrain/Scale";
import { HURRICANE_HOLLAND_B, HURRICANE_RMAX_M, hurricaneAt, hurricanePressureDrop } from "../Catastrophe/Hurricane";
import type { Hurricane } from "../Catastrophe/Hurricane";

/**
 * The air near the ground of a map, simulated: a wind on a coarse grid that the forces move, instead of a wind given
 * by a formula. A slab of the boundary layer, its wind u (east, north, m/s), obeying
 *
 *   du/dt + (u·∇)u = −∇p/ρ − f k×u − (C_d / h) |u| u
 *
 * the pressure force (the low of a hurricane, its Holland profile in pressure, moving with its eye, and the large
 * scale pressure that drives the wind of the room), the Coriolis force, the drag of the surface (by its roughness: the
 * sea drags less than open land, open land less than a forest, and the layer is deeper over a rougher surface: see
 * dragAt), and the advection of the wind by itself (from which the centrifugal force comes). What emerges and is not
 * given: the rotation the way of the hemisphere, the balance of the gradient wind, the inflow across the isobars by
 * the drag (stronger over land than over the sea), the calm of the eye, the asymmetry of a low that moves.
 *
 * The scale, a CHOICE: the hurricane of the map is a thousand times smaller than a real one (30 m to its strongest
 * winds instead of 30 km). With the real Coriolis parameter (5·10⁻⁵ s⁻¹ in the tropics) nothing would turn at that
 * size. The model keeps the Rossby number of a real hurricane, V / (f R) ≈ 60 / (5·10⁻⁵ × 3·10⁴) = 40, hence
 * f* = V / (40 R) = 0.05 s⁻¹ at R = 30 m; and the ratio of the drag to the Coriolis force, which sets the inflow,
 * (C_d V / h) / f ≈ (2·10⁻³ × 60 / 1000) / 5·10⁻⁵ = 2.4, hence a layer h* = 1 m instead of 1 km. Every length a
 * thousandth, the speeds kept, the times a thousandth. The layer is then taken at 2 m (AIR_LAYER_M: see there why).
 *
 * The slab exchanges its air with the air above it (Smith 2003, "A simple model of the hurricane boundary layer",
 * QJRMS 129): it rises out where the slab converges (its wind kept), the air above sinks in where it diverges and
 * brings its gradient wind (w⁻ (u − u_gradient) / h, with w = −h div u).
 *
 * Numerics: semi-Lagrangian advection (stable at any step; bilinear, so it smooths a little: the loss is measured by
 * the tests), the drag implicit (stable however strong), the Coriolis force an exact rotation; edges copied from
 * inside. Pure: the same inputs give the same wind, wherever it is computed.
 */

/** Map pixels in a metre (Terrain/Scale). */
const PX_PER_METRE = TILE_PX / Math.sqrt(TILE_AREA_M2);
/** A cell of the air: four tiles (4.4 m): the eye of the hurricane (18 m) is four cells across its radius. */
export const AIR_CELL_TILES = 4;
export const AIR_CELL_PX = AIR_CELL_TILES * TILE_PX;
export const AIR_CELL_M = AIR_CELL_PX / PX_PER_METRE;
/** Cells kept around the map, so that its edges are not the edges of the air. */
export const AIR_MARGIN_CELLS = 10;
/** The step of the air, s. */
export const AIR_STEP_S = 0.1;
/** The density of the air, kg/m³. */
export const AIR_DENSITY = 1.15;
/** The Coriolis parameter of the reduced hurricane, s⁻¹ (see above: the same Rossby number as a real one). */
export const AIR_CORIOLIS = 0.05;
/**
 * The depth of the slab of air, m. The similarity above gives 1 m. The slab exchanges its air with the air above it
 * (Smith 2003): where it converges, its air rises out at the top (the eyewall); where it diverges, the air above
 * sinks in with its own wind, the gradient wind. Without that exchange (a slab of two dimensions only), the inflow ran
 * on into the eye and filled it (measured: 53° of inflow over the sea, the eye no longer calm). With it, at 1 m: the
 * eye stays calm over the sea and the land, the inflow over the sea is 19 to 32°; but a forest filled the eye half way
 * (53 km/h in it, with the drag of a forest then put in a layer as deep as over the sea: see dragAt). At 2 m (a
 * CHOICE, twice the similarity): calm everywhere, from category 1 to 5, the inflow over the sea 17 to 24° in
 * categories 4 and 5 (about 20° measured on real hurricanes), more over land, more again over a forest; the strongest
 * wind over the sea above that of its category at the eyewall, the more the stronger it is
 * (+4 % in category 1, +14 % in category 4, +18 % in category 5: the supergradient jet of a boundary layer, Kepert
 * 2001), where the slab without exchange at 5 m kept it within 6 % but with an inflow of only 8 to 15°.
 */
export const AIR_LAYER_M = 2;
/** The drag over the sea at a wind (m/s): Large and Pond 1981, rising with the wind, capped at 2.5·10⁻³ past 31 m/s as
 * Powell 2003 measured in hurricanes. */
export function seaDrag(speed: number): number {
    if (speed <= 11) return 1.2e-3;
    return Math.min(2.5e-3, (0.49 + 0.065 * speed) * 1e-3);
}

/**
 * The roughness length of each surface of land the air crosses, m: class 3 "open" (flat land, low vegetation) 0.03 m
 * and class 7 "closed" (a mature forest, its obstacles about as tall as they are apart) 1.0 m of the Davenport
 * classification as Wieringa updated it (J. Wieringa 1992, "Updating the Davenport roughness classification", J. Wind
 * Eng. Ind. Aerodyn. 41-44, pp. 357-368; reproduced in the WMO guide No. 8, summed up by Gemini, to be checked). The
 * sea's follows its wind (seaRoughness).
 */
export const AIR_ROUGHNESS_M = { land: 0.03, forest: 1 } as const;

/** The von Kármán constant. */
const KARMAN = 0.4;
/**
 * The constants of the neutral geostrophic drag law (Blackadar and Tennekes 1968, "Asymptotic similarity in neutral
 * barotropic planetary boundary layers", J. Atmos. Sci. 25): the classic A = 1.8, B = 4.5 (Garratt 1992, The
 * Atmospheric Boundary Layer; Hess and Garratt 2002, Boundary-Layer Meteorol. 104, fit A = 1.3, B = 4.4: summed up by
 * Gemini, to be checked; the ratio of two friction velocities, landFriction, moves by less than 1.5 % between the two).
 */
const DRAG_LAW_A = 1.8;
const DRAG_LAW_B = 4.5;
/**
 * The Coriolis parameter of the tropics, s⁻¹. The Rossby number of a surface, U / (f z0), is the same for the reduced
 * hurricane (f a thousand times, every length a thousandth: see above) as for a real one over real roughness lengths.
 */
const TROPICS_CORIOLIS = AIR_CORIOLIS / 1000;

/** The roughness length of the sea under a wind of the slab (m/s), m: from its drag at 10 m, Cd = (κ / ln(10/z0))². */
export function seaRoughness(speed: number): number {
    return 10 * Math.exp(-KARMAN / Math.sqrt(seaDrag(speed * AIR_SURFACE_RATIO)));
}

/**
 * The friction velocity over a surface of roughness `z0` (m) under a wind `speed` (m/s) above its surface layer, as a
 * share of that wind: the neutral geostrophic drag law, G / u* = (1 / κ) √((ln(u* / (f z0)) − A)² + B²), by iteration.
 */
export function frictionShare(speed: number, z0: number): number {
    const wind = Math.max(0.5, speed);
    let share = 0.03;
    for (let turn = 0; turn < 30; turn++) {
        share = KARMAN / Math.hypot(Math.log((wind * share) / (TROPICS_CORIOLIS * z0)) - DRAG_LAW_A, DRAG_LAW_B);
    }
    return share;
}

/** The friction of the slab over a land of roughness `z0` (m), as a multiple of the sea's, under a wind (m/s). */
export function landFriction(speed: number, z0: number): number {
    return frictionShare(speed, z0) / frictionShare(speed, seaRoughness(speed));
}

/** The winds (m/s) at which landFriction is tabulated: one per m/s, up to this. */
const FRICTION_TABLE_MS = 120;

/**
 * The low of the hurricane is the pressure drop of hurricanePressureDrop (Holland 1980, V² = B Δp / (ρ e), the drop
 * the water already feels): the same one. The slab, slightly supergradient at its wall and slowed by the drag, keeps
 * a strongest wind of the layer somewhat over that of its category; at 10 m (AIR_SURFACE_RATIO) it comes within 10 %
 * of it in categories 4 and 5 over the sea (measured, see the tests): no other calibration.
 */

/**
 * The wind of the slab is the mean wind of the boundary layer; what lives at the surface (the sea, its foam, the trees,
 * the debris, the water, the rain) and what the category of a hurricane is defined on is the wind at 10 m: "This mean
 * boundary layer (MBL) wind speed is then multiplied by 0.80, the mean ratio of the 10-m speed to the MBL speed
 * determined from the sample of eyewall dropsondes" (Franklin, Black and Valde 2003, Weather and Forecasting 18,
 * p. 42; the MBL is the mean over the lowest 500 m). The one place it is applied: surfaceWindAt.
 */
export const AIR_SURFACE_RATIO = 0.8;

export interface AirSetup {
    /** The size of the map, map pixels. */
    width: number;
    height: number;
    /** The roughness length of the surface at a map point (pixels), m (AIR_ROUGHNESS_M), or the sea (by default). */
    roughness?: (x: number, y: number) => number | "sea";
    /** The depth of the slab (m): AIR_LAYER_M by default. */
    layerM?: number;
    /** The exchange of the slab with the air above it (Smith 2003): true by default. */
    exchange?: boolean;
}

/** What drives the air at a step: the hurricane crossing the map (if any) and the wind of the room it blows in. */
export interface AirForcing {
    hurricane?: Hurricane;
    /** The time of the server, ms. */
    epoch: number;
    /** The wind of the room over the sea, east and north, m/s: the large scale pressure is set to keep it there. */
    room: { east: number; north: number };
}

/** The air of a map: its wind on a grid of AIR_CELL_PX, with a margin around the map. */
export class AirSimulation {
    public readonly columns: number;
    public readonly rows: number;
    /** The map point (pixels) of the centre of the first cell. */
    public readonly originX: number;
    public readonly originY: number;
    /** The wind, east and north (m/s), row by row. */
    public east: Float32Array;
    public north: Float32Array;
    private nextEast: Float32Array;
    private nextNorth: Float32Array;
    /** The surface of each cell: 0 for the sea, otherwise 1 + the index of its roughness in `friction`. */
    private readonly surface: Uint8Array;
    /** For each roughness of land, its landFriction at each m/s of wind up to FRICTION_TABLE_MS. */
    private readonly friction: Float32Array[] = [];
    private readonly layerM: number;
    private readonly exchange: boolean;

    constructor(setup: AirSetup) {
        this.layerM = setup.layerM ?? AIR_LAYER_M;
        this.exchange = setup.exchange ?? true;
        this.columns = Math.ceil(setup.width / AIR_CELL_PX) + 2 * AIR_MARGIN_CELLS;
        this.rows = Math.ceil(setup.height / AIR_CELL_PX) + 2 * AIR_MARGIN_CELLS;
        this.originX = (0.5 - AIR_MARGIN_CELLS) * AIR_CELL_PX;
        this.originY = (0.5 - AIR_MARGIN_CELLS) * AIR_CELL_PX;
        const cells = this.columns * this.rows;
        this.east = new Float32Array(cells);
        this.north = new Float32Array(cells);
        this.nextEast = new Float32Array(cells);
        this.nextNorth = new Float32Array(cells);
        this.surface = new Uint8Array(cells);
        if (setup.roughness) {
            const kinds = new Map<number, number>();
            for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                    const z0 = setup.roughness(this.originX + column * AIR_CELL_PX, this.originY + row * AIR_CELL_PX);
                    if (z0 === "sea") continue;
                    let kind = kinds.get(z0);
                    if (kind === undefined) {
                        if (this.friction.length >= 255) throw new Error("AirSimulation: over 255 roughness lengths");
                        const table = new Float32Array(FRICTION_TABLE_MS + 1);
                        for (let speed = 0; speed <= FRICTION_TABLE_MS; speed++) table[speed] = landFriction(speed, z0);
                        this.friction.push(table);
                        kind = this.friction.length;
                        kinds.set(z0, kind);
                    }
                    this.surface[row * this.columns + column] = kind;
                }
            }
        }
    }

    /** Sets the wind everywhere (east, north, m/s), from a function of the map point (pixels). */
    public fill(wind: (x: number, y: number) => { east: number; north: number }): void {
        for (let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                const at = row * this.columns + column;
                const w = wind(this.originX + column * AIR_CELL_PX, this.originY + row * AIR_CELL_PX);
                this.east[at] = w.east;
                this.north[at] = w.north;
            }
        }
    }

    /** The wind at a map point (pixels), bilinear between the cells: east and north, m/s. */
    public windAt(x: number, y: number): { east: number; north: number } {
        const gx = (x - this.originX) / AIR_CELL_PX;
        const gy = (y - this.originY) / AIR_CELL_PX;
        return { east: this.sample(this.east, gx, gy), north: this.sample(this.north, gx, gy) };
    }

    /** The wind at 10 m at a map point (pixels): that of the layer times AIR_SURFACE_RATIO. East and north, m/s. */
    public surfaceWindAt(x: number, y: number): { east: number; north: number } {
        const layer = this.windAt(x, y);
        return { east: layer.east * AIR_SURFACE_RATIO, north: layer.north * AIR_SURFACE_RATIO };
    }

    private sample(field: Float32Array, gx: number, gy: number): number {
        const x = Math.min(this.columns - 1.000001, Math.max(0, gx));
        const y = Math.min(this.rows - 1.000001, Math.max(0, gy));
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const at = y0 * this.columns + x0;
        const top = field[at] + (field[at + 1] - field[at]) * fx;
        const bottom = field[at + this.columns] + (field[at + this.columns + 1] - field[at + this.columns]) * fx;
        return top + (bottom - top) * fy;
    }

    /**
     * The drag of a cell for a wind of that speed (m/s), as the coefficient it has over the slab of AIR_LAYER_M: the
     * sea's; over land, the stress of the sea times F² over a layer F times deeper (F its landFriction), so F times it.
     *
     * Why deeper. A neutral boundary layer is as deep as its friction velocity over the Coriolis parameter,
     * h ≈ c u* / |f| with c about 0.25 to 0.3 (Rossby-number similarity: Blackadar and Tennekes 1968; Zilitinkevich
     * 1972; Tennekes 1973; Garratt 1992), u* over the inertial stability in a vortex; and the boundary layer of a
     * hurricane is found deeper over land than over the sea at a landfall (Giammanco et al. 2013, Weather and
     * Forecasting 28: its jet about 500 m up over the sea, about 1 km over land; c and these heights summed up by
     * Gemini, to be checked). At one point and one wind, f or the inertial stability is the same over either surface:
     * the depths are as the friction velocities. The stress grows as u*², the depth as u*: the slowing of the slab, stress over depth, as u*.
     * F = u* / u*_sea comes from the geostrophic drag law (landFriction), the depth growing with u* in it: 1.15 over
     * open land and 1.5 over a forest at the winds of a hurricane, 1.44 and 1.92 at 10 m/s.
     *
     * The slab first kept one depth everywhere, with a drag coefficient of 10⁻² over a forest (four times the sea's in
     * a hurricane): the stress of a forest held in the depth of the sea. Its inflow ran to 52° in category 4, brought
     * the angular momentum of the vortex in to 0.55 of the radius of the strongest winds, and its wall contracted and
     * outran the sea's (223 km/h at 10 m, 195 over the sea); the eye of a moving low filled (57 km/h at a fifth of
     * the radius), its strongest side turned round. With the layer deepening (measured, category 4): its strongest
     * wind at 0.85 of the radius (0.90 over the sea), 205 km/h at 10 m, its inflow 25.8° (20.0° over the sea, 22.0°
     * over open land), its eye calm moving or not, its strongest side on its right in the north. The continuity of the
     * slab does not see the change of its depth from one cell to the next (w / h = −div u): a simplification.
     */
    private dragAt(at: number, speed: number): number {
        const kind = this.surface[at];
        const sea = seaDrag(speed);
        if (kind === 0) return sea;
        const table = this.friction[kind - 1];
        const s = Math.min(FRICTION_TABLE_MS, Math.max(0, speed));
        const low = Math.min(FRICTION_TABLE_MS - 1, Math.floor(s));
        return sea * (table[low] + (table[low + 1] - table[low]) * (s - low));
    }

    /**
     * The large scale pressure force (m/s², east and north) that keeps the wind of the room over the sea: what balances
     * its Coriolis force and its drag there, in the steps of the simulation themselves (so that a uniform wind stays
     * exactly what it is). Over a rougher surface the same force gives a slower wind, turned towards the low.
     */
    public static roomPressureForce(
        room: { east: number; north: number },
        f = AIR_CORIOLIS,
        dt = AIR_STEP_S,
        layerM = AIR_LAYER_M,
    ): [number, number] {
        const speed = Math.hypot(room.east, room.north);
        const k = (seaDrag(speed) * speed) / layerM;
        // A step: u' = (R u + P dt) / (1 + k dt), R turning by f dt. Steady: P = ((1 + k dt) u − R u) / dt.
        const cos = Math.cos(f * dt);
        const sin = Math.sin(f * dt);
        const turnedE = room.east * cos + room.north * sin;
        const turnedN = -room.east * sin + room.north * cos;
        return [((1 + k * dt) * room.east - turnedE) / dt, ((1 + k * dt) * room.north - turnedN) / dt];
    }

    /** One step of the air (AIR_STEP_S, or `seconds`), driven by `forcing`. */
    public step(forcing: AirForcing, seconds = AIR_STEP_S): void {
        const { columns, rows } = this;
        const dt = seconds;
        const [roomE, roomN] = AirSimulation.roomPressureForce(forcing.room, AIR_CORIOLIS, dt, this.layerM);
        const roomWindE = forcing.room.east;
        const roomWindN = forcing.room.north;
        const storm = forcing.hurricane ? hurricaneAt(forcing.hurricane, forcing.epoch) : undefined;
        const share = storm?.share ?? 0;
        const spin = forcing.hurricane?.southern ? -1 : 1;
        const f = AIR_CORIOLIS * spin;
        // The low: Holland in pressure, p = pc + Δp exp(−(R/r)^B); its force per kilogram, towards the eye. It deepens
        // and fills with the storm (its share), as the low the water feels (hurricanePressure).
        const dropOverRho =
            storm && forcing.hurricane
                ? (hurricanePressureDrop(forcing.hurricane.category) * Math.max(0, storm.share)) / AIR_DENSITY
                : 0;
        const b = HURRICANE_HOLLAND_B;
        const rb = Math.pow(HURRICANE_RMAX_M, b);
        const cell = AIR_CELL_M;
        const cos = Math.cos(f * dt);
        const sin = Math.sin(f * dt);
        for (let row = 1; row < rows - 1; row++) {
            for (let column = 1; column < columns - 1; column++) {
                const at = row * columns + column;
                // Where the air here was a step ago (cells; north is up, rows go south).
                const gx = column - (this.east[at] * dt) / cell;
                const gy = row + (this.north[at] * dt) / cell;
                let e = this.sample(this.east, gx, gy);
                let n = this.sample(this.north, gx, gy);
                // Coriolis: the wind turned by f dt (to the right in the north).
                const re = e * cos + n * sin;
                const rn = -e * sin + n * cos;
                e = re;
                n = rn;
                // Pressure: the room, and the low. And the wind of the air above the slab, in balance with that
                // pressure (the gradient wind of the low, the wind of the room): what the slab takes in where it sinks.
                let pe = roomE;
                let pn = roomN;
                let aboveE = roomWindE;
                let aboveN = roomWindN;
                if (storm && share > 0) {
                    const x = this.originX + column * AIR_CELL_PX;
                    const y = this.originY + row * AIR_CELL_PX;
                    const de = (x - storm.eyeX) / PX_PER_METRE;
                    const dn = -(y - storm.eyeY) / PX_PER_METRE;
                    const r = Math.max(0.5, Math.hypot(de, dn));
                    const rmb = rb * Math.pow(r, -b);
                    const g = dropOverRho * b * (rmb / r) * Math.exp(-rmb) * share;
                    pe -= (g * de) / r;
                    pn -= (g * dn) / r;
                    const half = (r * Math.abs(f)) / 2;
                    const gradient = Math.sqrt(half * half + r * g) - half;
                    aboveE += (-dn / r) * spin * gradient;
                    aboveN += (de / r) * spin * gradient;
                }
                e += pe * dt;
                n += pn * dt;
                // The slab and the air above it (Smith 2003): where the slab diverges, the air above sinks into it
                // and brings its own wind (w⁻ (u − u_above) / h, implicit); where it converges, its air rises out at
                // the top, its wind kept: the inflow ends at the eyewall, where it goes up.
                if (this.exchange) {
                    const div =
                        (this.east[at + 1] - this.east[at - 1] + this.north[at - columns] - this.north[at + columns]) /
                        (2 * cell);
                    if (div > 0) {
                        const sink = dt * div;
                        e = (e + sink * aboveE) / (1 + sink);
                        n = (n + sink * aboveN) / (1 + sink);
                    }
                }
                // Drag, implicit.
                const speed = Math.hypot(e, n);
                const slow = 1 + (dt * this.dragAt(at, speed) * speed) / this.layerM;
                this.nextEast[at] = e / slow;
                this.nextNorth[at] = n / slow;
            }
        }
        // Edges: the air from inside.
        for (let column = 0; column < columns; column++) {
            this.copyCell(column, 0, column, 1);
            this.copyCell(column, rows - 1, column, rows - 2);
        }
        for (let row = 0; row < rows; row++) {
            this.copyCell(0, row, 1, row);
            this.copyCell(columns - 1, row, columns - 2, row);
        }
        [this.east, this.nextEast] = [this.nextEast, this.east];
        [this.north, this.nextNorth] = [this.nextNorth, this.north];
    }

    private copyCell(column: number, row: number, fromColumn: number, fromRow: number): void {
        const to = row * this.columns + column;
        const from = fromRow * this.columns + fromColumn;
        this.nextEast[to] = this.nextEast[from];
        this.nextNorth[to] = this.nextNorth[from];
    }
}
