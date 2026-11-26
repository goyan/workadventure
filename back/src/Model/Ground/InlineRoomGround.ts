import {
    boundedFireConditions,
    fireDanger,
    GroundSimulation,
    hurricaneConditions,
    hurricaneHumidity,
    NEUTRAL_FIRE_CONDITIONS,
    TERRAIN_CELL,
} from "@workadventure/map-editor";
import type { Downpour, LifeFire, RealWeatherSlot, ReplayedWeather, WaterView } from "@workadventure/map-editor";
import type { HurricaneAirMessage, MeadowMessage, TerrainWaterMessage, TreeFireMessage } from "@workadventure/messages";
import { MeadowManager } from "../MeadowManager";
import { TerrainWaterManager } from "../TerrainWaterManager";
import type { ToldFire } from "./GroundProtocol";
import type { RoomGround, RoomGroundInputs } from "./RoomGround";

/**
 * The weather of a quarter hour of the past as the meadow of a room lives it again: its air, the air over its snow
 * and the conditions of its fire, read as the conditions of the room read the quarter hour of now.
 */
export function replayedWeatherOf(
    slot: RealWeatherSlot,
    thresholds: RoomGroundInputs["thresholds"],
): ReplayedWeather | undefined {
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
            danger: fireDanger(conditions, thresholds()),
            windFrom: conditions.windFrom,
            windSpeed: conditions.windSpeed,
        },
    };
}

/**
 * The ground of a room computed on the thread of the rooms: the water of its relief and its meadow as the server
 * keeps them (TerrainWaterManager, MeadowManager), wired to each other (GroundSimulation) and to the room.
 */
export class InlineRoomGround implements RoomGround {
    private readonly ground: GroundSimulation<TerrainWaterManager, MeadowManager>;

    /** The water and the meadow themselves, for what hosts this ground on another thread (HostedGround). */
    public get water(): TerrainWaterManager {
        return this.ground.water;
    }

    public get meadow(): MeadowManager {
        return this.ground.meadow;
    }

    constructor(inputs: RoomGroundInputs) {
        // The conditions of the room, under its hurricane when one crosses the map: computed here at each step, from
        // the hurricane and the time of the room, on whichever thread the ground lives.
        const now = (): number => inputs.now?.() ?? Date.now();
        const conditionsNow = () => hurricaneConditions(inputs.fire(), inputs.hurricane?.(), now());
        const airNow = () => {
            const air = inputs.air();
            return air ? { ...air, humidity: hurricaneHumidity(air.humidity, inputs.hurricane?.(), now()) } : air;
        };
        this.ground = new GroundSimulation({
            makeWater: () =>
                new TerrainWaterManager(
                    inputs.room,
                    inputs.rain,
                    inputs.store,
                    inputs.now,
                    () => inputs.mapSize(),
                    inputs.clock,
                ),
            makeMeadow: (water) =>
                new MeadowManager(
                    inputs.room,
                    inputs.rain,
                    water,
                    inputs.store,
                    inputs.now,
                    () => inputs.mapSize(),
                    () => inputs.grazers(),
                    // The grass dries by the conditions of the room, and their wind pushes its fire.
                    () => {
                        const conditions = conditionsNow();
                        return {
                            danger: fireDanger(conditions, inputs.thresholds()),
                            windFrom: conditions.windFrom,
                            windSpeed: conditions.windSpeed,
                        };
                    },
                    inputs.random,
                ),
            // In the cold of the room the rain of the map falls as snow: it brings no water to the relief, nor does it
            // soak the soil of the meadow.
            air: () => airNow(),
            // The snow that fell lies on the ground: it melts by the heat, the wind and the humidity of the room, and
            // its water runs to the water of the relief.
            snow: () => {
                const air = airNow();
                return air ? { ...air, windSpeed: conditionsNow().windSpeed } : undefined;
            },
            // A door holds the water while it is closed: it opens for the avatars that stand in its passage.
            walkers: () => inputs.walkers(),
            // The air of a hurricane crossing the map, in the wind of the room (its own conditions, outside the
            // hurricane), told to the room twice a second.
            hurricaneAir: {
                room: inputs.room,
                now,
                roomWind: () => inputs.fire(),
                mapSize: () => {
                    const cells = inputs.mapSize();
                    return cells && { width: cells.width * TERRAIN_CELL, height: cells.height * TERRAIN_CELL };
                },
            },
            catastrophes: {
                downpours: () => inputs.downpours(),
                drains: () => inputs.drains(),
                balls: () => inputs.balls(),
                colds: () => inputs.colds?.() ?? [],
                hurricane: () => inputs.hurricane?.(),
                tsunami: () => inputs.tsunami?.(),
                zombies: () => inputs.zombies?.(),
            },
            // A room left empty lives the time it missed: with the weather of the past at the place of a map in real
            // weather, each quarter hour read as the conditions of the room read the quarter hour of now.
            catchUp: {
                history: (place, since) => inputs.rain.history(place, since),
                weatherOfSlot: (slot) => replayedWeatherOf(slot, () => inputs.thresholds()),
            },
        });
    }

    public async startWater(): Promise<void> {
        await this.ground.water.restore();
        this.ground.water.start();
    }

    public async startMeadow(): Promise<void> {
        await this.ground.meadow.restore();
        this.ground.meadow.start();
    }

    public stop(): void {
        this.ground.stop();
    }

    public mapChanged(): void {
        this.ground.mapChanged();
    }

    public strike(x: number, y: number, radiusTiles: number): void {
        this.ground.strike(x, y, radiusTiles);
    }

    public burn(x: number, y: number, radiusTiles: number, id: number): void {
        this.ground.burn(x, y, radiusTiles, id);
    }

    public shatter(x: number, y: number, radiusTiles: number): void {
        this.ground.meadow.shatter(x, y, radiusTiles);
    }

    public calm(): void {
        this.ground.meadow.calm();
    }

    public soak(downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap">): void {
        this.ground.meadow.soak(downpour);
    }

    public ignite(x: number, y: number, radiusTiles: number): void {
        this.ground.meadow.ignite(x, y, radiusTiles);
    }

    public ballLevelAt(id: number, x: number, y: number): number {
        return this.ground.water.ballLevelAt(id, x, y);
    }

    public getGrid(): WaterView | undefined {
        return this.ground.water.getGrid();
    }

    public waterVersion(): number {
        return this.ground.water.waterVersion();
    }

    public lifeFire(): LifeFire | undefined {
        return this.ground.meadow.lifeFire();
    }

    public fireTiles(): ToldFire | undefined {
        return this.ground.meadow.toldFire();
    }

    public iceAt(tileX: number, tileY: number): number {
        return this.ground.meadow.iceAt(tileX, tileY);
    }

    public hasMeadow(): boolean {
        return this.ground.meadow.hasMeadow();
    }

    public catchingUp(): boolean {
        return this.ground.meadow.catchingUp();
    }

    public waterSnapshot(): TerrainWaterMessage | undefined {
        return this.ground.water.snapshot();
    }

    public meadowSnapshot(): MeadowMessage | undefined {
        return this.ground.meadow.snapshot();
    }

    public treeSnapshot(): TreeFireMessage | undefined {
        return this.ground.meadow.treeSnapshot();
    }

    public airSnapshot(): HurricaneAirMessage | undefined {
        return this.ground.air?.snapshot();
    }
}
