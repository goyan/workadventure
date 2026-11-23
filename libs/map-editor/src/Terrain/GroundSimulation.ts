import type { Ball } from "../Catastrophe/Ball";
import type { Downpour } from "../Catastrophe/Downpour";
import type { Drain } from "../Catastrophe/Drain";
import type { PrecipitationAir } from "../Weather/Precipitation";
import type { MapPlace, RealWeatherSlot } from "../Weather/RealWeather";
import type { MeadowSimulation, MeadowWater, ReplayedWeather } from "./MeadowSimulation";
import type { SnowWeather } from "./Snow";
import type { WaterSimulation } from "./WaterSimulation";

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
    };
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
