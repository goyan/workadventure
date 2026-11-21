import {
    Animal,
    DEFAULT_LIFE_SETTINGS,
    delayAnimal,
    emptyLifeTally,
    emptyPopulation,
    isPredator,
    landPlacesOf,
    landTreesOf,
    landWallsOf,
    bridgeTilesOf,
    dryOnBridges,
    lifeCensus,
    LIFE_RANGES,
    LifeHistory,
    LifeRanges,
    LIFE_STEP_MS,
    SPECIES,
    SPECIES_IDS,
    SPECIES_WIRE,
    speciesCensus,
    leadTamed,
    releaseAnimals,
    stepPopulation,
    tameAnimal,
    waterBodiesOf,
    poolCells,
    WaterGrid as LifeWaterGrid,
    wireKindOf,
} from "@workadventure/map-editor";
import type {
    LifeCensus,
    LifeFire,
    LifeSample,
    LifeTally,
    Places,
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

/**
 * The time a room missed while it was empty that its life lives again, step by step (ms): two lives of a fish. What it
 * missed beyond is not lived: its animals are delayed by it (delayAnimal), not killed by an age they did not live.
 */
const CATCH_UP_MAX_MS = 30 * 60 * 1000;
/** The steps of the missed time lived at each step of the timer: about 90 ms of a full room (0.76 ms a step). */
const CATCH_UP_STEPS_A_TICK = 120;
/** A room empty for less than this lives no missed time (ms). */
const CATCH_UP_FROM_MS = 60_000;

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

/** How an animal is told to the room: 1 a gull in flight, 2 a gull landed, 3 a land animal that drinks. */
function wireStateOf(animal: Animal): number | undefined {
    if (animal.kind === "gull") return animal.perchedAt !== undefined ? 2 : 1;
    return animal.drinkUntil !== undefined && animal.tamedBy === undefined ? 3 : undefined;
}

/** A player is answered this many times a second when they ask to tame an animal. */
const TAME_ASKS_A_SECOND = 5;

const SavedLife = z.object({
    animals: z.array(Animal).max(1000),
    nextId: z.number().int().min(1),
    // Absent from a state saved before the totals were kept.
    since: z.number().finite().optional(),
    // When it was saved; absent from a state saved before the life caught up with the time the room was empty.
    at: z.number().finite().optional(),
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

/** The land is read again this often at most while the water on it moves (the walls are read at once). */
const STEPS_PER_LAND = 10;
/** The water of a map that has none: the life of the land goes on without it. */
const NO_WATER = new LifeWaterGrid(undefined, undefined);
const NO_BODIES = waterBodiesOf(NO_WATER);
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
    /** The cells of the pools of the map, read again when the relief or the styles of the pools change. */
    private pools: { terrain: unknown; styles: unknown; cells: Set<string> } | undefined;
    private bodiesStep = -Infinity;
    /** The outdoor land of the map, for the animals that walk; undefined while the land is off or its size unknown. */
    private land: Places | undefined;
    private landKey = "";
    private landVersion = -1;
    private landStep = -Infinity;
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
    /** The time missed while the room was empty, being lived again: from `at` to `to`. */
    private catchUp: { at: number; to: number } | undefined;
    /** The moment being lived again, while it catches up. */
    private replayAt: number | undefined;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly water: LifeWater,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        private readonly random: () => number = Math.random,
        /** Where the avatars the animals fear stand, in map pixels (those on the ground). */
        private readonly avatars: () => readonly { x: number; y: number }[] = () => [],
        /** The size of the map in cells of the relief (16 px), once its Tiled map is read. */
        private readonly mapSize: () => { width: number; height: number } | undefined = () => undefined,
        /**
         * Where a player of the room stands, in map pixels, and whether on the ground; undefined once they left:
         * the animals they tamed follow them, and are let go when they go.
         */
        private readonly masterAt: (userId: number) => { x: number; y: number; ground: boolean } | undefined = () =>
            undefined,
        private readonly hooks: LifeHooks = {},
    ) {}

    /** When each player last asked to tame an animal, to answer them TAME_ASKS_A_SECOND times a second at most. */
    private readonly tameAsks = new Map<number, number[]>();

    /**
     * A player asks for an animal near them (see tameAnimal for what is refused). The room is told at once when it
     * is theirs: the animal stops where it is on every screen, and follows them.
     */
    public tame(userId: number, animalId: number): boolean {
        const now = this.now();
        const asks = (this.tameAsks.get(userId) ?? []).filter((at) => now - at < 1000);
        if (asks.length >= TAME_ASKS_A_SECOND) return false;
        asks.push(now);
        this.tameAsks.set(userId, asks);
        if (this.room.getWam()?.settings?.life?.landEnabled !== true) return false;
        const master = this.masterAt(userId);
        if (!master || !master.ground) return false;
        if (tameAnimal(this.population, animalId, { id: userId, x: master.x, y: master.y }) !== undefined) return false;
        this.tell();
        return true;
    }

    /** A player lets go one of their animals, or all of them (also when they leave the room). */
    public release(userId: number, animalId?: number): void {
        this.tameAsks.delete(userId);
        if (releaseAnimals(this.population, userId, animalId) > 0) this.tell();
    }

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
            // A user id lasts as long as a connection: nobody is the master of an animal saved before a restart.
            for (const animal of saved.animals) animal.tamedBy = undefined;
            this.population = {
                animals: saved.animals,
                nextId: saved.nextId,
                seeded: true,
                dolphinsSeeded: true,
                landSeeded: true,
            };
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
            this.catchUpFrom(saved.at);
        } catch (error) {
            console.error("Could not restore the life of the water of the map", error);
        }
    }

    public start(): void {
        this.mapChanged();
    }

    /** Whether the life is still living the time the room missed. */
    public catchingUp(): boolean {
        return this.catchUp !== undefined;
    }

    /**
     * The room was empty since `savedAt`: its life lives the last CATCH_UP_MAX_MS of that time again, its animals
     * delayed by what came before. The populations stay what the rules make them (the caps of the species), however
     * long the absence.
     */
    private catchUpFrom(savedAt: number | undefined): void {
        const now = this.now();
        if (savedAt === undefined || now - savedAt < CATCH_UP_FROM_MS) return;
        const skipped = Math.max(0, now - savedAt - CATCH_UP_MAX_MS);
        if (skipped > 0) for (const animal of this.population.animals) delayAnimal(animal, skipped);
        this.catchUp = { at: savedAt + skipped, to: now };
    }

    /**
     * A slice of the missed time, lived step by step: nobody on the map (no avatar to fear, no fisher, no master), no
     * fire, nothing told nor saved until it is done.
     */
    private stepCatchUp(): void {
        const catchUp = this.catchUp;
        if (!catchUp) return;
        try {
            for (let step = 0; step < CATCH_UP_STEPS_A_TICK && catchUp.at < catchUp.to; step++) {
                this.replayAt = catchUp.at;
                this.step();
                catchUp.at += LIFE_STEP_MS;
            }
        } finally {
            this.replayAt = undefined;
        }
        if (catchUp.at < catchUp.to) return;
        this.catchUp = undefined;
        this.census = lifeCensus(this.population, this.bodies ?? NO_BODIES);
        this.tell();
        this.save();
    }

    public stop(): void {
        this.clearTimer();
        this.save();
    }

    /** The map of the room changed (or was just read): the life follows its settings, its water and its walls. */
    public mapChanged(): void {
        const settings = this.room.getWam()?.settings?.life;
        const water = settings?.enabled === true;
        const land = settings?.landEnabled === true;
        if (!water && !land) {
            // Turned off, the map is emptied: turned on again, its life starts over.
            const had = this.population.animals.length > 0;
            this.population = emptyPopulation();
            this.totals = emptyLifeTally();
            this.bySpecies = {};
            this.speciesNow = [];
            this.since = undefined;
            this.history.clear();
            this.ranges.clear();
            this.land = undefined;
            this.clearTimer();
            this.tellStopped(true);
            if (had || this.toldSome) {
                this.tell();
                this.save(true);
            }
            return;
        }
        // The animals of a habitat that was turned off go; the others stay.
        const before = this.population.animals.length;
        // The gulls live off the water: they go with it, and when they are switched off.
        const gulls = water && settings?.gullsEnabled === true;
        this.population.animals = this.population.animals.filter((animal) => {
            const { habitat } = SPECIES[animal.kind];
            return habitat === "land" ? land : habitat === "air" ? gulls : water;
        });
        if (!land) {
            if (!gulls) this.land = undefined;
            this.population.landSeeded = false;
        }
        if (!gulls) this.population.gullsSeeded = false;
        if (!water) {
            this.population.seeded = false;
            this.population.dolphinsSeeded = false;
        }
        // The walls may have changed: the land is read again at the next step.
        this.landKey = "";
        if (this.population.animals.length !== before) {
            this.tell();
            this.save(true);
        }
        let grid: WaterGrid | undefined;
        try {
            grid = this.water.getGrid();
        } catch (error) {
            console.error("Could not read the water of the map for its life", error);
        }
        if ((land || grid) && !this.timer) {
            this.timer = setInterval(() => this.tick(), LIFE_STEP_MS);
            // The life of a room must never keep the process alive.
            this.timer.unref?.();
        } else if (!land && !grid) {
            this.clearTimer();
            this.tellStopped(false);
        }
    }

    /** The outdoor land as the walls, the size of the map and the water on it make it. */
    private readLand(grid: WaterGrid | undefined): void {
        const size = this.mapSize();
        if (!size) {
            this.land = undefined;
            return;
        }
        const walls = landWallsOf(this.room.getWam());
        // The trees the lions and the tigers live around.
        const trees = landTreesOf(this.room.getWam());
        // The bridges of the map: what walks crosses the water on their decks.
        const bridges = bridgeTilesOf(this.room.getWam());
        const key = `${size.width}x${size.height}|${walls.signature}|${trees.map((tree) => `${tree.x},${tree.y}`).join(";")}|${[...bridges].sort().join(";")}`;
        const version = grid ? this.water.waterVersion() : -1;
        const stale = version !== this.landVersion && this.steps - this.landStep >= STEPS_PER_LAND;
        if (this.land && key === this.landKey && !stale) return;
        this.land = landPlacesOf({
            width: size.width,
            height: size.height,
            walls,
            depthAt: grid ? dryOnBridges((cellX, cellY) => grid.depthAt(cellX, cellY), bridges) : () => 0,
            trees,
        });
        this.landKey = key;
        this.landVersion = version;
        this.landStep = this.steps;
    }

    /** A step from the timer: a failure stops the life of the room until its map changes, never the server. */
    private tick(): void {
        try {
            if (this.catchUp) this.stepCatchUp();
            else this.step();
        } catch (error) {
            console.error("The life of the water of the map stopped", error);
            this.clearTimer();
        }
    }

    /** Whether a cell is in a pool: treated water, no fish in it (waterBodiesOf). */
    private poolCellsNow(): (cellX: number, cellY: number) => boolean {
        const wam = this.room.getWam();
        const terrain = wam?.terrain;
        const styles = wam?.settings?.pools;
        if (!this.pools || this.pools.terrain !== terrain || this.pools.styles !== styles) {
            const cells = new Set(poolCells(terrain, styles).map((cell) => `${cell.cellX},${cell.cellY}`));
            this.pools = { terrain, styles, cells };
        }
        const { cells } = this.pools;
        return (cellX, cellY) => cells.has(`${cellX},${cellY}`);
    }

    /** One step of the life (two a second), and once a second the room is told. */
    public step(): void {
        const grid = this.water.getGrid();
        const settings = this.room.getWam()?.settings?.life;
        const water = settings?.enabled === true && grid !== undefined;
        const onLand = settings?.landEnabled === true;
        if (!water && !onLand) return;
        if (!grid) {
            this.bodies = NO_BODIES;
            this.bodiesGrid = undefined;
        } else {
            const version = this.water.waterVersion();
            const stale = grid !== this.bodiesGrid || version !== this.bodiesVersion;
            if (
                !this.bodies ||
                grid !== this.bodiesGrid ||
                (stale && this.steps - this.bodiesStep >= STEPS_PER_BODIES)
            ) {
                this.bodies = waterBodiesOf(grid, this.poolCellsNow());
                this.bodiesGrid = grid;
                this.bodiesVersion = version;
                this.bodiesStep = this.steps;
            }
        }
        // The gulls land on the shores of the land: it is read for them too.
        const gulls = water && settings?.gullsEnabled === true;
        if (onLand || gulls) this.readLand(grid);
        else this.land = undefined;
        const replaying = this.replayAt !== undefined;
        const now = this.replayAt ?? this.now();
        this.since ??= now;
        // The tamed animals go with their masters; those whose master left are free again.
        if (!replaying) leadTamed(this.population, this.masterAt, this.land);
        const lifeSettings = { ...DEFAULT_LIFE_SETTINGS, ...settings, enabled: water };
        try {
            if (!replaying)
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
            grid ?? NO_WATER,
            this.bodies,
            lifeSettings,
            LIFE_STEP_MS,
            now,
            this.random,
            replaying ? [] : this.avatars(),
            this.bySpecies,
            this.land,
            replaying ? undefined : this.fire?.(),
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
        if (replaying) return;
        // Once a second, with the message: the waters as the life sees them.
        if (this.steps % STEPS_PER_MESSAGE === 0) {
            this.census = lifeCensus(this.population, this.bodies);
            this.speciesNow = speciesCensus(this.population, this.bodies, onLand ? this.land : undefined, gulls);
            this.tell();
        }
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
    }

    /** Where the animals of the land are, in map pixels: the presence sensors of the map sense them. */
    public landAnimals(): { x: number; y: number }[] {
        const positions: { x: number; y: number }[] = [];
        for (const animal of this.population.animals) {
            if (SPECIES[animal.kind].habitat === "land") positions.push({ x: animal.x, y: animal.y });
        }
        return positions;
    }

    /** The fire of the map as the animals see it, when the map has one to give; undefined while nothing burns. */
    private fire: (() => LifeFire | undefined) | undefined;

    /** The animals of the land run from this fire, and the gulls do not land beside it. */
    public followFire(fire: () => LifeFire | undefined): void {
        this.fire = fire;
    }

    /** Where the animals that graze are, in map pixels: the free antelopes eat the grass of the meadow under them. */
    public grazers(): { x: number; y: number }[] {
        const positions: { x: number; y: number }[] = [];
        for (const animal of this.population.animals) {
            if (animal.kind === "antelope" && animal.tamedBy === undefined) {
                positions.push({ x: animal.x, y: animal.y });
            }
        }
        return positions;
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
                kind: wireKindOf(animal.kind, animal.sex ?? "male"),
                x: Math.round(animal.x),
                y: Math.round(animal.y),
                owner: animal.tamedBy,
                // 3: head down at the water.
                state: wireStateOf(animal),
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
            at: this.catchUp ? this.catchUp.at : this.now(),
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
