import {
    boundedFireConditions,
    cellKey,
    DEFAULT_FIRE_THRESHOLDS,
    fireDanger,
    NEUTRAL_FIRE_CONDITIONS,
    WeatherType,
    withHeights,
} from "@workadventure/map-editor";
import type { Ball, Downpour, Drain, RealWeatherSlot, WAMFileFormat } from "@workadventure/map-editor";
import { luckOf } from "../../src/Model/Ground/GroundProtocol";
import type { RoomGround, RoomGroundInputs } from "../../src/Model/Ground/RoomGround";
import { MeadowManager } from "../../src/Model/MeadowManager";
import { TerrainWaterManager } from "../../src/Model/TerrainWaterManager";

/** A noon of November: the ground lives from there. */
export const GROUND_NOW = Date.UTC(2026, 10, 22, 12, 0);
/** A map of 48 × 48 cells of the relief (24 × 24 tiles). */
export const GROUND_MAP_CELLS = { width: 48, height: 48 };

/** A cold rain, quarter hour by quarter hour around `around`: part of it falls as snow. */
export function groundSlots(around: number, count = 12, rainRate = 30): RealWeatherSlot[] {
    const quarter = 15 * 60_000;
    const first = Math.floor(around / quarter) * quarter - 2 * quarter;
    return Array.from({ length: count }, (_, index) => ({
        at: first + index * quarter,
        weather: rainRate > 0 ? WeatherType.Rain : WeatherType.Clear,
        temperature: rainRate > 0 ? (index % 3 === 0 ? -2 : 1) : 36,
        humidity: 85,
        rainRate,
        windSpeed: 20,
        windFrom: 270,
    }));
}

/** The seed of the luck of a ground: the same numbers for each ground that asks. */
export const GROUND_SEED = 20261122;
export function seededLuck(): () => number {
    return luckOf(GROUND_SEED);
}

/**
 * A map with all the ground has to deal with: a lake (cells 4..19), a source that pours next to a building, the floor
 * of that building (tiles 14..19, "Carte Sols") with a drain on it, a pond far from it, real weather, water with
 * inertia at six times reality (enough for the rain, the source and the snow to act within a minute and a half;
 * at sixty its water would live sixty steps of its time at each step, and the tests would be ten times as long).
 */
export function groundWam(): WAMFileFormat {
    const heights = new Map<string, number>();
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) heights.set(cellKey(x, y), -32);
    for (let y = 6; y < 12; y++) for (let x = 40; x < 46; x++) heights.set(cellKey(x, y), -8);
    const entities: WAMFileFormat["entities"] = {};
    for (let tileY = 14; tileY < 20; tileY++) {
        for (let tileX = 14; tileX < 20; tileX++) {
            entities[`floor-${tileX}-${tileY}`] = {
                x: tileX * 32,
                y: tileY * 32,
                prefabRef: { collectionName: "Carte Sols", id: "sol" },
            };
        }
    }
    entities.source = {
        x: 26 * 16 + 8,
        y: 34 * 16 + 8,
        prefabRef: { collectionName: "eau", id: "source" },
        properties: [{ id: "s", type: "waterSourcePropertyData", flow: 6000 }],
    };
    entities.drain = {
        x: 34 * 16 + 8,
        y: 34 * 16 + 8,
        prefabRef: { collectionName: "eau", id: "siphon" },
        properties: [{ id: "d", type: "waterSinkPropertyData", flow: 10 }],
    };
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities,
        settings: {
            weather: WeatherType.Real,
            weatherLocation: { name: "Nice", latitude: 43.7, longitude: 7.27, timezone: "Europe/Paris" },
            water: {
                runoff: 10,
                evaporation: 0.2,
                speed: 6,
                absorption: 5,
                current: 1,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: true,
                updates: 5,
            },
        },
        terrain: withHeights(undefined, heights),
    };
}

/** A value as text, its bytes in base 64 whatever holds them (a Buffer here, a Uint8Array once it crossed a thread). */
export function plain(value: unknown): string {
    return JSON.stringify(value, (_key, held: unknown) => {
        if (held instanceof Uint8Array) return Buffer.from(held).toString("base64");
        if (typeof held === "object" && held !== null && "type" in held && held.type === "Buffer" && "data" in held) {
            return Buffer.from(held.data as number[]).toString("base64");
        }
        return held;
    });
}

