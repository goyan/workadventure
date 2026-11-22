import type { SubToPusherRoomMessage, TerrainWaterMessage } from "@workadventure/messages";
import {
    DEFAULT_IMPACT_REACH,
    DEFAULT_WATER_PACE,
    DEFAULT_WATER_SETTINGS,
    TERRAIN_CELL,
    TILE_PX,
    WeatherType,
} from "../types";
import type { TerrainData, WAMFileFormat, WaterSettings } from "../types";
import { advanceImpactWave, blastWater, startImpactWave, strikeWater } from "../Catastrophe/ImpactWave";
import type { ImpactWave } from "../Catastrophe/ImpactWave";
import { sweepBalls } from "../Catastrophe/Ball";
import type { Ball } from "../Catastrophe/Ball";
import { DOWNPOUR_PX_PER_SECOND } from "../Catastrophe/Downpour";
import type { Downpour } from "../Catastrophe/Downpour";
import { DRAIN_PX_PER_SECOND, DRAIN_RIM_PX_PER_SECOND } from "../Catastrophe/Drain";
import type { Drain } from "../Catastrophe/Drain";
import { meteorShape } from "../Catastrophe/Meteor";
import { liquidRainRate, snowShareOf } from "../Weather/Precipitation";
import type { PrecipitationAir } from "../Weather/Precipitation";
import { rainRateAt } from "../Weather/RainRate";
import type { MapPlace, RealWeatherSlot } from "../Weather/RealWeather";
import { BallLevels } from "./BallLevels";
import { landWallsOf } from "./LandWalls";
import { pavedTilesOf } from "./Meadow";
import {
    POOL_FILL_SECONDS,
    POOL_OVERFLOW_SLACK_PX,
    POOL_PUMP_RESTART_SECONDS,
    poolBasins,
    poolCells,
    poolNumbersOf,
} from "./Pools";
import type { PoolCell } from "./Pools";
import { CELL_AREA_M2, LITRES_PER_M3 } from "./Scale";
import { closedDoorSides, holdsOpen, waterDoorsOf } from "./WaterDoors";
import type { WaterDoor } from "./WaterDoors";
import { CELL_LITRES_PER_PX, gridBoundsOf, WaterGrid } from "./WaterGrid";
import type { WaterGridBounds, WaterTally } from "./WaterGrid";
import {
    PX_PER_MM,
    ratesOf,
    stepInputOf,
    stepsBetweenUpdates,
    WATER_MESSAGE_MS,
    WATER_STEP_MS,
    waterObjectsOf,
} from "./WaterInputs";
import type { WaterObject } from "./WaterInputs";
import { WaterLoad } from "./WaterLoad";
import { waterWallsOf } from "./WaterWalls";

/** A map is never read larger than this, in cells of the relief, for the life and the water of its ground. */
const MAX_MAP_CELLS = 4096;

/** The size of a Tiled map in cells of the relief (TERRAIN_CELL): what the water and the meadow of its ground cover. */
export function mapCellsOf(map: { width?: number; height?: number; tilewidth?: number; tileheight?: number }): {
    width: number;
    height: number;
} {
    const cells = (tiles: number | undefined, tilePx: number | undefined): number =>
        Math.min(MAX_MAP_CELLS, Math.max(0, Math.ceil(((tiles ?? 0) * (tilePx ?? 32)) / TERRAIN_CELL)));
    return { width: cells(map.width, map.tilewidth), height: cells(map.height, map.tileheight) };
}

/** What a simulation of the ground reads of its room, and tells it: the server room, or a browser of its own. */
export interface SimulationRoom {
    getWam(): WAMFileFormat | undefined;
    sendSubMessageToRoom(subMessage: SubToPusherRoomMessage): void;
}

/** The real weather at a place, quarter hour by quarter hour, once known (the rain of the map in real weather). */
export interface RainSlots {
    slotsFor(place: MapPlace | undefined): RealWeatherSlot[] | undefined;
}

/** The room is told the water once a second (every tenth step), what changed only. */
const STEPS_PER_MESSAGE = WATER_MESSAGE_MS / WATER_STEP_MS;
/** A whole state is sent again this often (half a minute), so a browser that lost its place finds it again. */
const STEPS_PER_FULL_STATE = 300;
/**
 * A cell whose water changed by less than this many eighths of a pixel (a quarter of a pixel) since the room was
 * last told is not told again: a lake that barely ripples costs next to no network (measured: three to four times
 * less on a calm lake). Never for a cell that dries or gets wet, and the whole state puts everything right.
 */
