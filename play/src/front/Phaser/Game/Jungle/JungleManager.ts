import type { Unsubscriber } from "svelte/store";
import { jungleEnabledStore } from "../../../Stores/JungleStore";
import type { Point, WanderMap } from "../Wander/WanderSchedule";
import { JUNGLE_MAX_VOLUME, JungleCryGate, jungleCryLeg, jungleCryVolume, jungleSoundKey } from "./JungleCries";
import type { JungleSoundKey } from "./JungleCries";
import { isJungleMarker, isJungleTree, jungleSpecies, parisDay, planJungle } from "./JunglePlan";
import type { JungleAnimal, JunglePrefab, JungleTree } from "./JunglePlan";
import { outdoorWanderMap } from "./JungleWanderMap";

/** Everything the jungle reads from the game: injected, so that it is tested without Phaser. */
export interface JungleSource {
    placedEntities(): Iterable<{
        id: string;
        prefab: JunglePrefab;
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
    /** Every prefab of the loaded collections. */
    loadedPrefabs(): Iterable<JunglePrefab>;
    outdoor(): { isOutdoorAt(x: number, y: number): boolean } | undefined;
    /** Changes each time the outdoor grid is recomputed. */
    outdoorVersion(): number;
    /** The map of the placed animals (collisions, walls, locked areas). */
    wanderMap(): WanderMap;
    tileSize(): number;
    now(): Date;
    /** Whether the server runs the lions and the tigers of this map itself (the life of the land): no draw then. */
    simulated?(): boolean;
}

/** What the calls need from the game: injected too. */
export interface JungleHearing {
    /** Where the local player is, undefined before they exist. */
    listener(): Point | undefined;
    /** Where an animal is shown, undefined while it is not. */
    pose(animalId: string): { x: number; y: number; moving: boolean } | undefined;
    /** The tab is hidden: nothing is heard. */
    hidden(): boolean;
    /** The animal was tamed and follows its master: it does not call (it would call next to them, even indoors). */
    led(animalId: string): boolean;
    /** The personal volume of the jungle calls, from 0 to 1. */
    volume(): number;
    play(key: JungleSoundKey, volume: number): void;
}

/**
 * Lights the jungle up on a map where a jungle marker is placed: the animals drawn by planJungle around the outdoor
 * trees are handed to `apply` (the wandering characters), with a map that keeps them outdoors. Nothing is applied
 * again while the plan and the outdoor grid stay the same.
 */
export class JungleManager {
    private applied: JungleAnimal[] = [];
    private appliedKey = "";
    private map: WanderMap | undefined;
    private mapVersion: number | undefined;
    private enabled = true;
    private readonly unsubscribeEnabled: Unsubscriber;
    private readonly cryGate = new JungleCryGate();

    constructor(
        private readonly source: JungleSource,
        private readonly apply: (animals: JungleAnimal[], map: WanderMap) => void,
        private readonly hearing?: JungleHearing,
    ) {
        this.unsubscribeEnabled = jungleEnabledStore.subscribe((enabled) => {
            this.enabled = enabled;
        });
    }

    public get animals(): readonly JungleAnimal[] {
        return this.applied;
    }

    /** Called twice a second: computes the plan again, applies it only when it changed. */
    public refresh(): void {
        const plan = this.plan();
        if (!plan) {
            this.clear();
            return;
        }
        const { animals, map } = plan;
        const key = JSON.stringify(animals);
        if (key === this.appliedKey && map === this.map) {
            return;
        }
        this.applied = animals;
        this.appliedKey = key;
        this.map = map;
        this.cryGate.keepOnly(new Set(animals.map((animal) => animal.id)));
        this.apply(animals, map);
    }

    /**
     * Called every frame: an animal standing still in a leg that has a call (the same legs for every client) calls
     * out, heard up to 12 tiles away, at most once every 20 seconds for this player.
     */
    public update(nowMs: number): void {
        const hearing = this.hearing;
        if (!hearing || this.applied.length === 0 || hearing.hidden()) return;
        const listener = hearing.listener();
        if (!listener) return;
        for (const animal of this.applied) {
            const leg = jungleCryLeg(animal.id, nowMs);
            if (leg === undefined || hearing.led(animal.id)) continue;
            const key = jungleSoundKey(animal.sheetPath);
            if (!key) continue;
            const pose = hearing.pose(animal.id);
            if (!pose || pose.moving) continue;
            const volume =
                jungleCryVolume(Math.hypot(pose.x - listener.x, pose.y - listener.y)) *
                JUNGLE_MAX_VOLUME *
                hearing.volume();
            if (volume <= 0 || !this.cryGate.shouldPlay(animal.id, leg, nowMs)) continue;
            hearing.play(key, volume);
        }
    }

    public destroy(): void {
        this.unsubscribeEnabled();
        this.clear();
    }

    private plan(): { animals: JungleAnimal[]; map: WanderMap } | undefined {
        if (!this.enabled || this.source.simulated?.() === true) return undefined;
        const trees: JungleTree[] = [];
        let marked = false;
        for (const entity of this.source.placedEntities()) {
            if (isJungleMarker(entity.prefab)) {
                marked = true;
            } else if (isJungleTree(entity.prefab.id)) {
                trees.push({
                    id: entity.id,
                    foot: { x: entity.x + entity.width / 2, y: entity.y + entity.height - 1 },
                });
            }
        }
        if (!marked) return undefined;
        const species = jungleSpecies(this.source.loadedPrefabs());
        if (species.length === 0) return undefined;
        const outdoor = this.source.outdoor();
        if (!outdoor) return undefined;
        const base = this.source.wanderMap();
        const isOutdoor = (x: number, y: number): boolean => outdoor.isOutdoorAt(x, y);
        const animals = planJungle({
            trees,
            species,
            day: parisDay(this.source.now()),
            isOutdoor,
            isWalkable: (tile) => base.isWalkable(tile),
        });
        if (animals.length === 0) return undefined;
        // A new outdoor grid is a new map: the animals compute their walks again on it.
        const version = this.source.outdoorVersion();
        const map =
            this.map && this.mapVersion === version
                ? this.map
                : outdoorWanderMap(base, isOutdoor, this.source.tileSize());
        this.mapVersion = version;
        return { animals, map };
    }

    private clear(): void {
        if (this.applied.length === 0 || !this.map) return;
        this.applied = [];
        this.appliedKey = "";
        this.apply([], this.map);
    }
}
