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
 * scale pressure that drives the wind of the room), the Coriolis force, the drag of the surface (by its kind: the
 * sea drags less than the land, the land less than a forest), and the advection of the wind by itself (from which the
 * centrifugal force comes). What emerges and is not given: the rotation the way of the hemisphere, the balance of the
 * gradient wind, the inflow across the isobars by the drag (stronger over land than over the sea), the calm of the
 * eye, the asymmetry of a low that moves.
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
 * eye stays calm over the sea and the land, the inflow over the sea is 19 to 32°; but a forest fills the eye half way
 * (53 km/h in it). At 2 m (a CHOICE, twice the similarity): calm everywhere, from category 1 to 5, the inflow over the
 * sea 17 to 24° in categories 4 and 5 (about 20° measured on real hurricanes), more over land, more again over a
 * forest; the strongest wind over the sea above that of its category at the eyewall, the more the stronger it is
 * (+4 % in category 1, +14 % in category 4, +18 % in category 5: the supergradient jet of a boundary layer, Kepert
 * 2001), where the slab without exchange at 5 m kept it within 6 % but with an inflow of only 8 to 15°.
 */
export const AIR_LAYER_M = 2;
/**
 * The drag coefficient of each surface (Large and Pond 1981 over the sea, capped at 2.5·10⁻³ past 31 m/s as Powell
 * 2003 measured in hurricanes; an order of magnitude over land and a forest, rougher).
 */
export const AIR_DRAG = { sea: 1.5e-3, land: 5e-3, forest: 1e-2 } as const;

/** The drag over the sea at a wind (m/s): Large and Pond, rising with the wind, capped in a hurricane. */
export function seaDrag(speed: number): number {
    if (speed <= 11) return 1.2e-3;
    return Math.min(2.5e-3, (0.49 + 0.065 * speed) * 1e-3);
}

/**
 * The low of the hurricane is the pressure drop of hurricanePressureDrop (Holland 1980, V² = B Δp / (ρ e), the drop
 * the water already feels): the same one. The slab, slightly supergradient at its wall and slowed by the drag, keeps
 * a strongest wind somewhat over that of its category (measured, see the tests): no other calibration.
 */

export interface AirSetup {
    /** The size of the map, map pixels. */
    width: number;
    height: number;
    /** The drag coefficient of the surface at a map point (pixels); the sea's by default. */
    drag?: (x: number, y: number) => number | "sea";
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
    /** The drag of each cell: a coefficient, or −1 for the sea (it depends on the wind there). */
    private readonly drag: Float32Array;
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
        this.drag = new Float32Array(cells).fill(-1);
        if (setup.drag) {
            for (let row = 0; row < this.rows; row++) {
                for (let column = 0; column < this.columns; column++) {
                    const kind = setup.drag(this.originX + column * AIR_CELL_PX, this.originY + row * AIR_CELL_PX);
                    this.drag[row * this.columns + column] = kind === "sea" ? -1 : kind;
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

    /** The drag coefficient of a cell for a wind of that speed (m/s). */
    private dragAt(at: number, speed: number): number {
        const kind = this.drag[at];
        return kind < 0 ? seaDrag(speed) : kind;
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
        // The low: Holland in pressure, p = pc + Δp exp(−(R/r)^B); its force per kilogram, towards the eye.
        const dropOverRho =
            storm && forcing.hurricane ? hurricanePressureDrop(forcing.hurricane.category) / AIR_DENSITY : 0;
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