/** What a ground did that the room and the store can see: what it told, what it saved. */
export interface Seen {
    told: string[];
    saved: string[];
}

/** The room of a ground, with catastrophes the test moves. */
export function world(wam: WAMFileFormat, stored: Record<string, Record<string, string>> = {}) {
    const seen: Seen = { told: [], saved: [] };
    const state = {
        downpours: [] as Downpour[],
        drains: [] as Drain[],
        balls: [] as Ball[],
        air: { temperature: 1, humidity: 85 } as { temperature: number; humidity: number } | undefined,
        /** The conditions of the fire of the room: a cold rain until the test says a heat wave. */
        fire: { temperature: 1, humidity: 85, windSpeed: 20, windFrom: 270 },
        /** How hard it rains at the place of the map (mm an hour). */
        rainRate: 30,
    };
    const fire = () => boundedFireConditions(state.fire, NEUTRAL_FIRE_CONDITIONS);
    const inputs: RoomGroundInputs = {
        room: {
            getWam: () => wam,
            sendSubMessageToRoom: (message) => {
                seen.told.push(plain(message));
            },
        },
        rain: {
            slotsFor: () => groundSlots(GROUND_NOW, 12, state.rainRate),
            history: () => Promise.resolve(groundSlots(GROUND_NOW - 6 * 3600_000, 30)),
        },
        store: {
            roomUrl: "room",
            repository: {
                loadVariables: (key: string) => Promise.resolve(key in stored ? stored[key] : {}),
                saveVariable: (key: string, field: string, value: string) => {
                    seen.saved.push(`${key}|${field}|${value}`);
                    return Promise.resolve(0);
                },
            },
        },
        mapSize: () => GROUND_MAP_CELLS,
        walkers: () => [{ x: 300, y: 300 }],
        downpours: () => state.downpours,
        drains: () => state.drains,
        balls: () => state.balls,
        grazers: () => [{ x: 100, y: 600 }],
        air: () => state.air,
        fire,
        thresholds: () => DEFAULT_FIRE_THRESHOLDS,
        now: () => Date.now(),
        clock: () => 0,
        random: seededLuck(),
    };
    return { seen, state, inputs };
}

/**
 * The ground of a room wired by hand, as GameRoom wired it before the grounds: the same water and the same meadow,
 * the same calls in the same order.
 */