const UNTOLD_EIGHTHS = 2;
/** While the wave of an impact runs, the room is told five times a second: a wave seen once a second would jump. */
const WAVE_STEPS_PER_MESSAGE = 2;
/** After an impact on a water with inertia, the room is told that often for this long (half a minute). */
const IMPACT_STIRRED_STEPS = 300;
/** A door stays open this many steps after the last avatar left its passage (a second), as it closes on the screens. */
const DOOR_OPEN_STEPS = 10;
/** The water is saved every half minute while it changes. */
const STEPS_PER_SAVE = 300;
/**
 * The time a room missed is lived again by steps this long (s): the water flows to where it rests in a few of them,
 * and a week of absence costs a thousand steps.
 */
const CATCH_UP_SECONDS = 600;

type Sums = Omit<WaterTally, "moved">;
const noSums = (): Sums => ({ rainPx: 0, sourcesPx: 0, sinksPx: 0, evaporationPx: 0, absorptionPx: 0, lostPx: 0 });

/**
 * Keeps the water of the relief of a room: a depth of water for each cell of a grid (WaterGrid), stepped ten times a
 * second with the rain of the map, its dry weather, its sources and its sinks. The server runs it for the room, so
 * that every player sees the same water (TerrainWaterManager, which also saves it); a browser runs its own under the
 * weather of the place its player chose. The room is told once a second what changed, and what came in and went out
 * (the dashboard of the relief tool).
 *
 * A room without relief nor water object costs nothing: no timer, nothing read. Water at rest with nothing coming in
 * is not stepped. GameRoom tells when the map changed (mapChanged): the water stays where it was.
 */
export class WaterSimulation {
    private grid: WaterGrid | undefined;
    private objects: WaterObject[] = [];
    private readTerrain: TerrainData | undefined | null = null;
    /** The walls the grid was built with (their signature): a wall built or removed makes a new grid. */
    private readWalls: string | undefined;
    /** The floors the grid was last given (their signature): the drains standing on them keep them dry. */
    private readFloors: string | undefined;
    /** The water to start from (saved before a restart, or seeded), until the first grid takes it. */
    protected saved: WaterGrid | undefined;
    private timer: ReturnType<typeof setInterval> | undefined;
    private steps = 0;
    /** The step the room was last told at: the rates it is told are over the time since. */
    private toldAtStep = 0;
    /** The waves of the impacts still running. */
    private waves: ImpactWave[] = [];
    /** The step until which the room is told often: the real wave of an impact on a water with inertia. */
    private stirredUntilStep = 0;
    /** The downpours falling on the map now, asked at each step: none until the catastrophes of the room say. */
    private downpours: () => readonly Downpour[] = () => [];
    /** The cells of the pools of the map, with the depth of their basin: what the pumps fill at each step. */
    private pools: readonly PoolCell[] = [];
    /** The pool each of those cells belongs to (poolNumbersOf), by cell key: a drain in its water stops its pump. */
    private poolNumbers = new Map<string, number>();
    /** The step from which the pumps of the pools run again: a meteor that fell in the water stops them a moment. */
    private pumpsFromStep = 0;
    /** The doors of the ground of the map: closed, they hold the water; open, they let it through. */
    private doors: WaterDoor[] = [];
    /** For each door, the step until which it is open: an avatar stood in its passage a moment ago. */
    private doorOpenUntil: number[] = [];
    /** Which doors the grid was last told closed; undefined when it must be told again (a new grid). */
    private closedDoors: string | undefined;
    /** Where the avatars standing on the ground are, asked at each step: nobody until the room says. */
    private walkers: () => readonly { x: number; y: number }[] = () => [];
    /** The drains open on the map now, asked at each step: none until the catastrophes of the room say. */
    private drains: () => readonly Drain[] = () => [];
    /** The balls standing on the map now, asked at each step: none until the catastrophes of the room say. */
    private balls: () => readonly Ball[] = () => [];
    /** Where the balls stood at the last step: a ball that moved since is taken along its way. */
    private ballsBefore: readonly Ball[] = [];
    /** The level each ball is held at, and where it was when that was decided. */
    private readonly ballLevels = new BallLevels();
    private sums: Sums = noSums();
    /** Whether the last step moved any water: a grid at rest with nothing coming in is not stepped. */
    private moving = true;
    /** How hard it rains (mm an hour), read once a second. */
    private rainRate = 0;
    /** The air the rain of the map falls through: the conditions of the room, once it gives them. */
    private air: () => PrecipitationAir | undefined = () => undefined;
    /** What the room was last told, to send only what changed since. */
    private sentBytes: Uint8Array | undefined;
    private sentRates = false;
    private seq = 0;
    /** Counts the changes of the water (a step that moved it, a new grid): what lives in it reads it again then. */
    private version = 0;
    /** The step the room was last told a whole state at. */
    private fullAtStep = -Infinity;
    protected changedSinceSave = false;
    /**
     * Whether anything was computed on the grid since the room was last told (a step, an impact, a new grid): while
     * nothing was, its depths are those the room knows and there is nothing to write nor to compare.
     */
    private untold = true;
    /** How long the steps take, and the fineness given up while they take too long. */
    private readonly load: WaterLoad;
    /** The time missed while the room was empty that is not lived again yet, and the rain (mm) that fell in it. */
    private missed = { seconds: 0, rainMm: 0 };

