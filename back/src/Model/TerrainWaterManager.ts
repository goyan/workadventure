import { gunzipSync, gzipSync } from "node:zlib";
import {
    advanceImpactWave,
    strikeWater,
    CELL_AREA_M2,
    CELL_LITRES_PER_PX,
    DEFAULT_WATER_SETTINGS,
    DOWNPOUR_PX_PER_SECOND,
    DRAIN_PX_PER_SECOND,
    DRAIN_RIM_PX_PER_SECOND,
    gridBoundsOf,
    landWallsOf,
    LITRES_PER_M3,
    meteorShape,
    liquidRainRate,
    PX_PER_MM,
    snowShareOf,
    rainRateAt,
    startImpactWave,
    ratesOf,
    stepInputOf,
    stepsBetweenUpdates,
    TERRAIN_CELL,
    TILE_PX,
    WATER_MESSAGE_MS,
    WATER_STEP_MS,
    WaterGrid,
    waterObjectsOf,
    waterWallsOf,
    WeatherType,
} from "@workadventure/map-editor";
import type {
    Downpour,
    PrecipitationAir,
    Drain,
    ImpactWave,
    TerrainData,
    WaterGridBounds,
    WaterObject,
    WaterTally,
} from "@workadventure/map-editor";
import type { TerrainWaterMessage } from "@workadventure/messages";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

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
/** The water is saved every half minute while it changes. */
const STEPS_PER_SAVE = 300;

const SavedBounds = z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(0).max(4096),
    height: z.number().int().min(0).max(4096),
});

type Sums = Omit<WaterTally, "moved">;
const noSums = (): Sums => ({ rainPx: 0, sourcesPx: 0, sinksPx: 0, evaporationPx: 0, absorptionPx: 0, lostPx: 0 });

/**
 * Keeps the water of the relief of a room: a depth of water for each cell of a grid (WaterGrid), stepped ten times a
 * second with the rain of the map, its dry weather, its sources and its sinks. The server alone computes it, so that
 * every player sees the same water; the room is told once a second what changed, and what came in and went out
 * (the dashboard of the relief tool). The water is saved, so it survives a restart.
 *
 * A room without relief nor water object costs nothing: no timer, nothing read. Water at rest with nothing coming in
 * is not stepped. GameRoom tells when the map changed (mapChanged): the water stays where it was.
 */
