import * as Phaser from "phaser";
import { get } from "svelte/store";
import type { Unsubscriber } from "svelte/store";
import type { Subscription } from "rxjs";
import type { AreaData, GobeurPropertyData } from "@workadventure/map-editor";
import { WOKA_SPEED } from "../../../Enum/EnvironmentVariable";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { mapEditorActivated } from "../../../Stores/MenuStore";
import { playersStore } from "../../../Stores/PlayersStore";
import { gobeurAnnounceStore, gobeurGamesStore, gobeurRankingStore } from "../../../Stores/GobeurStore";
import type { GobeurGameView } from "../../../Stores/GobeurStore";
import { PathfindingManager, PathTileType } from "../../../Utils/PathfindingManager";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { blockRectangles } from "../Wander/WanderCollisions";
import { WanderingCharactersManager } from "../Wander/WanderingCharactersManager";
import { GobeurBrain } from "./GobeurBrain";
import type { GobeurBrainMap, GobeurTarget } from "./GobeurBrain";
import { GobeurGame } from "./GobeurGame";
import type { GobeurEffect } from "./GobeurGame";
import { GOBEUR_POS_INTERVAL_MS, decodeGobeurMessage, encodeGobeurMessage } from "./GobeurProtocol";
import type { GobeurMessage, GobeurStartMessage } from "./GobeurProtocol";
import { areaCentre, isInsideArea, isSafe } from "./GobeurSafety";
import type { Point } from "./GobeurSafety";
import { GobeurSheetLoader, GobeurSprite } from "./GobeurSprite";

/** Ticks of the games, checks of the map and of the prison: a few times per second, not every frame. */
const CHECK_INTERVAL_MS = 250;

export type GobeurLaunchResult =
    | { ok: true }
    | { ok: false; reason: "noRight" | "noPrison" | "noPlayer" | "alreadyRunning" };

interface GobeurInstance {
    entityId: string;
    game: GobeurGame;
    // Master only.
    brain: GobeurBrain | undefined;
    lastPosSentAt: number;
    // While the game runs, where this browser shows it.
    sprite: GobeurSprite | undefined;
}

/**
 * Runs the Gobeur games of the scene: one GobeurGame per entity with a gobeurPropertyData. The master computes the
 * Gobeur (GobeurBrain) and broadcasts it through scriptable events; every browser shows it and keeps its own player
 * in the prison once caught. The master never relies on the echo of its own events: it applies its effects locally.
 */
export class GobeurManager {
    private readonly instances = new Map<string, GobeurInstance>();
    private readonly localUuid: string;
    private readonly pathfindingManager: PathfindingManager;
    private readonly tileDimensions: { width: number; height: number };
    private collisionGrid: number[][];
    private readonly brainMap: GobeurBrainMap;
    private readonly sheetLoader: GobeurSheetLoader;
    private readonly eventSubscription: Subscription | undefined;
    private readonly unsubscribePlayers: Unsubscriber;
    private knownPlayerIds = new Set<number>();
    private readonly checkTimer: Phaser.Time.TimerEvent;
    private lastPublished = "";
    private readonly updateListener = (_time: number, delta: number): void => this.update(delta);

