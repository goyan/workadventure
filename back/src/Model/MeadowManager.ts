import { gunzipSync, gzipSync } from "node:zlib";
import {
    DEFAULT_MEADOW_SETTINGS,
    landWallsOf,
    Meadow,
    MEADOW_STEP_SECONDS,
    minutesOfDayIn,
    pavedTilesOf,
    rainRateAt,
    seasonAt,
    TERRAIN_CELL,
    TILE_PX,
    WeatherType,
} from "@workadventure/map-editor";
import type { Downpour, TerrainData, WaterGrid } from "@workadventure/map-editor";
import type { MeadowMessage } from "@workadventure/messages";
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
/** The grass grows by day: between these minutes of the day at the place of the map. */
const DAY_FROM = 7 * 60;
const DAY_TO = 19 * 60;

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
    private readTerrain: TerrainData | undefined | null = null;
    private readSignature: string | undefined;
    /** The state saved before a restart, until the first meadow takes it. */
    private saved: { width: number; height: number; grass: Uint8Array; moisture: Uint8Array } | undefined;
    private timer: ReturnType<typeof setInterval> | undefined;
    private steps = 0;
    private rainRate = 0;
    private sentGrass: Uint8Array | undefined;
    private sentMoisture: Uint8Array | undefined;
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
            };
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
        if (this.meadow && this.readTerrain === wam?.terrain && this.readSignature === signature) return;
        this.readTerrain = wam?.terrain;
        this.readSignature = signature;
        const before = this.meadow;
        this.meadow = new Meadow({ width, height }, wam?.terrain, walls, paved);
        if (before) this.meadow.takeFrom(before);
        else if (this.saved && this.saved.width === width && this.saved.height === height) {
            this.meadow.read(this.saved.grass, this.saved.moisture);
        }
        this.saved = undefined;
        if (!this.timer) {
            this.timer = setInterval(() => this.tick(), MEADOW_STEP_SECONDS * 1000);
            // The meadow of a room must never keep the process alive.
            this.timer.unref?.();
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
                this.tell(meadow);
                this.save();
            }
            return;
        }
        this.cleared = false;
        const minutes = minutesOfDayIn(date, settings?.weatherLocation?.timezone);
        const grid = this.water();
        meadow.step({
            seconds: MEADOW_STEP_SECONDS,
            rainMmPerHour: this.rainRate,
            daylight: minutes >= DAY_FROM && minutes < DAY_TO,
            season: seasonAt(date),
            growSeconds: set.growMinutes * 60,
            thirstSeconds: set.thirstMinutes * 60,
            moistureHold: set.moistureHold,
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
        if (this.steps % STEPS_PER_MESSAGE === 0) this.tell(meadow);
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
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
        if (!this.meadow || !this.sentGrass || !this.sentMoisture) return undefined;
        return {
            width: this.meadow.width,
            height: this.meadow.height,
            grass: gzipSync(this.sentGrass),
            moisture: gzipSync(this.sentMoisture),
        };
    }

    private tell(meadow: Meadow): void {
        const grass = meadow.writeGrass();
        const moisture = meadow.writeMoisture();
        const same = (a: Uint8Array, b: Uint8Array | undefined): boolean =>
            b !== undefined && a.length === b.length && a.every((value, index) => value === b[index]);
        // A bare and dry map the room was never told about: nothing to say.
        if (!this.sentGrass && grass.every((value) => value === 0) && moisture.every((value) => value === 0)) return;
        if (same(grass, this.sentGrass) && same(moisture, this.sentMoisture)) return;
        this.sentGrass = grass;
        this.sentMoisture = moisture;
        this.changedSinceSave = true;
        this.room.sendSubMessageToRoom({
            message: {
                $case: "meadowMessage",
                meadowMessage: {
                    width: meadow.width,
                    height: meadow.height,
                    grass: gzipSync(grass),
                    moisture: gzipSync(moisture),
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