export class TerrainWaterManager {
    private grid: WaterGrid | undefined;
    private objects: WaterObject[] = [];
    private readTerrain: TerrainData | undefined | null = null;
    /** The walls the grid was built with (their signature): a wall built or removed makes a new grid. */
    private readWalls: string | undefined;
    /** The water saved before a restart, until the first grid takes it. */
    private saved: WaterGrid | undefined;
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
    /** The drains open on the map now, asked at each step: none until the catastrophes of the room say. */
    private drains: () => readonly Drain[] = () => [];
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
    private changedSinceSave = false;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly rain: Pick<RainTimelineService, "slotsFor">,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        /** The size of the map in cells of the relief, once read: the water stays inside the map. */
        private readonly mapSize: () => { width: number; height: number } | undefined = () => undefined,
    ) {}

    /**
     * Brings back the water saved before a restart. A store that does not answer, or water that cannot be read, must
     * not keep the room closed: the map is then dry.
     */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.grid || !fields.bounds) return;
            const bounds = SavedBounds.parse(JSON.parse(fields.bounds));
            const grid = new WaterGrid(undefined, bounds);
            if (grid.readDepths(new Uint8Array(gunzipSync(Buffer.from(fields.grid, "base64"))))) this.saved = grid;
        } catch (error) {
            console.error("Could not restore the water of the relief of the map", error);
        }
    }

    public start(): void {
        this.mapChanged();
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        this.save();
    }

    /** The map of the room changed (or was just read): the grid follows its relief and its water objects. */
    public mapChanged(): void {
        const wam = this.room.getWam();
        this.objects = waterObjectsOf(wam);
        // A map whose size could not be read keeps all its water: an empty size would dry the whole map.
        const size = this.mapSize();
        const bounds = gridBoundsOf(
            wam?.terrain,
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
            wam?.terrain === this.readTerrain &&
            wallsSignature === this.readWalls &&
            sameBounds(bounds, this.grid?.bounds ?? undefined, this.grid !== undefined);
        // A source or a sink may have come or gone: the water is looked at again.
        this.moving = true;
        if (sameGrid) return;
        this.readTerrain = wam?.terrain;
        this.readWalls = wallsSignature;
        const before = this.grid ?? this.saved;
        this.saved = undefined;
        this.grid = bounds ? new WaterGrid(wam?.terrain, bounds, undefined, walls, rooms) : undefined;
        this.version++;
        if (this.grid && before) this.grid.takeFrom(before);
        // The cells are not the same any more: the room is told the whole state at its next message.
        this.sentBytes = undefined;
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
        const settings = this.room.getWam()?.settings;
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
        // Both each step: a downpour goes on raining while the wave of a meteor runs.
        const raining = this.pourDownpours(grid);
        const draining = this.takeDrains(grid);
        const waving = this.waves.length > 0 || raining || draining || this.steps < this.stirredUntilStep;
        if (this.waves.length > 0) this.advanceWaves(grid);
        const pouring = this.rainRate > 0 || this.objects.some((object) => object.litresPerMinute > 0);
        if (this.moving || pouring) {
            const tally = grid.step(stepInputOf(settings?.water, this.rainRate, this.objects, WATER_STEP_MS / 1000));
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
        const between = stepsBetweenUpdates(settings?.water?.updates);
        if (this.steps % between === 0 || (waving && this.steps % Math.min(between, WAVE_STEPS_PER_MESSAGE) === 0)) {
            this.tell(grid);
        }
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
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
     * away, counted as lost, and no wave leaves. The room is told at once. Nothing on a map without water.
     */
    public vaporise(x: number, y: number, radiusTiles: number): void {
        const grid = this.grid;
        if (!grid) return;
        const taken = grid.takeDisc(
            Math.floor(x / TERRAIN_CELL),
            Math.floor(y / TERRAIN_CELL),
            meteorShape(radiusTiles).discCells,
        );
        if (!taken || taken.takenPx <= 0) return;
        this.sums.lostPx += taken.takenPx;
        this.moving = true;
        this.version++;
        this.changedSinceSave = true;
        this.tell(grid);
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
        return { ...this.grid.bounds, seq: this.seq, full: true, depths: gzipSync(this.sentBytes) };
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
        if (full) this.fullAtStep = this.steps;
        this.seq++;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "terrainWaterMessage",
                terrainWaterMessage: {
                    ...grid.bounds,
                    seq: this.seq,
                    full,
                    depths: gzipSync(payload),
                    stats: {
                        ...rates,
                        stock: (grid.totalPx() * CELL_LITRES_PER_PX) / LITRES_PER_M3,
                        wetArea: grid.wetCells() * CELL_AREA_M2,
                        rainRate: this.rainRate,
                    },
                },
            },
        });
    }

    private save(): void {
        if (!this.store || !this.grid || !this.changedSinceSave) return;
        this.changedSinceSave = false;
        const fields: [string, string][] = [
            ["grid", Buffer.from(gzipSync(this.grid.writeDepths())).toString("base64")],
            ["bounds", JSON.stringify(this.grid.bounds)],
        ];
        for (const [field, value] of fields) {
            this.store.repository
                .saveVariable(this.hashKey(), field, value)
                .catch((error) => console.error("Could not save the water of the relief of the map", error));
        }
    }

    private hashKey(): string {
        return `terrain-water:${this.store?.roomUrl ?? ""}`;
    }
}

function sameBounds(a: WaterGridBounds | undefined, b: WaterGridBounds | undefined, hasGrid: boolean): boolean {
    if (!a || !hasGrid || !b) return !a && !hasGrid;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
