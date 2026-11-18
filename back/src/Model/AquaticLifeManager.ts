import {
    Animal,
    DEFAULT_LIFE_SETTINGS,
    emptyLifeTally,
    emptyPopulation,
    lifeCensus,
    LifeHistory,
    LIFE_STEP_MS,
    stepPopulation,
    waterBodiesOf,
} from "@workadventure/map-editor";
import type { LifeCensus, LifeTally, Population, WaterBodies, WaterGrid } from "@workadventure/map-editor";
import type { AquaticLifeMessage } from "@workadventure/messages";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";

/** The room is told its animals once a second (every second step). */
const STEPS_PER_MESSAGE = 2;
/** The animals are saved every half minute while they live. */
const STEPS_PER_SAVE = 60;
/** The bodies of water are read again once a second at most, and only when the water changed. */
const STEPS_PER_BODIES = 2;

const SavedLife = z.object({
    animals: z.array(Animal).max(1000),
    nextId: z.number().int().min(1),
    // Absent from a state saved before the totals were kept.
    since: z.number().finite().optional(),
    history: z.unknown().optional(),
    totals: z
        .object({
            arrivals: z.number().int().min(0),
            births: z.number().int().min(0),
            diedOfAge: z.number().int().min(0),
            eaten: z.number().int().min(0),
            diedDry: z.number().int().min(0),
        })
        .optional(),
});

/** What the life needs of the water of the room: its grid, and a number that changes whenever the water does. */
export interface LifeWater {
    getGrid(): WaterGrid | undefined;
    waterVersion(): number;
}

const kindOnWire = (animal: Animal): number => (animal.kind === "dolphin" ? 2 : animal.sex === "female" ? 1 : 0);

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
    private since: number | undefined;
    /** The prey and the predators over the whole life of the map, for the curve of its dashboard. */
    private history = new LifeHistory();
    private census: LifeCensus = { habitableBodies: 0, populatedBodies: 0, capacity: 0 };
    /** Whether the room was last told some animals: it is told once more when none is left. */
    private toldSome = false;

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly water: LifeWater,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        private readonly random: () => number = Math.random,
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
            this.population = { animals: saved.animals, nextId: saved.nextId, seeded: true };
            this.totals = saved.totals ?? emptyLifeTally();
            this.since = saved.since;
            this.history = LifeHistory.from(saved.history);
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
            this.since = undefined;
            this.history.clear();
            this.clearTimer();
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
        const tally = stepPopulation(
            this.population,
            grid,
            this.bodies,
            { ...DEFAULT_LIFE_SETTINGS, ...settings },
            LIFE_STEP_MS,
            now,
            this.random,
        );
        this.totals.arrivals += tally.arrivals;
        this.totals.births += tally.births;
        this.totals.diedOfAge += tally.diedOfAge;
        this.totals.eaten += tally.eaten;
        this.totals.diedDry += tally.diedDry;
        // The history keeps a sample every few seconds only.
        let predators = 0;
        for (const animal of this.population.animals) if (animal.kind === "dolphin") predators++;
        this.history.add({ at: now, prey: this.population.animals.length - predators, predators });
        this.steps++;
        // Once a second, with the message: the waters as the life sees them.
        if (this.steps % STEPS_PER_MESSAGE === 0) this.census = lifeCensus(this.population, this.bodies);
        if (this.steps % STEPS_PER_MESSAGE === 0) this.tell();
        if (this.steps % STEPS_PER_SAVE === 0) this.save();
    }

    /** All the animals of the room, for a player who joins it. Undefined when there is none. */
    public snapshot(): AquaticLifeMessage | undefined {
        return this.population.animals.length > 0 ? this.message(true) : undefined;
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
            stats: {
                since: this.since ?? this.now(),
                ...this.totals,
                ...this.census,
                history: withHistory ? this.history.samples : [],
                historyStepMs: this.history.stepMs,
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
            history: this.history.save(),
        });
        this.store.repository
            .saveVariable(this.hashKey(), "state", state)
            .catch((error) => console.error("Could not save the life of the water of the map", error));
    }

    private clearTimer(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    private hashKey(): string {
        return `aquatic-life:${this.store?.roomUrl ?? ""}`;
    }
}
