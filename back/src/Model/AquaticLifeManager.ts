import {
    Animal,
    DEFAULT_LIFE_SETTINGS,
    emptyLifeTally,
    emptyPopulation,
    isPredator,
    lifeCensus,
    LIFE_RANGES,
    LifeHistory,
    LifeRanges,
    LIFE_STEP_MS,
    SPECIES,
    SPECIES_IDS,
    SPECIES_WIRE,
    speciesCensus,
    stepPopulation,
    waterBodiesOf,
} from "@workadventure/map-editor";
import type {
    LifeCensus,
    LifeSample,
    LifeTally,
    Population,
    SpeciesCensus,
    SpeciesId,
    SpeciesTallies,
    WaterBodies,
    WaterGrid,
} from "@workadventure/map-editor";
import type {
    AquaticLifeMessage,
    AquaticLifeSampleMessage,
    AquaticSpeciesCountMessage,
    AquaticSpeciesStatsMessage,
} from "@workadventure/messages";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";

/** The room is told its animals once a second (every second step). */
const STEPS_PER_MESSAGE = 2;
/** The animals are saved every half minute while they live. */
const STEPS_PER_SAVE = 60;
/** The bodies of water are read again once a second at most, and only when the water changed. */
const STEPS_PER_BODIES = 2;

const count = z.number().int().min(0);
/** What happened to a species since the life of the map began, as it is saved. */
const SavedSpeciesTally = z.object({
    arrivals: count,
    births: count,
    diedOfAge: count,
    eaten: count,
    starved: count,
    diedDry: count,
    meals: z.record(z.enum(SPECIES_IDS), count),
});

const SavedLife = z.object({
    animals: z.array(Animal).max(1000),
    nextId: z.number().int().min(1),
    // Absent from a state saved before the totals were kept.
    since: z.number().finite().optional(),
    history: z.unknown().optional(),
    ranges: z.unknown().optional(),
    totals: z
        .object({
            arrivals: z.number().int().min(0),
            births: z.number().int().min(0),
            diedOfAge: z.number().int().min(0),
            eaten: z.number().int().min(0),
            diedDry: z.number().int().min(0),
            // Absent from a state saved before the dolphins bred.
            predatorBirths: z.number().int().min(0).default(0),
            predatorDeaths: z.number().int().min(0).default(0),
        })
        .optional(),
    // Absent from a state saved before the species were counted one by one.
    bySpecies: z.record(z.enum(SPECIES_IDS), SavedSpeciesTally).optional(),
});

/** The counts of a record of species, as the messages carry them: in the order of the table, without the zeros. */
function countsOnWire(counts: Partial<Record<string, number>> | undefined): AquaticSpeciesCountMessage[] {
    const onWire: AquaticSpeciesCountMessage[] = [];
    for (const species of SPECIES_IDS) {
        const count = counts?.[species];
        if (count) onWire.push({ species: SPECIES_WIRE[species], count });
    }
    return onWire;
}

const sampleOnWire = (sample: LifeSample): AquaticLifeSampleMessage => ({
    at: sample.at,
    prey: sample.prey,
    predators: sample.predators,
    counts: countsOnWire(sample.counts),
});

/** What the life needs of the water of the room: its grid, and a number that changes whenever the water does. */
export interface LifeWater {
    getGrid(): WaterGrid | undefined;
    waterVersion(): number;
}

/** The life of a room as one of its steps is about to find it, for what acts on the animals before it (fishing). */
export interface LifeAtStep {
    /** The animals themselves: one told where to swim goes there during the step. */
    animals: Animal[];
    bodies: WaterBodies;
    /** The fastest a fish swims, in map pixels a second. */
    maxSpeedPxPerS: number;
    now: number;
}

/** What follows the life of a room: none of it can stop the life. */
export interface LifeHooks {
    beforeStep?: (life: LifeAtStep) => void;
    /** The life stopped: turned off (`emptied`, it will start over), or its map has no water any more. */
    stopped?: (emptied: boolean) => void;
}

/** A tile is 32 map pixels: the speed of the map is set in tiles a second. */
const TILE_PX = 32;

/** 0 a male fish, 1 a female fish, 2 a male dolphin, 3 a female dolphin. */
const kindOnWire = (animal: Animal): number => (animal.kind === "dolphin" ? 2 : 0) + (animal.sex === "female" ? 1 : 0);

/**
 * Keeps the life in the water of the relief of a room: fish that swim, breed and die, dolphins that hunt them
 * (the rules are in libs/map-editor, Life/). The server alone runs it, twice a second, on the water grid of
 * TerrainWaterManager, so that every player sees the same animals; the room is told all of them once a second, and
 * they are saved, so they survive a restart.
 *
 * It has its own timer: still water is not stepped, its fish must still swim. A map whose life is off, or without
 * water, costs nothing: no timer, nothing read. A step that fails stops the life of the room, never the room.
 */
