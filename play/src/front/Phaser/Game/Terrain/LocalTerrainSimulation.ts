import {
    boundedFireConditions,
    DEFAULT_FIRE_THRESHOLDS,
    fireDanger,
    GroundSimulation,
    MAX_WATER_SPEED,
    MeadowSimulation,
    NEUTRAL_FIRE_CONDITIONS,
    REAL_WEATHER_SLOT_MS,
    WaterSimulation,
    WeatherType,
} from "@workadventure/map-editor";
import type {
    FireConditions,
    PrecipitationAir,
    RealWeatherSlot,
    SeededMeadow,
    WAMFileFormat,
    WaterGridBounds,
    WaterSettings,
    WeatherLocation,
} from "@workadventure/map-editor";
import type { MeadowMessage, SubToPusherRoomMessage, TerrainWaterMessage } from "@workadventure/messages";

/**
 * The local ground shares the computer with the game: a step of its water may take this long (ms) before its fineness
 * is lowered (WaterLoad lowers it over half of it), where the server, with a thread of its own, allows a whole step.
 */
const LOCAL_STEP_BUDGET_MS = 20;
/** The local water is told to the game once a second, whatever the map asks of the server. */
const LOCAL_UPDATES_A_SECOND = 1;
/** The finest the local water is computed, whatever the map asks of the server. */
const LOCAL_MAX_PRECISION = 2;
/**
 * What comes in and goes out of the local water (rain, sources, evaporation) goes at least this many times faster
 * than in reality (WaterSettings.speed, a minute a second): the rain of the chosen place is seen filling a lake within
 * minutes, where the server, in real time, takes hours. Its flows keep their pace.
 */
const LOCAL_MIN_SPEED = 60;

/** Where the local ground of a player starts: the map, the place they chose, and the ground of the server now. */
export interface LocalTerrainStart {
    wam: WAMFileFormat;
    mapCells: { width: number; height: number };
    place: WeatherLocation;
    slots: readonly RealWeatherSlot[];
    water?: { depths: Uint8Array; bounds: WaterGridBounds };
    meadow?: SeededMeadow;
}

/** What the page asks of the worker that runs the local ground (LocalTerrainWorker). */
export type LocalTerrainCommand =
    | { kind: "start"; start: LocalTerrainStart }
    | { kind: "wam"; wam: WAMFileFormat }
    | { kind: "place"; place: WeatherLocation; slots: readonly RealWeatherSlot[] }
    | { kind: "walkers"; walkers: readonly { x: number; y: number }[] };

/** What the local ground tells its player: a state of its water or of its meadow, its bytes as they are (unzipped). */
export type LocalTerrainTold =
    | { kind: "water"; message: TerrainWaterMessage }
    | { kind: "meadow"; message: MeadowMessage };

/**
 * The ground of one player who follows the weather of a place they chose (Jour dans le monde, a point of the world
 * map): their own water of the relief and their own meadow, the same simulations as the server's (WaterSimulation,
 * MeadowSimulation) started from the ground of the server, then living under the rain, the cold and the wind of that
 * place. Nobody else sees it, and it tells nothing to the server. The catastrophes of the room stay the server's.
 *
 * Wired as the room wires its own (GameRoom): the air of the place says rain or snow, the snow melts into the water,
 * the water soaks the meadow. Nothing is zipped: the states go no further than this browser.
 */
export class LocalTerrainSimulation {
    private wam: WAMFileFormat;
    private shownWam: { of: WAMFileFormat; place: WeatherLocation; wam: WAMFileFormat } | undefined;
    private place: WeatherLocation;
    private slots: readonly RealWeatherSlot[];
    private readonly mapCells: { width: number; height: number };
    private walkers: readonly { x: number; y: number }[] = [];
    /** The water and the meadow, wired as the server wires its own (GroundSimulation). */
    private readonly ground: GroundSimulation;

