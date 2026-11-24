import type { Ball } from "../Catastrophe/Ball";
import type { ColdMass } from "../Catastrophe/Cold";
import type { Downpour } from "../Catastrophe/Downpour";
import type { Drain } from "../Catastrophe/Drain";
import type { Hurricane } from "../Catastrophe/Hurricane";
import type { Tsunami } from "../Catastrophe/Tsunami";
import { TERRAIN_CELL, TILE_PX } from "../types";
import type { ZombieHorde } from "../Catastrophe/ZombieHorde";
import type { PrecipitationAir } from "../Weather/Precipitation";
import type { MapAirSetup } from "../Weather/MapAir";
import { MapAir, mapSurfaceOf } from "../Weather/MapAir";
import type { MapPlace, RealWeatherSlot } from "../Weather/RealWeather";
import type { MeadowSimulation, MeadowWater, ReplayedWeather } from "./MeadowSimulation";
import type { SnowWeather } from "./Snow";
import type { WaterSimulation } from "./WaterSimulation";
import { LIFE_DEPTHS_PX } from "./WaterView";

/** What a ground is made of and what it lives under: the same for the server of a room and for a browser. */
export interface GroundSetup<W extends WaterSimulation, M extends MeadowSimulation> {
    /** The water of the relief (the server gives the one that saves itself). */
    makeWater(): W;
    /** The meadow, over the water just made: its soil is soaked under it, its grass drowns. */
    makeMeadow(water: () => MeadowWater | undefined): M;
    /** The air the precipitation falls through: rain, or snow in the cold. Undefined while it is not known. */
    air(): PrecipitationAir | undefined;
    /** The air over the snow that lies: it melts by its heat, its wind and its humidity. */
    snow(): SnowWeather | undefined;
    /** Where the avatars standing on the ground are (map pixels): they hold the doors open. */
    walkers(): readonly { x: number; y: number }[];
    /** The catastrophes that act on the water at each of its steps. None where there are none (a ground of one's own). */
    catastrophes?: {
        downpours(): readonly Downpour[];
        drains(): readonly Drain[];
        balls(): readonly Ball[];
        /** The masses of cold air the players hold: they act on the meadow (its snow, its ice, its soil). */
        colds?(): readonly ColdMass[];
        /** The hurricane crossing the map: its rain takes the place of that of the map, on the water and the meadow. */
        hurricane?(): Hurricane | undefined;
        /** The tsunami coming in by the east edge of the map: the sea it holds there, on the water. */
        tsunami?(): Tsunami | undefined;
        /** The horde of zombies crossing the map: the meadow steps its crowd, which tramples it. */
        zombies?(): ZombieHorde | undefined;
    };
    /**
     * The air of a hurricane crossing the map (MapAir), told to the room: what it reads of the room. Absent: no air is
     * computed (a ground of one's own, in a browser), the wind of a hurricane is that of its formula.
     */
    hurricaneAir?: Pick<MapAirSetup, "room" | "now" | "roomWind" | "mapSize">;
    /**
     * How a ground left alone lives the time it missed (MeadowSimulation.catchUpWith): the water then lives it along
     * with the meadow. Absent: it never catches up.
     */
    catchUp?: {
        history(place: MapPlace | undefined, since: number): Promise<RealWeatherSlot[] | undefined>;
        weatherOfSlot(slot: RealWeatherSlot): ReplayedWeather | undefined;
    };
}

/**
 * The ground of a map as it lives: the water of its relief and its meadow, wired to each other. The air says rain
 * or snow to both, the snow that melts on the meadow runs to the water, the water soaks the meadow, and a ground left
 * alone lives the time it missed, its water along with its meadow. The server of a room and the browser of a player
 * who follows the weather of another place build it the same way; only what they give it differs.
 */
export class GroundSimulation<
    W extends WaterSimulation = WaterSimulation,
    M extends MeadowSimulation = MeadowSimulation,