    constructor(private readonly scene: GameScene) {
        this.localUuid = localUserStore.getLocalUser()?.uuid ?? "";
        const gameMapFrontWrapper = scene.getGameMapFrontWrapper();
        this.tileDimensions = gameMapFrontWrapper.getTileDimensions();
        this.collisionGrid = gameMapFrontWrapper.getSharedCollisionGrid();
        // Our own pathfinding on the collisions shared by every client, like the wandering characters.
        this.pathfindingManager = new PathfindingManager(this.collisionGrid, this.tileDimensions);
        this.brainMap = {
            isWalkable: (tile) => this.isWalkable(tile),
            findPath: (from, to) => this.findPath(from, to),
        };
        this.sheetLoader = new GobeurSheetLoader(scene);
        const connection = scene.connection;
        this.eventSubscription = connection?.receivedEventMessageStream.subscribe(({ name, data, senderId }) => {
            const message = decodeGobeurMessage(name, data);
            if (!message || senderId === undefined) {
                return;
            }
            const senderUuid =
                senderId === connection.getUserId()
                    ? this.localUuid
                    : (scene.MapPlayersByKey.get(senderId)?.userUuid ?? playersStore.getPlayerById(senderId)?.userUuid);
            if (senderUuid !== undefined) {
                this.receive(message, senderUuid);
            }
        });
        this.knownPlayerIds = new Set(scene.MapPlayersByKey.keys());
        this.unsubscribePlayers = scene.MapPlayersByKey.subscribe((players) => this.onPlayersChanged(players));
        this.checkTimer = scene.time.addEvent({
            delay: CHECK_INTERVAL_MS,
            loop: true,
            callback: () => this.check(),
        });
        scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateListener);
    }

    public launch(entityId: string): Promise<GobeurLaunchResult> {
        return Promise.resolve(this.tryLaunch(entityId));
    }

    private tryLaunch(entityId: string): GobeurLaunchResult {
        if (!get(mapEditorActivated)) {
            return { ok: false, reason: "noRight" };
        }
        if (this.instances.get(entityId)?.game.isRunning) {
            return { ok: false, reason: "alreadyRunning" };
        }
        const entity = this.entity(entityId);
        const property = entity && GobeurManager.propertyOf(entity);
        if (!entity || !property || property.prisonAreaId === "" || !this.area(property.prisonAreaId)) {
            return { ok: false, reason: "noPrison" };
        }
        const present = this.presentUuids();
        // One player, one game.
        const busy = new Set<string>();
        for (const other of this.instances.values()) {
            if (other.game.isRunning) {
                other.game.survivors.forEach((uuid) => busy.add(uuid));
                other.game.caughtOrder.forEach((uuid) => busy.add(uuid));
            }
        }
        const players = property.players
            .map((player) => player.uuid)
            .filter((uuid) => present.includes(uuid) && !busy.has(uuid));
        if (players.length === 0) {
            return { ok: false, reason: "noPlayer" };
        }
        const now = Date.now();
        const start: GobeurStartMessage = {
            kind: "start",
            gameId: crypto.randomUUID(),
            entityId,
            masterUuid: this.localUuid,
            startedAt: now,
            endsAt: now + property.durationSeconds * 1000,
            level: property.level,
            prisonAreaId: property.prisonAreaId,
            fallbackSafeAreaId: property.fallbackSafeAreaId,
            players,
        };
        const instance = this.instanceOf(entityId);
        this.refreshCollisions();
        instance.brain = new GobeurBrain(
            GobeurManager.startOf(entity),
            property.level,
            this.brainMap,
            WOKA_SPEED * 20,
            Math.random,
            this.tileDimensions.width,
        );
        instance.lastPosSentAt = Number.NEGATIVE_INFINITY;
        this.apply(instance, instance.game.startAsMaster(start, present));
        return { ok: true };
    }

    public stop(entityId: string): void {
        const instance = this.instances.get(entityId);
        if (instance) {
            this.apply(instance, instance.game.stop("stopped"));
        }
    }

    /** The Gobeurs on screen open the doors, like the animals (the caller makes them silent). */
    public forEachDoorOpener(callback: (position: Point) => void): void {
        for (const instance of this.instances.values()) {
            if (instance.sprite) {
                const { x, y } = instance.sprite.position;
                callback({ x, y: y - this.tileDimensions.height / 2 });
            }
        }
    }

    public destroy(): void {
        this.eventSubscription?.unsubscribe();
        this.unsubscribePlayers();
        this.checkTimer.remove();
        this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateListener);
        for (const instance of this.instances.values()) {
            this.hideGobeur(instance);
        }
        this.instances.clear();
        this.sheetLoader.destroy();
        gobeurGamesStore.set(new Map());
    }

    private static propertyOf(entity: Entity): GobeurPropertyData | undefined {
        for (const property of entity.getEntityData().properties) {
            if (property.type === "gobeurPropertyData") {
                return property;
            }
        }
        return undefined;
    }

    /** Where the Gobeur starts: the feet of a character standing on the entity, like a wandering character nest. */
    private static startOf(entity: Entity): Point {
        return { x: entity.x + entity.displayWidth / 2, y: entity.y + entity.displayHeight / 2 };
    }

    private entity(entityId: string): Entity | undefined {
        return this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().get(entityId);
    }

    private area(areaId: string): AreaData | undefined {
        return this.scene.getGameMapFrontWrapper().getArea(areaId);
    }

    private instanceOf(entityId: string): GobeurInstance {
        let instance = this.instances.get(entityId);
        if (!instance) {
            instance = {
                entityId,
                game: new GobeurGame(this.localUuid),
                brain: undefined,
                lastPosSentAt: Number.NEGATIVE_INFINITY,
                sprite: undefined,
            };
            this.instances.set(entityId, instance);
        }
        return instance;
    }

    private presentUuids(): string[] {
        const uuids = [this.localUuid];
        for (const player of this.scene.MapPlayersByKey.values()) {
            uuids.push(player.userUuid);
        }
        return uuids;
    }

    private receive(message: GobeurMessage, senderUuid: string): void {
        const now = Date.now();
        if (message.kind === "start") {
            const instance = this.instanceOf(message.entityId);
            this.apply(instance, instance.game.receive(message, senderUuid, now));
            return;
        }
        for (const instance of this.instances.values()) {
            const start = instance.game.currentStart;
            if (start?.gameId !== message.gameId) {
                continue;
            }
            if (message.kind === "pos" && !instance.game.isMaster && senderUuid === start.masterUuid) {
                instance.sprite?.setTarget(message.x, message.y, message.direction, now);
            }
            this.apply(instance, instance.game.receive(message, senderUuid, now));
        }
    }

    private apply(instance: GobeurInstance, effects: GobeurEffect[]): void {
        for (const effect of effects) {
            switch (effect.kind) {
                case "send": {
                    const { name, data } = encodeGobeurMessage(effect.message);
                    this.scene.connection?.emitScriptableEvent(name, data, undefined).catch((error) => {
                        console.warn("Could not send a Gobeur event", error);
                    });
                    break;
                }
                case "teleportToPrison":
                    this.sendToPrison(instance);
                    break;
                case "showRanking":
                    gobeurRankingStore.set({
                        entityId: instance.entityId,
                        ranking: effect.ranking,
                        reason: effect.reason,
                    });
                    break;
                case "announceStart":
                    gobeurAnnounceStore.set({ entityId: instance.entityId, at: Date.now() });
                    break;
                case "ended":
                    this.hideGobeur(instance);
                    break;
            }
        }
        // A follower adopting a game, or a game replaced by an older one: show the Gobeur of the running game.
        if (instance.game.isRunning && !instance.sprite) {
            this.showGobeur(instance);
        }
        if (!instance.game.isMaster) {
            instance.brain = undefined;
        }
        this.publish();
    }

    private showGobeur(instance: GobeurInstance): void {
        const entity = this.entity(instance.entityId);
        if (!entity) {
            // check() interrupts the game.
            return;
        }
        entity.setVisible(false);
        this.scene.getWanderingCharactersManager()?.setSuppressed(instance.entityId, true);
        instance.sprite = new GobeurSprite(this.scene, entity, GobeurManager.startOf(entity), this.sheetLoader);
    }

    private hideGobeur(instance: GobeurInstance): void {
        instance.brain = undefined;
        if (!instance.sprite) {
            return;
        }
        instance.sprite.destroy();
        instance.sprite = undefined;
        this.scene.getWanderingCharactersManager()?.setSuppressed(instance.entityId, false);
        const entity = this.entity(instance.entityId);
        // A wandering entity is shown again by the WanderingCharactersManager; an image not loaded yet shows itself.
        if (
            entity?.active &&
            entity.getPrefab().wander === undefined &&
            entity.texture.key === entity.getPrefab().imagePath
        ) {
            entity.setVisible(true);
        }
        this.scene.markDirty();
    }

    private sendToPrison(instance: GobeurInstance): void {
        const prisonAreaId = instance.game.currentStart?.prisonAreaId;
        const prison = prisonAreaId !== undefined ? this.area(prisonAreaId) : undefined;
        if (prison) {
            const centre = areaCentre(prison);
            this.scene.CurrentPlayer.teleportTo(centre.x, centre.y);
        }
    }

    private onPlayersChanged(players: Map<number, { userUuid: string }>): void {
        const previous = this.knownPlayerIds;
        this.knownPlayerIds = new Set(players.keys());
        for (const [userId, player] of players) {
            if (previous.has(userId)) {
                continue;
            }
            for (const instance of this.instances.values()) {
                if (instance.game.isRunning && instance.game.isMaster) {
                    this.apply(instance, instance.game.playerJoined(player.userUuid));
                }
            }
        }
    }

    /** Every frame: the brain of the master games, the sprites of the others. */
    private update(delta: number): void {
        if (this.instances.size === 0) {
            return;
        }
        const now = Date.now();
        for (const instance of this.instances.values()) {
            const start = instance.game.currentStart;
            if (!start || !instance.sprite) {
                continue;
            }
            if (!instance.game.isMaster || !instance.brain) {
                instance.sprite.interpolate(now);
                continue;
            }
            const result = instance.brain.update(now, delta, this.targets(instance.game.survivors, start));
            instance.sprite.setPose(result.x, result.y, result.direction);
            if (now - instance.lastPosSentAt >= GOBEUR_POS_INTERVAL_MS) {
                instance.lastPosSentAt = now;
                const pos = { x: result.x, y: result.y, direction: result.direction, at: now };
                this.apply(instance, [{ kind: "send", message: { kind: "pos", gameId: start.gameId, ...pos } }]);
            }
            for (const uuid of result.caught) {
                this.apply(instance, instance.game.catchPlayer(uuid, now));
            }
        }
    }

    private targets(survivors: string[], start: GobeurStartMessage): GobeurTarget[] {
        const areas = Array.from(this.scene.getGameMapFrontWrapper().getAreas()?.values() ?? []);
        const positions = new Map<string, Point>();
        positions.set(this.localUuid, { x: this.scene.CurrentPlayer.x, y: this.scene.CurrentPlayer.y });
        for (const player of this.scene.MapPlayersByKey.values()) {
            positions.set(player.userUuid, { x: player.x, y: player.y });
        }
        const targets: GobeurTarget[] = [];
        for (const uuid of survivors) {
            const position = positions.get(uuid);
            if (position) {
                // A character is placed by its center, the Gobeur by its feet.
                targets.push({
                    uuid,
                    x: position.x,
                    y: position.y + this.tileDimensions.height / 2,
                    safe: isSafe(uuid, position, areas, start.fallbackSafeAreaId),
                });
            }
        }
        return targets;
    }

    /** A few times per second: the guards, the clock of the games, the prison of the local player. */
    private check(): void {
        const now = Date.now();
        const present = this.presentUuids();
        for (const instance of this.instances.values()) {
            const start = instance.game.currentStart;
            if (!start) {
                continue;
            }
            const entity = this.entity(instance.entityId);
            const prison = this.area(start.prisonAreaId);
            if (!entity || !prison) {
                this.apply(instance, instance.game.stop("interrupted"));
                continue;
            }
            this.apply(instance, instance.game.tick(now, present));
            if (!instance.game.isRunning) {
                continue;
            }
            // The entity shows itself again when its image finishes loading: keep it hidden while the Gobeur plays.
            if (entity.visible) {
                entity.setVisible(false);
                this.scene.markDirty();
            }
            const player = this.scene.CurrentPlayer;
            if (instance.game.localStatus === "caught" && !isInsideArea(prison, { x: player.x, y: player.y })) {
                this.sendToPrison(instance);
            }
        }
    }

    private publish(): void {
        const views = new Map<string, GobeurGameView>();
        for (const [entityId, instance] of this.instances) {
            views.set(entityId, {
                running: instance.game.isRunning,
                isMaster: instance.game.isMaster,
                endsAt: instance.game.endsAt,
                survivors: instance.game.survivors,
                caught: instance.game.caughtOrder,
            });
        }
        const serialized = JSON.stringify(Array.from(views));
        if (serialized !== this.lastPublished) {
            this.lastPublished = serialized;
            gobeurGamesStore.set(views);
        }
    }

    /** The collisions of the animals: the shared grid, the thin collisions of the objects, the walls. */
    private refreshCollisions(): void {
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        this.collisionGrid = blockRectangles(
            gameMapFrontWrapper.getSharedCollisionGrid(),
            WanderingCharactersManager.collisionRectanglesOf(this.scene),
            this.tileDimensions,
        );
        this.pathfindingManager.setCollisionGrid(this.collisionGrid);
        this.pathfindingManager.setBarriers(gameMapFrontWrapper.getWallBarriers());
    }

    private isWalkable(tile: Point): boolean {
        const type = this.collisionGrid[tile.y]?.[tile.x];
        return (
            type === PathTileType.Walkable || type === PathTileType.MeetingRoom || type === PathTileType.PersonalDesk
        );
    }

    private async findPath(from: Point, to: Point): Promise<Point[]> {
        const { width, height } = this.tileDimensions;
        if (
            Math.floor(from.x / width) === Math.floor(to.x / width) &&
            Math.floor(from.y / height) === Math.floor(to.y / height)
        ) {
            // The pathfinding finds no path within a tile.
            return [from, to];
        }
        try {
            // The pathfinding expects the center of an avatar, half a tile above its feet, and returns feet.
            return await this.pathfindingManager.findPathFromGameCoordinates({ x: from.x, y: from.y - height / 2 }, to);
        } catch (e) {
            console.warn("Gobeur: pathfinding failed", e);
            return [];
        }
    }
}
