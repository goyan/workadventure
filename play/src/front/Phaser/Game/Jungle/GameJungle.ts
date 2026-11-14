import type * as Phaser from "phaser";
import type { Unsubscriber } from "svelte/store";
import type { GameScene } from "../GameScene";
import type { WanderingCharactersManager } from "../Wander/WanderingCharactersManager";
import { JungleManager } from "./JungleManager";
import type { JunglePrefab } from "./JunglePlan";

const REFRESH_INTERVAL_MS = 500;

/**
 * The jungle of a game scene: reads the map for the JungleManager twice a second and hands its animals to the
 * wandering characters. One per WanderingCharactersManager: destroy it before that one.
 */
export class GameJungle {
    private readonly manager: JungleManager;
    // The prefabs of the loaded collections, kept from their store rather than rebuilt twice a second.
    private loadedPrefabs: JunglePrefab[] = [];
    private readonly unsubscribePrefabs: Unsubscriber;
    private readonly timer: Phaser.Time.TimerEvent;

    constructor(scene: GameScene, wanderers: WanderingCharactersManager) {
        const gameMapFrontWrapper = scene.getGameMapFrontWrapper();
        this.unsubscribePrefabs = scene
            .getEntitiesCollectionsManager()
            .getEntitiesPrefabsVariantStore()
            .subscribe((variants) => {
                // One prefab per object of the library: the species and the marker only differ by object.
                this.loadedPrefabs = variants.map((variant) => variant.defaultPrefab);
            });
        this.manager = new JungleManager(
            {
                placedEntities: () =>
                    Array.from(gameMapFrontWrapper.getEntitiesManager().getEntities(), ([id, entity]) => ({
                        id,
                        prefab: entity.getPrefab(),
                        x: entity.x,
                        y: entity.y,
                        width: entity.displayWidth,
                        height: entity.displayHeight,
                    })),
                loadedPrefabs: () => this.loadedPrefabs,
                outdoor: () => scene.getOutdoorGrid(),
                outdoorVersion: () => scene.getOutdoorVersion(),
                wanderMap: () => wanderers.getWanderMap(),
                tileSize: () => gameMapFrontWrapper.getTileDimensions().width,
                // The clock of the wandering characters: the day changes at the same time as their walks.
                now: () => new Date(),
            },
            (animals, map) => wanderers.setFreeCharacters(animals, map),
        );
        this.timer = scene.time.addEvent({
            delay: REFRESH_INTERVAL_MS,
            loop: true,
            callback: () => this.manager.refresh(),
        });
    }

    public destroy(): void {
        this.timer.remove();
        this.unsubscribePrefabs();
        this.manager.destroy();
    }
}
