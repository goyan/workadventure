import type { Unsubscriber } from "svelte/store";
import { jungleEnabledStore } from "../../../Stores/JungleStore";
import type { WanderMap } from "../Wander/WanderSchedule";
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

    constructor(
        private readonly source: JungleSource,
        private readonly apply: (animals: JungleAnimal[], map: WanderMap) => void,
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
        this.apply(animals, map);
    }

    public destroy(): void {
        this.unsubscribeEnabled();
        this.clear();
    }

    private plan(): { animals: JungleAnimal[]; map: WanderMap } | undefined {
        if (!this.enabled) return undefined;
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
