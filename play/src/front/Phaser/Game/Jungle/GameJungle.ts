import * as Phaser from "phaser";
import { get } from "svelte/store";
import type { Unsubscriber } from "svelte/store";
import type { Subscription } from "rxjs";
import { LL } from "../../../../i18n/i18n-svelte";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { jungleVolumeStore } from "../../../Stores/SoundEffectsStore";
import type { Character } from "../../Entity/Character";
import { CHARACTER_BODY_HEIGHT, CHARACTER_BODY_OFFSET_Y } from "../../Entity/Character";
import type { GameScene } from "../GameScene";
import { InteractionPrompt } from "../Water/InteractionPrompt";
import type { WanderingCharactersManager } from "../Wander/WanderingCharactersManager";
import type { Point } from "../Wander/WanderSchedule";
import { encodeJungleCompanion } from "./JungleCompanionProtocol";
import { JungleCompanions } from "./JungleCompanions";
import { loadJungleSounds, playJungleSound } from "./JungleCries";
import { JungleManager } from "./JungleManager";
import type { JunglePrefab } from "./JunglePlan";

const REFRESH_INTERVAL_MS = 500;

/** The feet of a character, like Player.getFeet: what the companions follow. */
function feetOf(character: Character): Point {
    return { x: character.x, y: character.y + CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_Y };
}

/**
 * The jungle of a game scene: reads the map for the JungleManager twice a second, hands its animals to the
 * wandering characters, plays their calls every frame, and lets the players tame them (see JungleCompanions). One per WanderingCharactersManager: destroy it before
 * that one.
 */
export class GameJungle {
    private readonly manager: JungleManager;
    // The prefabs of the loaded collections, kept from their store rather than rebuilt twice a second.
    private loadedPrefabs: JunglePrefab[] = [];
    private readonly unsubscribePrefabs: Unsubscriber;
    private readonly timer: Phaser.Time.TimerEvent;
    private readonly companions: JungleCompanions;
    private readonly companionEvents: Subscription | undefined;
    private readonly tamePrompt: InteractionPrompt;
    private readonly releasePrompt: InteractionPrompt;
    private readonly updateListener = (): void => {
        const now = Date.now();
        this.manager.update(now);
        this.companions.update(now);
    };

    constructor(
        private readonly scene: GameScene,
        wanderers: WanderingCharactersManager,
    ) {
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
            {
                listener: () =>
                    scene.CurrentPlayer ? { x: scene.CurrentPlayer.x, y: scene.CurrentPlayer.y } : undefined,
                pose: (animalId) => wanderers.freeCharacterPose(animalId),
                hidden: () => document.hidden,
                volume: () => get(jungleVolumeStore),
                play: (key, volume) => {
                    // The same guards as the other sound effects (see NerfManager.playPop).
                    if (localUserStore.getBlockAudio() || scene.sound.locked) return;
                    playJungleSound(scene.sound, scene.cache.audio, key, volume);
                },
            },
        );
        this.tamePrompt = new InteractionPrompt(scene, "jungle-tame", () => get(LL).trigger.jungleTame());
        this.releasePrompt = new InteractionPrompt(scene, "jungle-release", () => get(LL).trigger.jungleRelease());
        const playerOf = (userId: number): Character | undefined =>
            userId === scene.connection?.getUserId() ? scene.CurrentPlayer : scene.MapPlayersByKey.get(userId);
        this.companions = new JungleCompanions({
            localUserId: () => scene.connection?.getUserId(),
            playerFeet: (userId) => {
                const player = playerOf(userId);
                return player ? feetOf(player) : undefined;
            },
            playerInWater: (userId) => playerOf(userId)?.isInWater() ?? false,
            animals: () => this.manager.animals,
            animalPose: (id) => wanderers.freeCharacterPose(id),
            editorOpen: () => get(mapEditorModeStore),
            serverNow: () => scene.getServerDate()?.getTime() ?? Date.now(),
            send: (message) => {
                const { name, data } = encodeJungleCompanion(message);
                scene.connection?.emitScriptableEvent(name, data, undefined).catch((error) => {
                    console.warn("Could not send a jungle companion event", error);
                });
            },
            setLead: (id, lead) => wanderers.setFreeCharacterLead(id, lead),
            showPrompt: (kind, action) => (kind === "tame" ? this.tamePrompt : this.releasePrompt).show(action),
            hidePrompt: () => {
                this.tamePrompt.hide();
                this.releasePrompt.hide();
            },
        });
        this.companionEvents = scene.connection?.receivedEventMessageStream.subscribe(({ name, data, senderId }) =>
            this.companions.receive(senderId, name, data, Date.now()),
        );
        // Not in the preload of the scene: there, a missing file would show the network error screen.
        loadJungleSounds(scene.load, scene.cache.audio);
        scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateListener);
        this.timer = scene.time.addEvent({
            delay: REFRESH_INTERVAL_MS,
            loop: true,
            callback: () => this.manager.refresh(),
        });
    }

    public destroy(): void {
        this.companionEvents?.unsubscribe();
        this.companions.destroy();
        this.timer.remove();
        this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateListener);
        this.unsubscribePrefabs();
        this.manager.destroy();
    }
}
