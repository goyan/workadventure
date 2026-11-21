import { gunzipSync, gzipSync } from "node:zlib";
import {
    burnableTreesOf,
    DEFAULT_MEADOW_SETTINGS,
    FIREBALL_EMBER_PATCH_TILES,
    fireballEmbers,
    landWallsOf,
    lifeFireOf,
    Meadow,
    MEADOW_STEP_SECONDS,
    isDaylightAt,
    pavedTilesOf,
    liquidRainRate,
    DEFAULT_WATER_SETTINGS,
    DOWNPOUR_PX_PER_SECOND,
    DOWNPOUR_REPORT_MS,
    FIRE_THAW_MM_PER_SECOND,
    PX_PER_MM,
    snowRainRate,
    snowShareOf,
    soilFrostOf,
    rainRateAt,
    seasonAt,
    TERRAIN_CELL,
    TILE_PX,
    TreeFire,
    WeatherType,
    REAL_WEATHER_SLOT_MS,
} from "@workadventure/map-editor";
import type {
    Downpour,
    Ember,
    LifeFire,
    MeadowStepInput,
    PrecipitationAir,
    SnowWeather,
    TerrainData,
    ToldTree,
    WaterGrid,
    MapPlace,
    RealWeatherSlot,
} from "@workadventure/map-editor";
import type { MeadowMessage, TreeFireMessage } from "@workadventure/messages";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

const CELLS_A_TILE = TILE_PX / TERRAIN_CELL;
/** The room is told the meadow every fifth step (ten seconds), when it changed. */
const STEPS_PER_MESSAGE = 5;
/** The meadow is saved every minute while it changes. */
const STEPS_PER_SAVE = 30;
/** A room left empty lives the time it missed by steps this long (s), this many at each step of now, a week at most. */
const CATCH_UP_STEP_SECONDS = 120;
const CATCH_UP_STEPS_A_TICK = 150;
const CATCH_UP_MAX_MS = 7 * 24 * 3600 * 1000;
/** How long the weather of the past is waited for before the meadow catches up without it (ms). */
const HISTORY_WAIT_MS = 10_000;
/** No luck while the time missed is lived again: no fire starts nor spreads by itself then. */
const NO_LUCK = (): number => 1;

/** What a quarter hour of the past weather does to the meadow: its air, the air over its snow, its fire. */
export interface ReplayedWeather {
    air: PrecipitationAir | undefined;
    snow: SnowWeather | undefined;
    fire: { danger: number; windFrom: number; windSpeed: number };
}
/** No meadow on a map larger than this, in tiles: it would be read at every step. */
const MAX_MEADOW_TILES = 1_000_000;
/** A tree on fire melts the snow this many tiles around its foot. */
const TREE_THAW_TILES = 2;
/** Each patch of fire a player sets melts this much of the snow under it, in mm of water. */
const FIRE_PATCH_THAW_MM = 60;

/**
 * Keeps the meadow of a room (Meadow): the moisture of its soil and its grass, tile by tile over the whole map,
 * stepped every two seconds with the rain of the map, the water lying on its ground, the hour and the season at its
 * place. The server alone computes it, so that every player sees the same meadow; the room is told every ten seconds
 * when it changed. The meadow is saved, so it survives a restart.
 *
 * Nothing runs until the size of the map is read. A meadow where nothing changes any more (a dry map, no rain) costs
 * one pass over its tiles every two seconds.
 */
