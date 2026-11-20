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
    rainRateAt,
    seasonAt,
    TERRAIN_CELL,
    TILE_PX,
    TreeFire,
    WeatherType,
} from "@workadventure/map-editor";
import type { Downpour, Ember, LifeFire, TerrainData, ToldTree, WaterGrid } from "@workadventure/map-editor";
import type { MeadowMessage, TreeFireMessage } from "@workadventure/messages";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

const CELLS_A_TILE = TILE_PX / TERRAIN_CELL;
/** The room is told the meadow every fifth step (ten seconds), when it changed. */
const STEPS_PER_MESSAGE = 5;
/** The meadow is saved every minute while it changes. */
const STEPS_PER_SAVE = 30;
/** No meadow on a map larger than this, in tiles: it would be read at every step. */
const MAX_MEADOW_TILES = 1_000_000;

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
          }
        | undefined;
    private timer: ReturnType<typeof setInterval> | undefined;
    private steps = 0;
    private rainRate = 0;
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

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly rain: Pick<RainTimelineService, "slotsFor">,
        /** The water of the relief: the soil under it is soaked, and its grass drowns. */
        private readonly water: () => WaterGrid | undefined,
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
            };
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
        const signature = `${width}x${height}|${walls.signature}|${[...paved].sort().join(";")}`;
        if (this.meadow && this.readTerrain === wam?.terrain && this.readSignature === signature) {
            // The ground is the same; a tree may have been planted, moved or removed.
            this.readTrees();
            return;
        }
        this.readTerrain = wam?.terrain;
        this.readSignature = signature;
        const before = this.meadow;
        this.meadow = new Meadow({ width, height }, wam?.terrain, walls, paved);
        if (before) this.meadow.takeFrom(before);
        else if (this.saved && this.saved.width === width && this.saved.height === height) {
            this.meadow.read(this.saved.grass, this.saved.moisture, this.saved.dryness, this.saved.ash);
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

    /** One step of the meadow (every two seconds); every ten seconds the room is told when it changed. */
    public step(): void {
        const meadow = this.meadow;
        if (!meadow) return;
        const settings = this.room.getWam()?.settings;
        const date = new Date(this.now());
        if (this.steps % STEPS_PER_MESSAGE === 0) {
            const slots =
                settings?.weather === WeatherType.Real ? this.rain.slotsFor(settings.weatherLocation) : undefined;
            this.rainRate = rainRateAt(settings, this.now(), slots);
        }
        this.steps++;
        const set = { ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow };
        if (!set.enabled) {
            // A map that turned its meadow off: bare at once, told once, and nothing more is stepped.
            if (!this.cleared) {
                this.cleared = true;
                meadow.clear();
                this.tellTrees(this.trees.clear(), []);
                this.tell(meadow);
                this.save();
            }
            return;
        }
        this.cleared = false;
        const grid = this.water();
        const weather = this.fireWeather();
        meadow.step({
            seconds: MEADOW_STEP_SECONDS,
            rainMmPerHour: this.rainRate,
            // Day from sunrise to sunset at the place of the map, as the game draws its day and night.
            daylight: isDaylightAt(date, settings?.weatherLocation),
            season: seasonAt(date),
            growSeconds: set.growMinutes * 60,
            thirstSeconds: set.thirstMinutes * 60,
            moistureHold: set.moistureHold,
            fireDanger: weather.danger,
            windFrom: weather.windFrom,
            windSpeed: weather.windSpeed,
            random: this.random,
            waterAt: grid
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
                : () => 0,
        });
        for (const grazer of this.grazers()) meadow.graze(grazer.x, grazer.y, MEADOW_STEP_SECONDS);
        // The trees after the ground they stand on: what they set on fire is told with this step.
        const trees = this.trees.step({
            seconds: MEADOW_STEP_SECONDS,
            rainMmPerHour: this.rainRate,
            windFrom: weather.windFrom,
            windSpeed: weather.windSpeed,
            growSeconds: set.growMinutes * 60,
            groundBurning: meadow.burning() > 0,
            random: this.random,
        });
        this.tellTrees(trees.changed, trees.embers);
        // A fire is seen running: the room is told at every step while one burns, and once more when it is out.
        const burning = meadow.burning() > 0 || this.trees.burning() > 0;
        if (this.steps % STEPS_PER_MESSAGE === 0 || burning || this.wasBurning) this.tell(meadow);
        this.wasBurning = burning;
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
    }

    /**
     * A patch of fire a player sets around a point of the map (pixels), `radiusTiles` wide: the grass that can burn
     * there takes fire. Returns how many tiles did; the room sees it at the next step.
     */
    public ignite(x: number, y: number, radiusTiles: number): number {
        const settings = this.room.getWam()?.settings;
        if (!this.meadow || !{ ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow }.enabled) return 0;
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
        if (!this.meadow || !{ ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow }.enabled) return 0;
        const tileX = Math.floor(x / TILE_PX);
        const tileY = Math.floor(y / TILE_PX);
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

    /** A downpour soaks the soil under it at once; the room sees it at the next message of the meadow. */
    public soak(downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap">): void {
        const settings = this.room.getWam()?.settings;
        if (!this.meadow || !{ ...DEFAULT_MEADOW_SETTINGS, ...settings?.meadow }.enabled) return;
        this.meadow.soak(
            Math.floor(downpour.x / TILE_PX),
            Math.floor(downpour.y / TILE_PX),
            downpour.wholeMap ? undefined : downpour.radiusTiles,
        );
    }

    /** The whole state the room was last told, for a player who joins it. Undefined where nothing ever grew. */
    public snapshot(): MeadowMessage | undefined {
        if (
            !this.meadow ||
            !this.sentGrass ||
            !this.sentMoisture ||
            !this.sentDryness ||
            !this.sentFire ||
            !this.sentAsh
        ) {
            return undefined;
        }
        return {
            width: this.meadow.width,
            height: this.meadow.height,
            grass: gzipSync(this.sentGrass),
            moisture: gzipSync(this.sentMoisture),
            dryness: gzipSync(this.sentDryness),
            fire: gzipSync(this.sentFire),
            ash: gzipSync(this.sentAsh),
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
        const same = (a: Uint8Array, b: Uint8Array | undefined): boolean =>
            b !== undefined && a.length === b.length && a.every((value, index) => value === b[index]);
        // A bare and dry map the room was never told about: nothing to say.
        if (!this.sentGrass && grass.every((value) => value === 0) && moisture.every((value) => value === 0)) return;
        if (
            same(grass, this.sentGrass) &&
            same(moisture, this.sentMoisture) &&
            same(dryness, this.sentDryness) &&
            same(fire, this.sentFire) &&
            same(ash, this.sentAsh)
        ) {
            return;
        }
        this.sentGrass = grass;
        this.sentMoisture = moisture;
        this.sentDryness = dryness;
        this.sentFire = fire;
        this.sentAsh = ash;
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
            ["trees", Buffer.from(gzipSync(JSON.stringify(this.trees.write()))).toString("base64")],
            ["size", `${this.meadow.width}x${this.meadow.height}`],
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