export class AquaticLifeManager {
    private population: Population = emptyPopulation();
    private timer: ReturnType<typeof setInterval> | undefined;
    private steps = 0;
    private bodies: WaterBodies | undefined;
    private bodiesGrid: WaterGrid | undefined;
    private bodiesVersion = -1;
    private bodiesStep = -Infinity;
    /** What happened since the life of the map began (`since`), for its dashboard. */
    private totals: LifeTally = emptyLifeTally();
    /** The same, species by species (and what each ate). */
    private bySpecies: SpeciesTallies = {};
    /** How many of each species live, and how many their places hold: read once a second. */
    private speciesNow: SpeciesCensus[] = [];
    private since: number | undefined;
    /** The prey and the predators over the whole life of the map, for the curve of its dashboard. */
    private history = new LifeHistory();
    /** The same over the last five minutes, hour, four hours and day. */
    private ranges = new LifeRanges();
    private census: LifeCensus = { habitableBodies: 0, populatedBodies: 0, capacity: 0 };
    /** Whether the room was last told some animals: it is told once more when none is left. */
    private toldSome = false;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly water: LifeWater,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        private readonly random: () => number = Math.random,
        /** Where the avatars the animals fear stand, in map pixels (those on the ground). */
        private readonly avatars: () => readonly { x: number; y: number }[] = () => [],
        private readonly hooks: LifeHooks = {},
    ) {}

    /**
     * Brings back the animals saved before a restart; their ages went on meanwhile. A store that does not answer,
     * or animals that cannot be read, must not keep the room closed: the water is then empty.
     */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.state) return;
            const saved = SavedLife.parse(JSON.parse(fields.state));
            this.population = { animals: saved.animals, nextId: saved.nextId, seeded: true, dolphinsSeeded: true };
            this.totals = saved.totals ?? emptyLifeTally();
            // Before the species were counted one by one, the totals told the fish from the dolphins.
            this.bySpecies = saved.bySpecies ?? {
                fish: {
                    arrivals: this.totals.arrivals,
                    births: this.totals.births,
                    diedOfAge: this.totals.diedOfAge,
                    eaten: this.totals.eaten,
                    starved: 0,
                    diedDry: this.totals.diedDry,
                    meals: {},
                },
                dolphin: {
                    arrivals: 0,
                    births: this.totals.predatorBirths,
                    diedOfAge: this.totals.predatorDeaths,
                    eaten: 0,
                    starved: 0,
                    diedDry: 0,
                    meals: this.totals.eaten > 0 ? { fish: this.totals.eaten } : {},
                },
            };
            this.since = saved.since;
            this.history = LifeHistory.from(saved.history);
            this.ranges = LifeRanges.from(saved.ranges);
        } catch (error) {
            console.error("Could not restore the life of the water of the map", error);
        }
    }

    public start(): void {
        this.mapChanged();
    }

    public stop(): void {
        this.clearTimer();
        this.save();
    }

    /** The map of the room changed (or was just read): the life follows its setting and the grid of its water. */
    public mapChanged(): void {
        const enabled = this.room.getWam()?.settings?.life?.enabled === true;
        if (!enabled) {
            // Turned off, the water is emptied: turned on again, it starts over.
            const had = this.population.animals.length > 0;
            this.population = emptyPopulation();
            this.totals = emptyLifeTally();
            this.bySpecies = {};
            this.speciesNow = [];
            this.since = undefined;
            this.history.clear();
            this.ranges.clear();
            this.clearTimer();
            this.tellStopped(true);
            if (had || this.toldSome) {
                this.tell();
                this.save(true);
            }
            return;
        }
        let grid: WaterGrid | undefined;
        try {
            grid = this.water.getGrid();
        } catch (error) {
            console.error("Could not read the water of the map for its life", error);
        }
        if (grid && !this.timer) {
            this.timer = setInterval(() => this.tick(), LIFE_STEP_MS);
            // The life of a room must never keep the process alive.
            this.timer.unref?.();
        } else if (!grid) {
            this.clearTimer();
            this.tellStopped(false);
        }
    }

    /** A step from the timer: a failure stops the life of the room until its map changes, never the server. */
    private tick(): void {
        try {
            this.step();
        } catch (error) {
            console.error("The life of the water of the map stopped", error);
            this.clearTimer();
        }
    }

    /** One step of the life (two a second), and once a second the room is told. */
    public step(): void {
        const grid = this.water.getGrid();
        const settings = this.room.getWam()?.settings?.life;
        if (!grid || settings?.enabled !== true) return;
        const version = this.water.waterVersion();
        const stale = grid !== this.bodiesGrid || version !== this.bodiesVersion;
        if (!this.bodies || grid !== this.bodiesGrid || (stale && this.steps - this.bodiesStep >= STEPS_PER_BODIES)) {
            this.bodies = waterBodiesOf(grid);
            this.bodiesGrid = grid;
            this.bodiesVersion = version;
            this.bodiesStep = this.steps;
        }
        const now = this.now();
        this.since ??= now;
        const lifeSettings = { ...DEFAULT_LIFE_SETTINGS, ...settings };
        try {
            this.hooks.beforeStep?.({
                animals: this.population.animals,
                bodies: this.bodies,
                maxSpeedPxPerS: lifeSettings.maxSpeed * TILE_PX,
                now,
            });
        } catch (error) {
            console.error("What follows the life of the water of the map failed", error);
        }
        const tally = stepPopulation(
            this.population,
            grid,
            this.bodies,
            lifeSettings,
            LIFE_STEP_MS,
            now,
            this.random,
            this.avatars(),
            this.bySpecies,
        );
        this.totals.arrivals += tally.arrivals;
        this.totals.births += tally.births;
        this.totals.diedOfAge += tally.diedOfAge;
        this.totals.eaten += tally.eaten;
        this.totals.diedDry += tally.diedDry;
        this.totals.predatorBirths += tally.predatorBirths;
        this.totals.predatorDeaths += tally.predatorDeaths;
        // The history keeps a sample every few seconds only.
        const counts: Partial<Record<SpeciesId, number>> = {};
        for (const animal of this.population.animals) counts[animal.kind] = (counts[animal.kind] ?? 0) + 1;
        let predators = 0;
        for (const species of SPECIES_IDS) if (isPredator(SPECIES[species])) predators += counts[species] ?? 0;
        const sample = { at: now, prey: this.population.animals.length - predators, predators, counts };
        this.history.add(sample);
        this.ranges.add(sample);
        this.steps++;
        // Once a second, with the message: the waters as the life sees them.
        if (this.steps % STEPS_PER_MESSAGE === 0) {
            this.census = lifeCensus(this.population, this.bodies);
            this.speciesNow = speciesCensus(this.population, this.bodies);
            this.tell();
        }
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
    }

    /** All the animals of the room, for a player who joins it. Undefined when there is none. */
    public snapshot(): AquaticLifeMessage | undefined {
        return this.population.animals.length > 0 ? this.message(true) : undefined;
    }

    /** The figures of each species that lives in the room, has room to, or ever did. */
    private speciesStats(): AquaticSpeciesStatsMessage[] {
        const stats: AquaticSpeciesStatsMessage[] = [];
        for (const species of SPECIES_IDS) {
            // Who lives is counted now: the census is a second old, and empty right after a restart.
            let males = 0;
            let females = 0;
            for (const animal of this.population.animals) {
                if (animal.kind !== species) continue;
                if (animal.sex === "female") females++;
                else males++;
            }
            const cap = this.speciesNow.find((entry) => entry.species === species)?.cap ?? 0;
            const tally = this.bySpecies[species];
            const meals = countsOnWire(tally?.meals);
            const happened =
                tally !== undefined &&
                (meals.length > 0 ||
                    tally.arrivals + tally.births + tally.diedOfAge + tally.eaten + tally.starved + tally.diedDry > 0);
            if (males + females === 0 && cap === 0 && !happened) continue;
            stats.push({
                species: SPECIES_WIRE[species],
                males,
                females,
                cap,
                arrivals: tally?.arrivals ?? 0,
                births: tally?.births ?? 0,
                diedOfAge: tally?.diedOfAge ?? 0,
                eaten: tally?.eaten ?? 0,
                starved: tally?.starved ?? 0,
                diedDry: tally?.diedDry ?? 0,
                meals,
            });
        }
        return stats;
    }

    /** All the animals and the figures of the life; with its history for a player who joins. */
    private message(withHistory = false): AquaticLifeMessage {
        return {
            animals: this.population.animals.map((animal) => ({
                id: animal.id,
                kind: kindOnWire(animal),
                x: Math.round(animal.x),
                y: Math.round(animal.y),
            })),
            species: this.speciesStats(),
            stats: {
                since: this.since ?? this.now(),
                ...this.totals,
                ...this.census,
                history: withHistory ? this.history.samples.map(sampleOnWire) : [],
                historyStepMs: this.history.stepMs,
                ranges: withHistory
                    ? LIFE_RANGES.map((range) => ({
                          name: range.name,
                          samples: this.ranges.samples(range.name).map(sampleOnWire),
                      }))
                    : [],
            },
        };
    }

    /** Tells the room all its animals; nothing while there is none, but once when the last one went. */
    private tell(): void {
        const message = this.message();
        if (message.animals.length === 0 && !this.toldSome) return;
        this.toldSome = message.animals.length > 0;
        this.room.sendSubMessageToRoom({ message: { $case: "aquaticLifeMessage", aquaticLifeMessage: message } });
    }

    private save(emptied = false): void {
        if (!this.store || (this.population.animals.length === 0 && !emptied)) return;
        const state = JSON.stringify({
            animals: this.population.animals,
            nextId: this.population.nextId,
            since: this.since,
            totals: this.totals,
            bySpecies: this.bySpecies,
            history: this.history.save(),
            ranges: this.ranges.save(),
        });
        this.store.repository
            .saveVariable(this.hashKey(), "state", state)
            .catch((error) => console.error("Could not save the life of the water of the map", error));
    }

    private tellStopped(emptied: boolean): void {
        try {
            this.hooks.stopped?.(emptied);
        } catch (error) {
            console.error("What follows the life of the water of the map failed", error);
        }
    }

    private clearTimer(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    private hashKey(): string {
        return `aquatic-life:${this.store?.roomUrl ?? ""}`;
    }
}