    constructor(
        private readonly room: SimulationRoom,
        private readonly rain: RainSlots,
        /** Packs the bytes told to the room (gzip on the server; as they are where nothing travels). */
        private readonly zip: (bytes: Uint8Array) => Uint8Array,
        private readonly now: () => number = Date.now,
        /** The size of the map in cells of the relief, once read: the water stays inside the map. */
        private readonly mapSize: () => { width: number; height: number } | undefined = () => undefined,
        /** A clock in ms, to time the steps. */
        private readonly clock: () => number = () => performance.now(),
        /**
         * The time a step may take before the fineness is lowered (ms, see WaterLoad): the time between two steps on
         * the server, which has a thread of its own; less in a browser, where the game is drawn alongside.
         */
        budgetMs: number = WATER_STEP_MS,
    ) {
        this.load = new WaterLoad(budgetMs);
    }

    /**
     * The water to start from: the depths of a whole state (WaterGrid.writeDepths) over `bounds`, taken by the first
     * grid of the map. False when they do not fit the bounds.
     */
    public seed(depths: Uint8Array, bounds: WaterGridBounds): boolean {
        const grid = new WaterGrid(undefined, bounds);
        if (!grid.readDepths(depths)) return false;
        this.saved = grid;
        return true;
    }

    public start(): void {
        this.mapChanged();
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        this.save();
    }

    /** Keeps the water where it survives a restart: nothing here, the server saves it (TerrainWaterManager). */
    protected save(): void {}