    constructor(
        start: LocalTerrainStart,
        tell: (told: LocalTerrainTold) => void,
        private readonly now: () => number = Date.now,
        random: () => number = Math.random,
    ) {
        this.wam = start.wam;
        this.place = start.place;
        this.slots = start.slots;
        this.mapCells = start.mapCells;
        const room = {
            getWam: (): WAMFileFormat => this.localWam(),
            sendSubMessageToRoom: (subMessage: SubToPusherRoomMessage): void => {
                const message = subMessage.message;
                if (message?.$case === "terrainWaterMessage") {
                    tell({ kind: "water", message: message.terrainWaterMessage });
                } else if (message?.$case === "meadowMessage") {
                    tell({ kind: "meadow", message: message.meadowMessage });
                }
            },
        };
        const rain = { slotsFor: (): RealWeatherSlot[] => [...this.slots] };
        const asIs = (bytes: Uint8Array): Uint8Array => bytes;
        const mapCells = (): { width: number; height: number } => this.mapCells;
        this.ground = new GroundSimulation({
            makeWater: () =>
                new WaterSimulation(room, rain, asIs, now, mapCells, () => performance.now(), LOCAL_STEP_BUDGET_MS),
            makeMeadow: (water) =>
                new MeadowSimulation(
                    room,
                    rain,
                    water,
                    asIs,
                    now,
                    mapCells,
                    () => [],
                    () => {
                        const conditions = this.conditions();
                        return {
                            danger: fireDanger(conditions, DEFAULT_FIRE_THRESHOLDS),
                            windFrom: conditions.windFrom,
                            windSpeed: conditions.windSpeed,
                        };
                    },
                    random,
                ),
            air: () => this.air(),
            snow: () => {
                const air = this.air();
                return air ? { ...air, windSpeed: this.conditions().windSpeed } : undefined;
            },
            // A door opens for the avatar of this player, as the server opens it for every avatar standing in it.
            walkers: () => this.walkers,
        });
        if (start.water) this.water.seed(start.water.depths, start.water.bounds);
        if (start.meadow) this.meadow.seed(start.meadow);
    }

    /** The water of this player, and their meadow: those of their ground. */
    private get water(): WaterSimulation {
        return this.ground.water;
    }

    private get meadow(): MeadowSimulation {
        return this.ground.meadow;
    }

    /** Runs the water (ten steps a second) and the meadow (a step every two seconds) of this player. */
    public start(): void {
        this.ground.start();
    }

    public stop(): void {
        this.ground.stop();
    }

    /** One step of the water and of the meadow, for what drives them by hand (the tests). */
    public step(): void {
        this.ground.step();
    }

    /** The map was edited: the ground follows its relief, its sources, its walls and its doors. */
    public setWam(wam: WAMFileFormat): void {
        this.wam = wam;
        this.ground.mapChanged();
    }

    /** The player chose another place, or its weather is known again: the ground lives on under it. */
    public setPlace(place: WeatherLocation, slots: readonly RealWeatherSlot[]): void {
        this.place = place;
        this.slots = slots;
    }

    /** Where the avatar of this player stands on the ground (map pixels): none while it is on a raised floor. */
    public setWalkers(walkers: readonly { x: number; y: number }[]): void {
        this.walkers = walkers;
    }

    /** The map as this ground reads it: in the real weather of the chosen place, whatever weather the map shows. */
    private localWam(): WAMFileFormat {
        const shown = this.shownWam;
        if (shown && shown.of === this.wam && shown.place === this.place) return shown.wam;
        const water = this.wam.settings?.water;
        const wam: WAMFileFormat = {
            ...this.wam,
            settings: {
                ...this.wam.settings,
                weather: WeatherType.Real,
                weatherLocation: this.place,
                ...(water && { water: localWaterSettings(water) }),
            },
        };
        this.shownWam = { of: this.wam, place: this.place, wam };
        return wam;
    }

    /** The quarter hour under way at the chosen place, once its timeline is known. */
    private slotNow(): RealWeatherSlot | undefined {
        const now = this.now();
        return this.slots.find((slot) => slot.at <= now && now < slot.at + REAL_WEATHER_SLOT_MS);
    }

    /** The air the precipitation of the place falls through: rain or snow (as FireConditionsManager.air). */
    private air(): PrecipitationAir | undefined {
        const slot = this.slotNow();
        if (slot?.temperature === null || slot?.temperature === undefined || slot.humidity === undefined) {
            return undefined;
        }
        return { temperature: slot.temperature, humidity: slot.humidity };
    }

    /** The heat, the humidity and the wind of the place for its fire, mild where it does not say. */
    private conditions(): FireConditions {
        const slot = this.slotNow();
        if (!slot) return NEUTRAL_FIRE_CONDITIONS;
        return boundedFireConditions(
            {
                temperature: slot.temperature ?? undefined,
                humidity: slot.humidity,
                windSpeed: slot.windSpeed,
                windFrom: slot.windFrom,
            },
            NEUTRAL_FIRE_CONDITIONS,
        );
    }
}

/**
 * The water settings of the map as the local ground runs them: lighter than the server's (told once a second, at most
 * as fine as LOCAL_MAX_PRECISION) and quicker (at least LOCAL_MIN_SPEED times reality).
 */
export function localWaterSettings(water: WaterSettings): WaterSettings {
    return {
        ...water,
        updates: LOCAL_UPDATES_A_SECOND,
        speed: Math.min(MAX_WATER_SPEED, Math.max(water.speed, LOCAL_MIN_SPEED)),
        precision: Math.min(water.precision ?? LOCAL_MAX_PRECISION, LOCAL_MAX_PRECISION),
    };
}