> {
    public readonly water: W;
    public readonly meadow: M;
    /** The air of a hurricane crossing the map, where the setup asks for it. */
    public readonly air: MapAir | undefined;

    constructor(setup: GroundSetup<W, M>) {
        const water = setup.makeWater();
        this.water = water;
        water.fallThrough(() => setup.air());
        water.setWalkers(() => setup.walkers());
        const catastrophes = setup.catastrophes;
        if (catastrophes) {
            water.setDownpours(() => catastrophes.downpours());
            water.setDrains(() => catastrophes.drains());
            water.setBalls(() => catastrophes.balls());
        }
        const meadow = setup.makeMeadow(() => water.getGrid());
        this.meadow = meadow;
        meadow.fallThrough(() => setup.air());
        // The snow and the ice go as fast as what comes in to the water: one clock for all of them.
        meadow.timesWith(() => water.livedTimes().inflow);
        meadow.snowUnder(() => setup.snow());
        meadow.pourWith(water.pour.bind(water));
        if (catastrophes?.colds) meadow.coldUnder(catastrophes.colds.bind(catastrophes));
        if (catastrophes?.tsunami) water.seaUnder(catastrophes.tsunami.bind(catastrophes));
        if (catastrophes?.hurricane) {
            const hurricane = catastrophes.hurricane.bind(catastrophes);
            water.skyUnder(hurricane);
            meadow.skyUnder(hurricane);
        }
        const hurricaneAir = setup.hurricaneAir;
        const hurricane = catastrophes?.hurricane?.bind(catastrophes);
        if (hurricaneAir && hurricane) {
            const air = new MapAir({
                ...hurricaneAir,
                hurricane,
                // The sea where the water of the relief is deep enough for a fish, the forests where the trees stand.
                surface: () => {
                    const grid = water.getGrid();
                    const size = hurricaneAir.mapSize() ?? { width: 0, height: 0 };
                    return mapSurfaceOf(
                        size,
                        (cellX, cellY) => grid?.depthAt(cellX, cellY) ?? 0,
                        meadow.treePlaces(),
                        LIFE_DEPTHS_PX.fish,
                        TERRAIN_CELL,
                        TILE_PX,
                    );
                },
            });
            this.air = air;
            // One step of the air with each step of the water: the same steps with and without a thread of its own.
            water.stepAlong(() => air.step());
            // Its wind pushes the fires, each where it is, at 10 m over its surface; that of the standard exposure
            // lays the trees down.
            meadow.airUnder(
                (x, y) => air.windAt(x, y),
                (x, y) => air.standardWindAt(x, y),
            );
        }
        if (catastrophes?.zombies) meadow.zombiesUnder(catastrophes.zombies.bind(catastrophes));
        const catchUp = setup.catchUp;
        if (catchUp) {
            meadow.liveAlong(water.liveAgain.bind(water));
            meadow.catchUpWith(catchUp.history.bind(catchUp), catchUp.weatherOfSlot.bind(catchUp));
        }
    }

    /** Runs the water (ten steps a second) and the meadow (a step every two seconds). */
    public start(): void {
        this.water.start();
        this.meadow.start();
    }

    public stop(): void {
        this.water.stop();
        this.meadow.stop();
    }

    /** One step of the water and of the meadow, for what drives them by hand (the tests). */
    public step(): void {
        this.water.step();
        this.meadow.step();
    }

    /** The map changed (or was just read): the water first, the meadow reads it. */
    public mapChanged(): void {
        this.water.mapChanged();
        this.meadow.mapChanged();
    }

    /** A comet lands at a point of the map (pixels): it takes the water of its crater, and breaks the ice on it. */
    public strike(x: number, y: number, radiusTiles: number): void {
        this.water.strike(x, y, radiusTiles);
        this.meadow.shatter(x, y, radiusTiles);
    }

    /** A fireball lands: it boils the water of its crater away first, then burns the ground it left dry. */
    public burn(x: number, y: number, radiusTiles: number, id: number): void {
        this.water.vaporise(x, y, radiusTiles);
        this.meadow.scorch(x, y, radiusTiles, id);
    }
}