    /** The map of the room changed (or was just read): the grid follows its relief and its water objects. */
    public mapChanged(): void {
        const wam = this.room.getWam();
        this.objects = waterObjectsOf(wam);
        // For the water, a pool painted on the map is a basin dug in its ground, which a pump fills.
        const terrain = poolBasins(wam?.terrain, wam?.settings?.pools);
        this.pools = poolCells(wam?.terrain, wam?.settings?.pools);
        this.poolNumbers = poolNumbersOf(this.pools);
        // A map whose size could not be read keeps all its water: an empty size would dry the whole map.
        const size = this.mapSize();
        const bounds = gridBoundsOf(
            terrain,
            this.objects,
            size && size.width > 0 && size.height > 0 ? size : undefined,
        );
        // The walls matter only where there is water to hold: a map without relief nor water object reads none.
        const walls = bounds ? waterWallsOf(wam) : undefined;
        // The rooms (walls with their doors closed): their floors drain the water that came in.
        const rooms = bounds ? landWallsOf(wam) : undefined;
        const wallsSignature = walls && rooms ? `${walls.signature}#${rooms.signature}` : undefined;
        const sameGrid =
            this.readTerrain !== null &&
            terrain === this.readTerrain &&
            wallsSignature === this.readWalls &&
            sameBounds(bounds, this.grid?.bounds ?? undefined, this.grid !== undefined);
        // A source or a sink may have come or gone: the water is looked at again.
        this.moving = true;
        // The floors of the buildings, which their drains keep dry: laid again only when they changed.
        const floors = bounds ? pavedTilesOf(wam) : new Set<string>();
        const floorsSignature = [...floors].sort().join(";");
        if (sameGrid) {
            if (floorsSignature !== this.readFloors) {
                this.readFloors = floorsSignature;
                this.grid?.setFloors(floors);
            }
            return;
        }
        this.readTerrain = terrain;
        this.readWalls = wallsSignature;
        const before = this.grid ?? this.saved;
        this.saved = undefined;
        this.grid = bounds ? new WaterGrid(terrain, bounds, undefined, walls, rooms) : undefined;
        this.grid?.setFloors(floors);
        this.readFloors = floorsSignature;
        // The doors of the map, all closed until someone is seen in their passage; the new grid is told at its
        // next step.
        this.doors = bounds ? waterDoorsOf(wam) : [];
        this.doorOpenUntil = this.doors.map(() => 0);
        this.closedDoors = undefined;
        this.version++;
        // The basins of the pools take the rain alone, not the runoff of the ground around.
        this.grid?.seal(this.pools);
        if (this.grid && before) this.grid.takeFrom(before);
        // The cells are not the same any more: the room is told the whole state at its next message.
        this.sentBytes = undefined;
        this.untold = true;
        if (this.grid && !this.timer) {
            this.timer = setInterval(() => this.tick(), WATER_STEP_MS);
            // The water of a room must never keep the process alive.
            this.timer.unref?.();
        } else if (!this.grid) {
            if (this.timer) clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * A step from the timer. An error there would take the whole server down, with every room: the water of this room
     * stops instead (until its map changes), and the error is reported once.
     */
    private tick(): void {
        try {
            this.step();
        } catch (error) {
            console.error("The water of the relief of the map stopped on an error", error);
            if (this.timer) clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * The temperature and the humidity the rain of the map falls through (the conditions of the room): in the cold it
     * falls as snow, which brings no water (see liquidRainRate).
     */
    public fallThrough(air: () => PrecipitationAir | undefined): void {
        this.air = air;
    }

    /** One step of the water (ten a second), and once a second the room is told. */
    public step(): void {
        const grid = this.grid;
        if (!grid) {
            // A map that lost its water: the waves running on it have nothing left to move.
            this.waves = [];
            return;
        }
        const started = this.clock();
        const settings = this.room.getWam()?.settings;
        // The fineness and the tellings the map asks for are ceilings: less while the steps take too long.
        const asked = settings?.water?.inertia ? (settings.water.precision ?? DEFAULT_WATER_PACE.precision) : 1;
        const water = settings?.water?.inertia
            ? { ...settings.water, precision: this.load.precision(asked) }
            : settings?.water;
        // The map says how high its water may stand; lowered, what stands over it goes at this step.
        const highest = grid.maxSurface();
        grid.setMaxSurface(settings?.water?.maxSurface ?? DEFAULT_WATER_SETTINGS.maxSurface);
        if (grid.maxSurface() !== highest) this.moving = true;
        if (this.steps % STEPS_PER_MESSAGE === 0) {
            // Only a map in real weather has a timeline to read.
            const slots =
                settings?.weather === WeatherType.Real ? this.rain.slotsFor(settings.weatherLocation) : undefined;
            // What falls as snow lies where it fell: only the rain runs to the hollows and soaks the soil.
            this.rainRate = liquidRainRate(rainRateAt(settings, this.now(), slots), this.air());
        }
        this.steps++;
        this.swingDoors(grid);
        // Before anything is poured or flows: the balls are where they are for the whole step.
        const displacing = this.placeBalls(grid);
        // Both each step: a downpour goes on raining while the wave of a meteor runs.
        const raining = this.pourDownpours(grid);
        this.pumpPools(grid, WATER_STEP_MS / 1000);
        const draining = this.takeDrains(grid);
        const waving = this.waves.length > 0 || raining || draining || displacing || this.steps < this.stirredUntilStep;
        if (this.waves.length > 0) this.advanceWaves(grid);
        const pouring = this.rainRate > 0 || this.objects.some((object) => object.litresPerMinute > 0);
        if (this.moving || pouring) {
            const tally = grid.step(stepInputOf(water, this.rainRate, this.objects, WATER_STEP_MS / 1000));
            this.untold = true;
            this.moving = tally.moved;
            if (tally.moved) this.version++;
            if (tally.moved) this.changedSinceSave = true;
            this.sums.rainPx += tally.rainPx;
            this.sums.sourcesPx += tally.sourcesPx;
            this.sums.sinksPx += tally.sinksPx;
            this.sums.evaporationPx += tally.evaporationPx;
            this.sums.absorptionPx += tally.absorptionPx;
            this.sums.lostPx += tally.lostPx;
        }
        // As often as the map asks while the water moves, and at least five times a second under a wave.
        const between = stepsBetweenUpdates(this.load.updates(settings?.water?.updates ?? DEFAULT_WATER_PACE.updates));
        if (this.steps % between === 0 || (waving && this.steps % Math.min(between, WAVE_STEPS_PER_MESSAGE) === 0)) {
            this.tell(grid);
        }
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
        this.load.record(this.clock() - started, asked);
    }

    /**
     * The pools a drain stands in (its foot in their water), adaptive (WaterSinkPropertyData.adaptive): their pumps
     * are off while it is there, so that the pool empties by it. A drain that is not adaptive leaves the pump on.
     */
    private drainedPools(): Set<number> {
        const drained = new Set<number>();
        for (const object of this.objects) {
            if (object.litresPerMinute >= 0 || object.adaptive === false) continue;
            const pool = this.poolNumbers.get(`${object.cellX},${object.cellY}`);
            if (pool !== undefined) drained.add(pool);
        }
        return drained;
    }

    /**
     * The pumps of the pools: each cell of a pool that stands under its level takes what fills an empty pool in
     * POOL_FILL_SECONDS, so a larger or deeper pool has a stronger pump; counted with the sources. A cell that stands
     * over its level (a snow that melted in the pool, a rain) loses as much through the overflow of the pool, counted
     * with the sinks: a flood that brings more than that still runs over the rim.
     */
    private pumpPools(grid: WaterGrid, seconds: number): void {
        if (this.pools.length === 0) return;
        const drained = this.drainedPools();
        let laid = 0;
        let taken = 0;
        for (const { cellX, cellY, depthPx, fullPx } of this.pools) {
            // A ball stands in the place of the water of this cell: nothing to fill.
            if (grid.ballAt(cellX, cellY)) continue;
            const missing = fullPx - grid.depthAt(cellX, cellY);
            const pumped = (depthPx * seconds) / POOL_FILL_SECONDS;
            if (missing > 0) {
                if (this.steps < this.pumpsFromStep) continue;
                // A drain stands in this pool: its pump is off, the pool empties.
                if (drained.has(this.poolNumbers.get(`${cellX},${cellY}`) ?? 0)) continue;
                laid += grid.rainOn(cellX, cellY, 0, Math.min(missing, pumped));
            } else if (missing < -POOL_OVERFLOW_SLACK_PX) {
                const px = Math.min(-missing, pumped);
                taken += grid.drainDisc(cellX, cellY, 0, px, px);
            }
        }
        if (laid <= 0 && taken <= 0) return;
        this.sums.sourcesPx += laid;
        this.sums.sinksPx += taken;
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
    }

    /**
     * The time the room missed while it was empty, lived again as the meadow catches up (MeadowManager.catchUpWith):
     * `seconds` of it under `rainMmPerHour` of rain (what falls as snow lies on the meadow, which pours its melt
     * here). Lived by steps of CATCH_UP_SECONDS, without inertia: the water ends where it rests, the lakes filled by the
     * rain of the past and lowered by its dry days, the pools pumped. `last` says the meadow caught up.
     */
    public liveAgain(seconds: number, rainMmPerHour: number, last: boolean): void {
        const grid = this.grid;
        if (!grid) return;
        if (seconds > 0) {
            this.missed.seconds += seconds;
            this.missed.rainMm += (Math.max(0, rainMmPerHour) * seconds) / 3600;
        }
        if (this.missed.seconds <= 0 || (!last && this.missed.seconds < CATCH_UP_SECONDS)) return;
        const { seconds: lived, rainMm } = this.missed;
        this.missed = { seconds: 0, rainMm: 0 };
        const water = this.room.getWam()?.settings?.water;
        grid.step(stepInputOf(water && { ...water, inertia: false }, (rainMm * 3600) / lived, this.objects, lived));
        this.pumpPools(grid, lived);
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
    }

    /** The room says where its avatars standing on the ground are: they hold the doors open. */
    public setWalkers(walkers: () => readonly { x: number; y: number }[]): void {
        this.walkers = walkers;
    }

    /**
     * The doors open for who stands in their passage and close a second after: a closed door holds the water, an
     * open one lets it through. The grid is told only when a door changed.
     */
    private swingDoors(grid: WaterGrid): void {
        if (this.doors.length === 0) {
            if (this.closedDoors !== "") {
                grid.setClosedDoors(undefined);
                this.closedDoors = "";
            }
            return;
        }
        const walkers = this.walkers();
        let key = "";
        for (let index = 0; index < this.doors.length; index++) {
            const door = this.doors[index];
            if (walkers.some((walker) => holdsOpen(door, walker))) {
                this.doorOpenUntil[index] = this.steps + DOOR_OPEN_STEPS;
            }
            if (this.steps >= this.doorOpenUntil[index]) key += `${index},`;
        }
        if (key === this.closedDoors) return;
        this.closedDoors = key;
        grid.setClosedDoors(closedDoorSides(this.doors, (index) => this.steps < this.doorOpenUntil[index]));
        // The water on each side of a door that just opened or closed has somewhere new to go, or nowhere.
        this.moving = true;
    }

    /** The catastrophes of the room say which downpours are falling. */
    public setDownpours(downpours: () => readonly Downpour[]): void {
        this.downpours = downpours;
    }

    /**
     * The downpours rain on the water during a step: counted with the rain. True when water fell, so that the room
     * sees it rise as often as under a wave.
     */
    private pourDownpours(grid: WaterGrid): boolean {
        const falling = this.downpours();
        if (falling.length === 0) return false;
        // In the cold of the room a downpour falls as snow: that part lies on the ground (MeadowManager) and brings
        // no water until it melts.
        const px = ((DOWNPOUR_PX_PER_SECOND * WATER_STEP_MS) / 1000) * (1 - snowShareOf(this.air()));
        if (px <= 0) return false;
        let laid = 0;
        for (const downpour of falling) {
            laid += grid.rainOn(
                Math.floor(downpour.x / TERRAIN_CELL),
                Math.floor(downpour.y / TERRAIN_CELL),
                downpour.wholeMap ? undefined : (downpour.radiusTiles * TILE_PX) / TERRAIN_CELL,
                px,
            );
        }
        if (laid > 0) {
            this.sums.rainPx += laid;
            this.moving = true;
            this.version++;
            this.changedSinceSave = true;
        }
        return laid > 0;
    }

    /**
     * The water of a snow that melted on a tile (`mm` of water) is poured on the cells of that tile, as a rain:
     * counted with the rain, nothing in a wall nor over the highest level. Returns the mm that were poured: none
     * outside the grid of the water.
     */
    public pour(tileX: number, tileY: number, mm: number): number {
        const grid = this.grid;
        if (!grid || !Number.isFinite(mm) || mm <= 0 || !Number.isFinite(tileX) || !Number.isFinite(tileY)) return 0;
        const cells = TILE_PX / TERRAIN_CELL;
        let laid = 0;
        for (let y = 0; y < cells; y++) {
            for (let x = 0; x < cells; x++)
                laid += grid.rainOn(tileX * cells + x, tileY * cells + y, 0, mm * PX_PER_MM);
        }
        if (laid <= 0) return 0;
        this.sums.rainPx += laid;
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
        return laid / (cells * cells * PX_PER_MM);
    }

    /** The catastrophes of the room say which balls stand on the map. */
    public setBalls(balls: () => readonly Ball[]): void {
        this.balls = balls;
    }

    /**
     * The altitude of the centre of a ball of the room held at a point of the map (pixels): the level of the water
     * it stands in there, where it is half in the water, or the ground where there is no water. A ball keeps its
     * level while it is held still, whatever the wave it makes; once it moved, it takes the level of the water it
     * came onto when that is not the one it had (BALL_LEVEL_SLACK_PX). The level is read over the water around the
     * ball, not under it (WaterGrid.restLevelAt): the hole the ball makes does not pull it down, nor the bed it
     * swept dry on its way (BALL_LEVEL_REACH_CELLS).
     */
    public ballLevelAt(id: number, x: number, y: number): number {
        return this.ballLevels.levelAt(id, x, y, this.grid, () => this.room.getWam()?.terrain);
    }

    /**
     * The balls take the place of the water where they stand (WaterGrid.setBalls): nothing comes in nor goes out,
     * the water is only pushed away, or let back. True while a ball stands on the map, so that the room sees the
     * water move as often as under a wave.
     */
    private placeBalls(grid: WaterGrid): boolean {
        const held = this.balls();
        if (held.length === 0 && this.ballsBefore.length === 0) {
            this.ballLevels.clear();
            return false;
        }
        // Each ball at the level of the water it stands in; the level of a ball that is gone is forgotten.
        const standing = held.map((ball) => ({ ...ball, levelPx: this.ballLevelAt(ball.id, ball.x, ball.y) }));
        this.ballLevels.keep(standing.map((ball) => ball.id));
        // A ball is under the pointer of its player at once: it may have gone several cells since the last step,
        // and up or down to another water. It pushed the water of the whole way, not only of where it is now.
        let changed = false;
        for (const balls of sweepBalls(this.ballsBefore, standing)) {
            if (grid.setBalls(balls)) changed = true;
        }
        this.ballsBefore = standing;
        if (changed) {
            this.moving = true;
            this.version++;
            this.changedSinceSave = true;
        }
        return standing.length > 0;
    }

    /** The catastrophes of the room say which drains are open. */
    public setDrains(drains: () => readonly Drain[]): void {
        this.drains = drains;
    }

    /**
     * The drains take the water of their discs during a step: counted with the sinks. True when water went, so that
     * the room sees it fall as often as under a wave.
     */
    private takeDrains(grid: WaterGrid): boolean {
        const open = this.drains();
        if (open.length === 0) return false;
        const centrePx = (DRAIN_PX_PER_SECOND * WATER_STEP_MS) / 1000;
        const rimPx = (DRAIN_RIM_PX_PER_SECOND * WATER_STEP_MS) / 1000;
        let taken = 0;
        for (const drain of open) {
            taken += grid.drainDisc(
                Math.floor(drain.x / TERRAIN_CELL),
                Math.floor(drain.y / TERRAIN_CELL),
                (drain.radiusTiles * TILE_PX) / TERRAIN_CELL,
                centrePx,
                rimPx,
            );
        }
        if (taken > 0) {
            this.sums.sinksPx += taken;
            this.moving = true;
            this.version++;
            this.changedSinceSave = true;
        }
        return taken > 0;
    }

    /** The waves of the impacts move on; one that ended is forgotten, and what it lost is counted. */
    private advanceWaves(grid: WaterGrid): void {
        this.waves = this.waves.filter((wave) => {
            const { done, lostPx } = advanceImpactWave(grid, wave);
            this.sums.lostPx += lostPx;
            return !done;
        });
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
    }

    /**
     * A meteor lands at a point of the map (pixels), its crater `radiusTiles` wide: its water is thrown out, and a wave carries it to
     * the shores, step after step. On a map whose water has inertia the water is thrown up in a rim around the
     * crater and makes its own wave. The room is told at once. Nothing on a map without water.
     */
    public strike(x: number, y: number, radiusTiles: number): void {
        const grid = this.grid;
        if (!grid) return;
        const shape = meteorShape(radiusTiles);
        const cellX = Math.floor(x / TERRAIN_CELL);
        const cellY = Math.floor(y / TERRAIN_CELL);
        this.stopPumps();
        // The shock first drives the water around the crater away; then the water of the crater is thrown up.
        this.blast(grid, cellX, cellY, radiusTiles);
        if (this.room.getWam()?.settings?.water?.inertia === true) {
            // A water with inertia makes its own wave: the impact only throws the water of the crater around it.
            const struck = strikeWater(grid, cellX, cellY, shape);
            if (!struck) return;
            this.sums.sourcesPx += struck.addedPx;
            this.sums.lostPx += struck.lostPx;
            this.stirredUntilStep = this.steps + IMPACT_STIRRED_STEPS;
            this.moving = true;
            this.version++;
            this.changedSinceSave = true;
            this.tell(grid);
            return;
        }
        const started = startImpactWave(grid, cellX, cellY, shape);
        if (!started) return;
        this.waves.push(started.wave);
        this.sums.sourcesPx += started.addedPx;
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
        this.tell(grid);
    }

    /**
     * A fireball lands at a point of the map (pixels), its crater `radiusTiles` wide: the water of the crater boils
     * away, counted as lost, and its steam blows the water around the crater outwards (see blast). The room is told
     * at once. Nothing on a map without water.
     */
    public vaporise(x: number, y: number, radiusTiles: number): void {
        const grid = this.grid;
        if (!grid) return;
        const taken = grid.takeDisc(
            Math.floor(x / TERRAIN_CELL),
            Math.floor(y / TERRAIN_CELL),
            meteorShape(radiusTiles).discCells,
        );
        if (!taken) return;
        // The steam of the water it boils away blows the water around the crater outwards.
        const blast = this.blast(grid, Math.floor(x / TERRAIN_CELL), Math.floor(y / TERRAIN_CELL), radiusTiles);
        if (taken.takenPx <= 0 && blast <= 0) return;
        this.stopPumps();
        this.sums.lostPx += taken.takenPx;
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
        this.tell(grid);
    }

    /**
     * The blast of an impact drives the water around its crater away, as far as the map says (WaterSettings
     * .impactReach, see blastWater). Returns the water moved; what found no room past the blast is counted lost.
     */
    private blast(grid: WaterGrid, cellX: number, cellY: number, radiusTiles: number): number {
        const reach = this.room.getWam()?.settings?.water?.impactReach ?? DEFAULT_IMPACT_REACH;
        // An impact is told at once, whatever it moved.
        this.untold = true;
        const blast = blastWater(grid, cellX, cellY, meteorShape(radiusTiles), reach);
        if (!blast) return 0;
        this.sums.lostPx += blast.lostPx;
        return blast.movedPx;
    }

    /** A meteor fell in the water: the pumps of the pools start again a moment later, so an emptied pool is seen empty. */
    private stopPumps(): void {
        if (this.pools.length === 0) return;
        this.pumpsFromStep = this.steps + (POOL_PUMP_RESTART_SECONDS * 1000) / WATER_STEP_MS;
    }

    /** The grid of the water, for what lives in it. Undefined on a map without water. */
    public getGrid(): WaterGrid | undefined {
        return this.grid;
    }

    /** A number that changes whenever the water does. */
    public waterVersion(): number {
        return this.version;
    }

    /** The whole state the room was last told, for a player who joins it. Undefined on a map without water. */
    public snapshot(): TerrainWaterMessage | undefined {
        if (!this.grid || !this.sentBytes) return undefined;
        return { ...this.grid.bounds, seq: this.seq, full: true, depths: this.zip(this.sentBytes) };
    }

    /** Tells the room what changed over the last second, and what came in and went out. Nothing when nothing did. */
    private tell(grid: WaterGrid): void {
        const sums = this.sums;
        this.sums = noSums();
        // Usually a second, less when an impact or its wave has the room told sooner.
        const stepsSince = Math.max(1, this.steps - this.toldAtStep);
        this.toldAtStep = this.steps;
        const speed = this.room.getWam()?.settings?.water?.speed ?? DEFAULT_WATER_SETTINGS.speed;
        const rates = ratesOf(sums, (stepsSince * WATER_STEP_MS) / 1000, speed);
        const anyRate = Object.values(rates).some((rate) => rate > 0);
        // Nothing computed since the room was last told, and no rate to tell nor to take back: nothing to say, and
        // no need to write the depths of the whole grid to find it out.
        const idle = !this.untold && !anyRate && !this.sentRates;
        this.untold = false;
        if (idle) return;
        const bytes = grid.writeDepths();
        const previous = this.sentBytes;
        // A whole state when the room knows none (or another grid), and again every half minute.
        const full =
            !previous || previous.length !== bytes.length || this.steps - this.fullAtStep >= STEPS_PER_FULL_STATE;
        let payload = bytes;
        let changed = !previous || previous.length !== bytes.length;
        if (previous && previous.length === bytes.length) {
            // What barely changed since the room was told is not told again; a whole state tells it as it is.
            const told = full ? Uint8Array.from(bytes) : bytes;
            for (let index = 0; index < bytes.length; index += 2) {
                const now = bytes[index] | (bytes[index + 1] << 8);
                const before = previous[index] | (previous[index + 1] << 8);
                if (now === before) continue;
                if (now !== 0 && before !== 0 && Math.abs(now - before) < UNTOLD_EIGHTHS) {
                    told[index] = previous[index];
                    told[index + 1] = previous[index + 1];
                } else changed = true;
            }
            if (!full) {
                payload = new Uint8Array(bytes.length);
                for (let index = 0; index < bytes.length; index++) payload[index] = bytes[index] ^ previous[index];
            }
        }
        // Still water: nothing to say, but for the rates going back to nothing.
        if (!changed && !anyRate && !this.sentRates) return;
        // A dry map the room was never told about: still nothing to say (a player who joins sees it dry).
        if (previous === undefined && !anyRate && grid.totalPx() === 0) return;
        this.sentBytes = bytes;
        this.sentRates = anyRate;
        // The speed of a water with inertia, so that the browsers carry what floats as the water really runs.
        const water = this.room.getWam()?.settings?.water;
        const speeds = water?.inertia === true ? grid.writeSpeedBytes(water.flowPace) : undefined;
        if (full) this.fullAtStep = this.steps;
        this.seq++;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "terrainWaterMessage",
                terrainWaterMessage: {
                    ...grid.bounds,
                    seq: this.seq,
                    full,
                    depths: this.zip(payload),
                    ...(speeds ? { speeds: this.zip(speeds.speeds) } : {}),
                    ...(speeds?.slow ? { slowSpeeds: this.zip(speeds.slow) } : {}),
                    stats: {
                        ...rates,
                        stock: (grid.totalPx() * CELL_LITRES_PER_PX) / LITRES_PER_M3,
                        wetArea: grid.wetCells() * CELL_AREA_M2,
                        rainRate: this.rainRate,
                        ...this.eased(water),
                    },
                },
            },
        });
    }

    /** What the server lowered under what the map asks, for the relief tool to say so; nothing when nothing is. */
    private eased(water: WaterSettings | undefined): { easedPrecision?: number; easedUpdates?: number } {
        const precision = water?.inertia ? (water.precision ?? DEFAULT_WATER_PACE.precision) : 1;
        const updates = water?.updates ?? DEFAULT_WATER_PACE.updates;
        return {
            ...(this.load.precision(precision) < precision ? { easedPrecision: this.load.precision(precision) } : {}),
            ...(this.load.updates(updates) < updates ? { easedUpdates: this.load.updates(updates) } : {}),
        };
    }
}

function sameBounds(a: WaterGridBounds | undefined, b: WaterGridBounds | undefined, hasGrid: boolean): boolean {
    if (!a || !hasGrid || !b) return !a && !hasGrid;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