export async function byHand(
    inputs: RoomGroundInputs,
): Promise<RoomGround & { water: TerrainWaterManager; meadow: MeadowManager }> {
    const water = new TerrainWaterManager(
        inputs.room,
        inputs.rain,
        inputs.store,
        inputs.now,
        () => inputs.mapSize(),
        inputs.clock,
    );
    water.setDownpours(() => inputs.downpours());
    water.setDrains(() => inputs.drains());
    water.setBalls(() => inputs.balls());
    water.setWalkers(() => inputs.walkers());
    await water.restore();
    water.start();
    water.fallThrough(() => inputs.air());
    const meadow = new MeadowManager(
        inputs.room,
        inputs.rain,
        () => water.getGrid(),
        inputs.store,
        inputs.now,
        () => inputs.mapSize(),
        () => inputs.grazers(),
        () => {
            const conditions = inputs.fire();
            return {
                danger: fireDanger(conditions, inputs.thresholds()),
                windFrom: conditions.windFrom,
                windSpeed: conditions.windSpeed,
            };
        },
        inputs.random,
    );
    meadow.fallThrough(() => inputs.air());
    // The snow and the ice go as fast as what comes in to the water, as GroundSimulation wires them.
    meadow.timesWith(() => water.livedTimes().inflow);
    meadow.snowUnder(() => {
        const air = inputs.air();
        return air ? { ...air, windSpeed: inputs.fire().windSpeed } : undefined;
    });
    meadow.pourWith(water.pour.bind(water));
    meadow.liveAlong(water.liveAgain.bind(water));
    meadow.catchUpWith(
        (place, since) => inputs.rain.history(place, since),
        (slot: RealWeatherSlot) => {
            const conditions = boundedFireConditions(
                {
                    temperature: slot.temperature ?? undefined,
                    humidity: slot.humidity,
                    windSpeed: slot.windSpeed,
                    windFrom: slot.windFrom,
                },
                NEUTRAL_FIRE_CONDITIONS,
            );
            const air =
                slot.temperature !== null && slot.humidity !== undefined
                    ? { temperature: slot.temperature, humidity: slot.humidity }
                    : undefined;
            return {
                air,
                snow: air ? { ...air, windSpeed: conditions.windSpeed } : undefined,
                fire: {
                    danger: fireDanger(conditions, inputs.thresholds()),
                    windFrom: conditions.windFrom,
                    windSpeed: conditions.windSpeed,
                },
            };
        },
    );
    await meadow.restore();
    meadow.start();
    return {
        water,
        meadow,
        startWater: () => Promise.resolve(),
        startMeadow: () => Promise.resolve(),
        stop: () => {
            water.stop();
            meadow.stop();
        },
        mapChanged: () => {
            water.mapChanged();
            meadow.mapChanged();
        },
        strike: (x, y, radiusTiles) => {
            water.strike(x, y, radiusTiles);
            meadow.shatter(x, y, radiusTiles);
        },
        burn: (x, y, radiusTiles, id) => {
            water.vaporise(x, y, radiusTiles);
            meadow.scorch(x, y, radiusTiles, id);
        },
        shatter: meadow.shatter.bind(meadow),
        soak: meadow.soak.bind(meadow),
        ignite: (x, y, radiusTiles) => {
            meadow.ignite(x, y, radiusTiles);
        },
        ballLevelAt: water.ballLevelAt.bind(water),
        getGrid: () => water.getGrid(),
        waterVersion: () => water.waterVersion(),
        lifeFire: () => meadow.lifeFire(),
        iceAt: (tileX, tileY) => meadow.iceAt(tileX, tileY),
        hasMeadow: () => meadow.hasMeadow(),
        catchingUp: () => meadow.catchingUp(),
        waterSnapshot: () => water.snapshot(),
        meadowSnapshot: () => meadow.snapshot(),
        treeSnapshot: () => meadow.treeSnapshot(),
    };
}

/**
 * What happens to a room at each tenth of a second of a minute and a half: rain and snow, a source, the drain of a
 * building, a cold snap that freezes the water, and every catastrophe. The levels a ball is held at are noted in
 * `levels`.
 */
export function happenAt(
    tenth: number,
    ground: RoomGround,
    state: ReturnType<typeof world>["state"],
    levels: number[],
): void {
    if (tenth === 100) state.downpours = [{ id: 1, x: 200, y: 200, radiusTiles: 4, wholeMap: false }];
    if (tenth === 110) ground.soak(state.downpours[0]);
    if (tenth === 200) state.downpours = [];
    if (tenth === 220) ground.strike(190, 190, 2);
    if (tenth === 300) state.balls = [{ id: 7, x: 180, y: 180, radiusPx: 40 }];
    if (tenth > 300 && tenth < 400) {
        const x = 180 + (tenth - 300);
        state.balls = [{ id: 7, x, y: 180, radiusPx: 40, levelPx: ground.ballLevelAt(7, x, 180) }];
        levels.push(state.balls[0].levelPx ?? 0);
    }
    if (tenth === 400) state.balls = [];
    if (tenth === 420) state.drains = [{ id: 3, x: 220, y: 220, radiusTiles: 2 }];
    if (tenth === 480) state.drains = [];
    if (tenth === 500) ground.ignite(600, 150, 2);
    if (tenth === 560) ground.burn(240, 240, 2, 9);
    // A cold snap: the water of the map takes, and what falls on its ice breaks it.
    if (tenth === 570) state.air = { temperature: -25, humidity: 85 };
    if (tenth === 640) ground.shatter(200, 200, 3);
    if (tenth === 700) state.air = { temperature: 12, humidity: 60 };
    if (tenth === 760) ground.mapChanged();
    // A heat wave: the rain stops, the grass dries, and a fire a player sets takes.
    if (tenth === 900) {
        state.rainRate = 0;
        state.air = { temperature: 36, humidity: 12 };
        state.fire = { temperature: 36, humidity: 12, windSpeed: 45, windFrom: 270 };
    }
    if (tenth >= 940 && tenth % 60 === 40) ground.ignite(650, 120 + (tenth % 7) * 30, 3);
    if (tenth === 1100) ground.burn(660, 400, 3, 11);
}