export class MeadowManager {
    private meadow: Meadow | undefined;
    /** The fire of the trees of the map, on the meadow of the moment (it is made again when the map changes). */
    private readonly trees = new TreeFire([], {
        fireAt: (tileX, tileY) => this.meadow?.fireAt(tileX, tileY) ?? 0,
        drynessAt: (tileX, tileY) => this.meadow?.drynessAt(tileX, tileY) ?? 0,
        growsAt: (tileX, tileY) => this.meadow?.growsAt(tileX, tileY) ?? false,
        soakedAt: (tileX, tileY) => this.meadow?.soakedAt(tileX, tileY) ?? false,
        ignite: (tileX, tileY, radius) => this.meadow?.ignite(tileX, tileY, radius) ?? 0,
    });
    private treesSignature: string | undefined;
    /** The trees saved before a restart, until the trees of the map are read. */
    private savedTrees: unknown;
    private readTerrain: TerrainData | undefined | null = null;
    private readSignature: string | undefined;
    /** The state saved before a restart, until the first meadow takes it. */
    private saved:
        | {
              width: number;
              height: number;
              grass: Uint8Array;
              moisture: Uint8Array;
              dryness?: Uint8Array;
              ash?: Uint8Array;
              snow?: Uint8Array;
              ice?: Uint8Array;
          }
        | undefined;
    private timer: ReturnType<typeof setInterval> | undefined;
    private steps = 0;
    private rainRate = 0;
    /** How frozen the soil is now, from the same air as the rain (see soilFrost). */
    private frost = 0;
    /** The air the rain of the map falls through: the conditions of the room, once it gives them. */
    private air: () => PrecipitationAir | undefined = () => undefined;
    /** The part of the rain of the map that falls as snow now, in mm of water an hour. */
    private snowRate = 0;
    /** The air over the snow lying on the ground (temperature, humidity, wind): unknown until the room gives it. */
    private snowWeather: () => SnowWeather | undefined = () => undefined;
    /** Where the water of a melted snow goes: the mm poured on a tile are returned. Nowhere until the room says. */
    private pour: (tileX: number, tileY: number, mm: number) => number = () => 0;
    /** Whether snow fell or melted since the room was last told: it is told at the next step. */
    private snowMoved = false;
    private sentSnow: Uint8Array | undefined;
    private sentIce: Uint8Array | undefined;
    private sentGrass: Uint8Array | undefined;
    private sentMoisture: Uint8Array | undefined;
    private sentDryness: Uint8Array | undefined;
    private sentFire: Uint8Array | undefined;
    private sentAsh: Uint8Array | undefined;
    /** Whether a fire burnt at the last step: the room is told once more when it is out. */
    private wasBurning = false;
    private changedSinceSave = false;
    /** Whether the meadow was wiped because the map turned it off. */
    private cleared = false;
    /** When the saved meadow was last true (ms): the room was empty since, and the meadow lives that time again. */
    private savedAt: number | undefined;
    /** The time missed while the room was empty, lived again a slice at each step (stepCatchUp). */
    private catchUp:
        | { at: number; to: number; history: readonly RealWeatherSlot[] | undefined; askedAt: number | undefined }
        | undefined;
    /** The time being lived again and its weather, while the meadow catches up; undefined: the time of now. */
    private along: ((seconds: number, rainMmPerHour: number, last: boolean) => void) | undefined;
    private replay:
        | { now: number; slots: readonly RealWeatherSlot[] | undefined; weather: ReplayedWeather | undefined }
        | undefined;
    /** The weather of the past at the place of the map (the real weather), and what a quarter hour of it does here. */
    private history: (place: MapPlace | undefined, since: number) => Promise<RealWeatherSlot[] | undefined> = () =>
        Promise.resolve(undefined);
    private weatherOfSlot: (slot: RealWeatherSlot) => ReplayedWeather | undefined = () => undefined;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly rain: Pick<RainTimelineService, "slotsFor">,
        /** The water of the relief: the soil under it is soaked, and its grass drowns. */
        private readonly water: () => Pick<WaterGrid, "depthAt"> | undefined,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        /** The size of the map in cells of the relief, once read. */
        private readonly mapSize: () => { width: number; height: number } | undefined = () => undefined,
        /** Where the animals that graze are, in map pixels (the antelopes of the life of the land): they eat the grass under them. */
        private readonly grazers: () => readonly { x: number; y: number }[] = () => [],
        /**
         * The conditions of the room for its fire: how ready the grass is to burn (0 to 1), which dries it, and the
         * wind that pushes the flames.
         */
        private readonly fireWeather: () => { danger: number; windFrom: number; windSpeed: number } = () => ({
            danger: 0,
            windFrom: 0,
            windSpeed: 0,
        }),
        /** The luck of the fire: whether it spreads, whether one starts by itself. */
        private readonly random: () => number = Math.random,
    ) {}

    /** Brings back the meadow saved before a restart. A store that does not answer must not keep the room closed. */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.grass || !fields.moisture || !fields.size) return;
            const [width, height] = fields.size.split("x").map(Number);
            if (!Number.isInteger(width) || !Number.isInteger(height)) return;
            this.saved = {
                width,
                height,
                grass: new Uint8Array(gunzipSync(Buffer.from(fields.grass, "base64"))),
                moisture: new Uint8Array(gunzipSync(Buffer.from(fields.moisture, "base64"))),
                // Absent from a meadow saved before its grass could dry.
                ...(fields.dryness
                    ? { dryness: new Uint8Array(gunzipSync(Buffer.from(fields.dryness, "base64"))) }
                    : {}),
                // Absent from a meadow saved before it could burn.
                ...(fields.ash ? { ash: new Uint8Array(gunzipSync(Buffer.from(fields.ash, "base64"))) } : {}),
                // Absent from a meadow saved before the snow could lie on it, or without any.
                ...(fields.snow ? { snow: new Uint8Array(gunzipSync(Buffer.from(fields.snow, "base64"))) } : {}),
                // Absent from a meadow saved before its water could freeze.
                ...(fields.ice ? { ice: new Uint8Array(gunzipSync(Buffer.from(fields.ice, "base64"))) } : {}),
            };
            // Absent from a meadow saved before it knew when: it does not catch up.
            const at = Number(fields.at);
            this.savedAt = Number.isFinite(at) && at > 0 ? at : undefined;
            // Absent from a meadow saved before its trees could burn.
            if (fields.trees) {
                this.savedTrees = JSON.parse(gunzipSync(Buffer.from(fields.trees, "base64")).toString("utf8"));
            }
        } catch (error) {
            console.error("Could not restore the meadow of the map", error);
        }
    }

    public start(): void {
        this.mapChanged();
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        // Saved with its time even unchanged: the next room catches up from now on.
        this.changedSinceSave = true;
        this.save();
    }

    /** The map of the room changed (or its size was just read): the meadow follows its relief, soils and walls. */
    public mapChanged(): void {
        const wam = this.room.getWam();
        const cells = this.mapSize();
        const width = cells ? Math.floor(cells.width / CELLS_A_TILE) : 0;
        const height = cells ? Math.floor(cells.height / CELLS_A_TILE) : 0;
        if (width <= 0 || height <= 0 || width * height > MAX_MEADOW_TILES) {
            this.meadow = undefined;
            if (this.timer) clearInterval(this.timer);
            this.timer = undefined;
            return;
        }
        const walls = landWallsOf(wam);
        const paved = pavedTilesOf(wam);
        // The pools freeze by their style (their depth, their hot water): a style changed makes the meadow again.
        const pools = wam?.settings?.pools;
        const poolsSignature = (pools ?? []).map((style) => `${style.depthPx}${style.hot ? "h" : ""}`).join(",");
        const signature = `${width}x${height}|${walls.signature}|${[...paved].sort().join(";")}|${poolsSignature}`;
        if (this.meadow && this.readTerrain === wam?.terrain && this.readSignature === signature) {
            // The ground is the same; a tree may have been planted, moved or removed.
            this.readTrees();
            return;
        }
        this.readTerrain = wam?.terrain;
        this.readSignature = signature;
        const before = this.meadow;
        this.meadow = new Meadow({ width, height }, wam?.terrain, walls, paved, pools);
        if (before) this.meadow.takeFrom(before);
        else if (this.saved && this.saved.width === width && this.saved.height === height) {
            this.meadow.read(
                this.saved.grass,
                this.saved.moisture,
                this.saved.dryness,
                this.saved.ash,
                this.saved.snow,
                this.saved.ice,
            );
            // Saved a while ago: the room was empty since, the meadow lives that time again (a week at most).
            const now = this.now();
            if (this.savedAt !== undefined && now - this.savedAt > CATCH_UP_STEP_SECONDS * 1000) {
                const from = Math.max(this.savedAt, now - CATCH_UP_MAX_MS);
                this.catchUp = { at: from, to: now, history: undefined, askedAt: undefined };
            }
        }
        this.saved = undefined;
        this.readTrees();
        if (!this.timer) {
            this.timer = setInterval(() => this.tick(), MEADOW_STEP_SECONDS * 1000);
            // The meadow of a room must never keep the process alive.
            this.timer.unref?.();
        }
    }

    /** The trees of the map as it is now: each keeps its state by its id; the state saved before a restart is taken once. */
    private readTrees(): void {
        const trees = burnableTreesOf(this.room.getWam());
        const signature = trees.map((tree) => `${tree.id}@${tree.x},${tree.y}`).join(";");
        if (signature !== this.treesSignature) {
            this.treesSignature = signature;
            this.trees.setTrees(trees);
        }
        if (this.savedTrees !== undefined) {
            this.trees.read(this.savedTrees);
            this.savedTrees = undefined;
        }
    }

    /** A step from the timer. An error there would take the whole server down: the meadow of this room stops instead. */
    private tick(): void {
        try {
            this.step();
        } catch (error) {
            console.error("The meadow of the map stopped on an error", error);
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

    /** The air over the snow of the map (the conditions of the room): it melts by its heat, its wind and its humidity. */
    public snowUnder(weather: () => SnowWeather | undefined): void {
        this.snowWeather = weather;
    }

    /** Where the water of the snow that melts is poured: the water of the relief of the room. */
    public pourWith(pour: (tileX: number, tileY: number, mm: number) => number): void {
        this.pour = pour;
    }

    /**
     * How a room left empty catches up: the weather of the past at the place of its map (real weather), and what the
     * conditions of a quarter hour of it are for the meadow (its air, its snow, its fire). Without them it lives the
     * time it missed with the conditions of now.
     */
    public catchUpWith(
        history: (place: MapPlace | undefined, since: number) => Promise<RealWeatherSlot[] | undefined>,
        weatherOfSlot: (slot: RealWeatherSlot) => ReplayedWeather | undefined,
    ): void {
        this.history = history;
        this.weatherOfSlot = weatherOfSlot;
    }

    /** What lives the time the room missed along with the meadow (the water of the relief), a slice at a time. */
    public liveAlong(live: (seconds: number, rainMmPerHour: number, last: boolean) => void): void {
        this.along = live;
    }

    /** Whether the meadow is still living the time it missed. */
    public catchingUp(): boolean {
        return this.catchUp !== undefined;
    }

    /** The time of the meadow: the time being lived again while it catches up, else the clock of the room. */
    private clock(): number {
        return this.replay?.now ?? this.now();
    }

    private airNow(): PrecipitationAir | undefined {
        return this.replay?.weather ? this.replay.weather.air : this.air();
    }

    private fireNow(): { danger: number; windFrom: number; windSpeed: number } {
        return this.replay?.weather ? this.replay.weather.fire : this.fireWeather();
    }

    /**
     * A slice of the time missed while the room was empty, lived again at CATCH_UP_STEP_SECONDS a step: true while it
     * goes on (the step of now waits). The weather of the past is asked first, waited for a while at most.
     */
    private stepCatchUp(): boolean {
        const catchUp = this.catchUp;
        const meadow = this.meadow;
        if (!catchUp || !meadow) return false;
        const settings = this.room.getWam()?.settings;
        const real = settings?.weather === WeatherType.Real;
        if (real && catchUp.history === undefined) {
            if (catchUp.askedAt === undefined) {
                catchUp.askedAt = this.now();
                this.history(settings?.weatherLocation, catchUp.at)
                    .then((slots) => {
                        catchUp.history = slots ?? [];
                    })
                    .catch(() => {
                        catchUp.history = [];
                    });
                return true;
            }
            if (this.now() - catchUp.askedAt < HISTORY_WAIT_MS) return true;
            catchUp.history = [];
        }
        const slots = catchUp.history && catchUp.history.length > 0 ? catchUp.history : undefined;
        try {
            for (let step = 0; step < CATCH_UP_STEPS_A_TICK && catchUp.at < catchUp.to; step++) {
                const at = catchUp.at;
                const slot = slots?.find((candidate) => candidate.at <= at && at < candidate.at + REAL_WEATHER_SLOT_MS);
                this.replay = { now: catchUp.at, slots, weather: slot ? this.weatherOfSlot(slot) : undefined };
                const seconds = Math.min(CATCH_UP_STEP_SECONDS, (catchUp.to - catchUp.at) / 1000);
                this.advance(seconds);
                catchUp.at += seconds * 1000;
                try {
                    this.along?.(seconds, this.rainRate, catchUp.at >= catchUp.to);
                } catch (error) {
                    console.error("What lives the missed time along with the meadow failed", error);
                }
            }
        } finally {
            this.replay = undefined;
        }
        // Seen living its missed time quickly: the room is told after each slice.
        this.changedSinceSave = true;
        this.tell(meadow);
        if (catchUp.at >= catchUp.to) {
            this.catchUp = undefined;
            this.save();
            return false;
        }
        return true;
    }

    /**
     * What a step reads of the snow: the air over it, and the snow of the map falling on every tile, at the pace the
     * water of the map comes (its speed), so that a snow weighs what the same rain would have.
     */
    private snowInput(seconds: number): Pick<MeadowStepInput, "weather" | "snowfallMm"> {
        const speed = this.room.getWam()?.settings?.water?.speed ?? DEFAULT_WATER_SETTINGS.speed;
        const hours = (seconds * (Number.isFinite(speed) && speed > 0 ? speed : 1)) / 3600;
        return {
            weather: this.replay?.weather ? this.replay.weather.snow : this.snowWeather(),
            snowfallMm: this.snowRate * hours,
        };
    }

    /** The water of the snow that melted at a step runs to the water of the relief; what it cannot take wets the soil. */
    private pourMelted(meadow: Meadow, meltedMm: Float32Array | undefined): void {
        if (!meltedMm) return;
        for (let index = 0; index < meltedMm.length; index++) {
            const mm = meltedMm[index];
            if (mm <= 0) continue;
            const tileX = index % meadow.width;
            const tileY = (index - tileX) / meadow.width;
            if (this.pour(tileX, tileY, mm) < mm) meadow.soak(tileX, tileY, 0);
        }
        this.snowMoved = true;
    }

    /** One step of the meadow (every two seconds); every ten seconds the room is told when it changed. */
    public step(): void {
        if (!this.meadow) return;
        // A room that was left empty first lives through the time it missed (catchUp), a slice at each step.
        if (this.stepCatchUp()) return;
        this.advance(MEADOW_STEP_SECONDS);
    }

    /**
     * The meadow moved on by `seconds`: at the time of the clock of the room, or at the time being replayed while it
     * catches up (then with the weather of that time, no luck, no grazing, and nothing told nor saved at each step).
     */
    private advance(seconds: number): void {
        const meadow = this.meadow;
        if (!meadow) return;
        const replaying = this.replay !== undefined;
        const settings = this.room.getWam()?.settings;
        const date = new Date(this.clock());
        if (replaying || this.steps % STEPS_PER_MESSAGE === 0) {
            const slots = this.replay
                ? this.replay.slots
                : settings?.weather === WeatherType.Real
                  ? this.rain.slotsFor(settings.weatherLocation)
                  : undefined;
            // What falls as snow lies where it fell: only the rain runs to the hollows and soaks the soil.
            const falling = rainRateAt(settings, this.clock(), slots);
            this.rainRate = liquidRainRate(falling, this.airNow());
            // ...and the snow lies on the ground, until it melts.
            this.snowRate = snowRainRate(falling, this.airNow());
            // ...and in the same cold the soil freezes: its water stays, its grass lies dormant.
            this.frost = soilFrostOf(this.airNow());
        }
        this.steps++;
        const set = { ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow };
        const grid = this.water();
        const waterAt: MeadowStepInput["waterAt"] = grid
            ? (tileX, tileY) => {
                  let deepest = 0;
                  for (let y = 0; y < CELLS_A_TILE; y++) {
                      for (let x = 0; x < CELLS_A_TILE; x++) {
                          const depth = grid.depthAt(tileX * CELLS_A_TILE + x, tileY * CELLS_A_TILE + y);
                          if (depth > deepest) deepest = depth;
                      }
                  }
                  return deepest;
              }
            : () => 0;
        const snow = this.snowInput(seconds);
        if (snow.snowfallMm) this.snowMoved = true;
        // The trees on fire melt the snow around their foot.
        if (meadow.snowy() || meadow.icy()) {
            for (const tree of this.trees.fires()) {
                meadow.warm(
                    Math.floor(tree.x / TILE_PX),
                    Math.floor(tree.y / TILE_PX),
                    TREE_THAW_TILES,
                    FIRE_THAW_MM_PER_SECOND * tree.fire * seconds,
                );
            }
        }
        if (!set.enabled) {
            // A map that turned its meadow off: bare at once, told once, and nothing more is stepped.
            if (!this.cleared) {
                this.cleared = true;
                meadow.clear();
                this.tellTrees(this.trees.clear(), []);
                this.tell(meadow);
                this.save();
            }
            // The snow and the ice are not of the meadow: the snow goes on falling and melting, the water freezing.
            const freezing = snow.weather !== undefined && snow.weather.temperature < 0;
            if (meadow.snowy() || meadow.icy() || snow.snowfallMm || freezing) {
                const thawed = meadow.stepSnowAlone({
                    seconds: seconds,
                    rainMmPerHour: this.rainRate,
                    daylight: false,
                    season: seasonAt(date, settings?.weatherLocation),
                    waterAt,
                    ...snow,
                });
                this.pourMelted(meadow, thawed?.meltedMm);
                if (meadow.iceMoved()) this.snowMoved = true;
            }
            if (!replaying && (this.steps % STEPS_PER_MESSAGE === 0 || this.snowMoved)) this.tell(meadow);
            if (!replaying && this.steps % STEPS_PER_SAVE === 0) this.save();
            return;
        }
        this.cleared = false;
        const weather = this.fireNow();
        const thawed = meadow.step({
            seconds: seconds,
            rainMmPerHour: this.rainRate,
            // Day from sunrise to sunset at the place of the map, as the game draws its day and night.
            daylight: isDaylightAt(date, settings?.weatherLocation),
            season: seasonAt(date, settings?.weatherLocation),
            growSeconds: set.growMinutes * 60,
            thirstSeconds: set.thirstMinutes * 60,
            moistureHold: set.moistureHold,
            fireDanger: weather.danger,
            windFrom: weather.windFrom,
            windSpeed: weather.windSpeed,
            random: replaying ? NO_LUCK : this.random,
            soilFrost: this.frost,
            waterAt,
            ...snow,
        });
        this.pourMelted(meadow, thawed?.meltedMm);
        // An ice that thickens or thaws is seen moving, as a snow is.
        if (meadow.iceMoved()) this.snowMoved = true;
        if (!replaying) for (const grazer of this.grazers()) meadow.graze(grazer.x, grazer.y, seconds);
        // The trees after the ground they stand on: what they set on fire is told with this step.
        const trees = this.trees.step({
            seconds: seconds,
            rainMmPerHour: this.rainRate,
            windFrom: weather.windFrom,
            windSpeed: weather.windSpeed,
            growSeconds: set.growMinutes * 60,
            groundBurning: meadow.burning() > 0,
            random: replaying ? NO_LUCK : this.random,
        });
        if (!replaying) this.tellTrees(trees.changed, trees.embers);
        // A fire is seen running: the room is told at every step while one burns, and once more when it is out.
        const burning = meadow.burning() > 0 || this.trees.burning() > 0;
        // So is a snow falling or melting.
        if (!replaying && (this.steps % STEPS_PER_MESSAGE === 0 || burning || this.wasBurning || this.snowMoved)) {
            this.tell(meadow);
        }
        this.wasBurning = burning;
        if (!replaying && this.steps % STEPS_PER_SAVE === 0) this.save();
    }

    /**
     * A patch of fire a player sets around a point of the map (pixels), `radiusTiles` wide: the grass that can burn
     * there takes fire. Returns how many tiles did; the room sees it at the next step.
     */
    public ignite(x: number, y: number, radiusTiles: number): number {
        const settings = this.room.getWam()?.settings;
        if (!this.meadow) return 0;
        // The fire melts the snow under it first: what it bares can burn at the next patch.
        this.meadow.warm(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX), radiusTiles, FIRE_PATCH_THAW_MM);
        if (!{ ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow }.enabled) return 0;
        // The trees whose foot is in the patch take with the grass under them.
        const lit =
            this.meadow.ignite(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX), radiusTiles) +
            this.trees.ignite(x, y, Math.max(0, radiusTiles) * TILE_PX);
        if (lit > 0) this.wasBurning = true;
        return lit;
    }

    /**
     * A fireball lands at a point of the map (pixels), its crater `radiusTiles` wide: the ground of the crater is
     * dried and takes fire whatever it was, its trees with it, and embers light what can burn where they land around.
     * `id` is the one the room was told: the embers of a fireball are always the same. Returns how much took fire.
     */
    public scorch(x: number, y: number, radiusTiles: number, id: number): number {
        const settings = this.room.getWam()?.settings;
        if (!this.meadow) return 0;
        const tileX = Math.floor(x / TILE_PX);
        const tileY = Math.floor(y / TILE_PX);
        // The snow and the ice of the crater are gone in steam, as the water the fireball fell into.
        this.meadow.melt(tileX, tileY, radiusTiles);
        this.snowMoved = true;
        if (!{ ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow }.enabled) return 0;
        // The ground first: a tree takes only where its foot is not wet.
        let lit =
            this.meadow.scorch(tileX, tileY, radiusTiles) + this.trees.ignite(x, y, Math.max(0, radiusTiles) * TILE_PX);
        for (const { dx, dy } of fireballEmbers(id, radiusTiles)) {
            lit +=
                this.meadow.ignite(Math.floor(tileX + dx), Math.floor(tileY + dy), FIREBALL_EMBER_PATCH_TILES) +
                this.trees.ignite(x + dx * TILE_PX, y + dy * TILE_PX, FIREBALL_EMBER_PATCH_TILES * TILE_PX);
        }
        if (lit > 0) this.wasBurning = true;
        return lit;
    }

    /** A comet lands at a point of the map (pixels), its crater `radiusTiles` wide: it breaks the ice there. */
    public shatter(x: number, y: number, radiusTiles: number): void {
        if (!this.meadow) return;
        const tileX = Math.floor(x / TILE_PX);
        const tileY = Math.floor(y / TILE_PX);
        if (this.meadow.breakIce(tileX, tileY, Math.max(0, radiusTiles)) > 0) this.snowMoved = true;
    }

    /**
     * A downpour, told at each message of its player: it soaks the soil under it at once, and in the cold of the room
     * the part of it that falls as snow lies on the ground instead (what it would have brought as water between two
     * messages). The room sees it at the next step of the meadow.
     */
    public soak(downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap">): void {
        const meadow = this.meadow;
        if (!meadow) return;
        const tileX = Math.floor(downpour.x / TILE_PX);
        const tileY = Math.floor(downpour.y / TILE_PX);
        const radius = downpour.wholeMap ? undefined : downpour.radiusTiles;
        const share = snowShareOf(this.air());
        if (share > 0) {
            const mm = ((DOWNPOUR_PX_PER_SECOND * DOWNPOUR_REPORT_MS) / 1000 / PX_PER_MM) * share;
            if (meadow.snowOn(tileX, tileY, radius, mm) > 0) this.snowMoved = true;
        }
        const settings = this.room.getWam()?.settings;
        if (share >= 1 || !{ ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow }.enabled) return;
        meadow.soak(tileX, tileY, radius);
    }

    /** The whole state the room was last told, for a player who joins it. Undefined where nothing ever grew. */
    public snapshot(): MeadowMessage | undefined {
        const meadow = this.meadow;
        if (!meadow) return undefined;
        // A room just made has told nothing yet (its first step comes later): its first player gets the meadow as it
        // is, not a bare ground until the next step. A bare and dry map is still not worth a message.
        const told = this.sentGrass !== undefined;
        const grass = this.sentGrass ?? meadow.writeGrass();
        const moisture = this.sentMoisture ?? meadow.writeMoisture();
        const snow = this.sentSnow ?? meadow.writeSnow();
        const ice = this.sentIce ?? meadow.writeIce();
        if (!told && [grass, moisture, snow, ice].every((field) => field.every((value) => value === 0))) {
            return undefined;
        }
        return {
            width: meadow.width,
            height: meadow.height,
            grass: gzipSync(grass),
            moisture: gzipSync(moisture),
            dryness: gzipSync(this.sentDryness ?? meadow.writeDryness()),
            fire: gzipSync(this.sentFire ?? meadow.writeFire()),
            ash: gzipSync(this.sentAsh ?? meadow.writeAsh()),
            snow: snowField(snow),
            ice: snowField(ice),
        };
    }

    /** Every tree that burns or is charred, for a player who joins the room. Undefined when every tree is green. */
    public treeSnapshot(): TreeFireMessage | undefined {
        const trees = this.trees.damaged();
        return trees.length > 0 ? { trees, whole: true, embers: [] } : undefined;
    }

    /** The trees on fire (map pixels): what the animals of the map run from. */
    public treeFires(): { x: number; y: number; fire: number }[] {
        return this.trees.fires();
    }

    /**
     * The fire of the map as its animals see it (the grass and the trees that burn), for the life of the room: they
     * run from it. Undefined while nothing burns, so that nothing is looked at.
     */
    public lifeFire(): LifeFire | undefined {
        const trees = this.trees.fires();
        if (trees.length === 0 && (this.meadow?.burning() ?? 0) === 0) return undefined;
        const meadow = this.meadow;
        return lifeFireOf({ fireAt: (tileX, tileY) => meadow?.fireAt(tileX, tileY) ?? 0 }, () => trees);
    }

    /** Tells the room the trees whose state changed and the embers that left, when there is anything to tell. */
    private tellTrees(changed: readonly ToldTree[], embers: readonly Ember[]): void {
        if (changed.length === 0 && embers.length === 0) return;
        if (changed.length > 0) this.changedSinceSave = true;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "treeFireMessage",
                treeFireMessage: {
                    trees: changed.map((tree) => ({ id: tree.id, fire: tree.fire, damage: tree.damage })),
                    whole: false,
                    embers: embers.map((ember) => ({
                        fromX: Math.round(ember.fromX),
                        fromY: Math.round(ember.fromY),
                        toX: Math.round(ember.toX),
                        toY: Math.round(ember.toY),
                        flightMs: Math.round(ember.flightSeconds * 1000),
                    })),
                },
            },
        });
    }

    private tell(meadow: Meadow): void {
        const grass = meadow.writeGrass();
        const moisture = meadow.writeMoisture();
        const dryness = meadow.writeDryness();
        const fire = meadow.writeFire();
        const ash = meadow.writeAsh();
        const snow = meadow.writeSnow();
        const ice = meadow.writeIce();
        this.snowMoved = false;
        const same = (a: Uint8Array, b: Uint8Array | undefined): boolean =>
            b !== undefined && a.length === b.length && a.every((value, index) => value === b[index]);
        // A bare and dry map the room was never told about: nothing to say.
        if (
            !this.sentGrass &&
            grass.every((value) => value === 0) &&
            moisture.every((value) => value === 0) &&
            snow.every((value) => value === 0) &&
            ice.every((value) => value === 0)
        ) {
            return;
        }
        if (
            same(grass, this.sentGrass) &&
            same(moisture, this.sentMoisture) &&
            same(dryness, this.sentDryness) &&
            same(fire, this.sentFire) &&
            same(ash, this.sentAsh) &&
            same(snow, this.sentSnow) &&
            same(ice, this.sentIce)
        ) {
            return;
        }
        this.sentGrass = grass;
        this.sentMoisture = moisture;
        this.sentDryness = dryness;
        this.sentFire = fire;
        this.sentAsh = ash;
        this.sentSnow = snow;
        this.sentIce = ice;
        this.changedSinceSave = true;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "meadowMessage",
                meadowMessage: {
                    width: meadow.width,
                    height: meadow.height,
                    grass: gzipSync(grass),
                    moisture: gzipSync(moisture),
                    dryness: gzipSync(dryness),
                    fire: gzipSync(fire),
                    ash: gzipSync(ash),
                    snow: snowField(snow),
                    ice: snowField(ice),
                },
            },
        });
    }

    private save(): void {
        if (!this.store || !this.meadow || !this.changedSinceSave) return;
        this.changedSinceSave = false;
        const fields: [string, string][] = [
            ["grass", Buffer.from(gzipSync(this.meadow.writeGrass())).toString("base64")],
            ["moisture", Buffer.from(gzipSync(this.meadow.writeMoisture())).toString("base64")],
            ["dryness", Buffer.from(gzipSync(this.meadow.writeDryness())).toString("base64")],
            ["ash", Buffer.from(gzipSync(this.meadow.writeAsh())).toString("base64")],
            ["snow", Buffer.from(gzipSync(this.meadow.writeSnow())).toString("base64")],
            ["ice", Buffer.from(gzipSync(this.meadow.writeIce())).toString("base64")],
            ["trees", Buffer.from(gzipSync(JSON.stringify(this.trees.write()))).toString("base64")],
            ["size", `${this.meadow.width}x${this.meadow.height}`],
            // When it is true: the time reached while it catches up, else now.
            ["at", String(this.catchUp ? this.catchUp.at : this.now())],
        ];
        for (const [field, value] of fields) {
            this.store.repository
                .saveVariable(this.hashKey(), field, value)
                .catch((error) => console.error("Could not save the meadow of the map", error));
        }
    }

    private hashKey(): string {
        return `meadow:${this.store?.roomUrl ?? ""}`;
    }
}

/** The snow or the ice of the meadow as the room is told it: nothing at all where none lies. */
function snowField(snow: Uint8Array): Uint8Array {
    return snow.some((value) => value > 0) ? gzipSync(snow) : new Uint8Array(0);
}
