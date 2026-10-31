import type * as Phaser from "phaser";
import type { EntityPrefab } from "@workadventure/map-editor";
import type { Entity } from "../../../ECS/Entity";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import {
    DOOR_CLOSED_FRAME,
    DOOR_FRAME_MARGIN,
    DOOR_VERTICAL_WIDTH,
    MAP_LAYER_TILE_SIZE,
    WALL_THICKNESS,
    doorPrefabName,
    mapLayerPrefabId,
    parseMapLayerPrefab,
} from "./MapLayerCatalog";
import type { MapLayerPiece } from "./MapLayerCatalog";

type DoorPiece = Extract<MapLayerPiece, { kind: "door" }>;

/** Time between two frames of the animation. */
const FRAME_DURATION_MS = 40;
/** A door stays open this long after the last character left its surroundings, so it does not flap. */
const CLOSE_DELAY_MS = 500;
/** How far from the door a character opens it. */
const OPENING_DISTANCE = 24;
/** The set of doors is read again at this rhythm: doors are added and removed by the map editor. */
const RESCAN_PERIOD_MS = 500;
/** The recordings are loud: a door right next to the player plays at this volume, and fades out with the distance. */
const DOOR_MAX_VOLUME = 0.3;
/** Doors farther than this from the local player are silent. */
const HEARING_DISTANCE = 10 * MAP_LAYER_TILE_SIZE;

/** Recorded door sounds (CC0, see `resources/objects/doors/CREDITS.txt`): one to open a door, one to close it. */
export const DOOR_SOUND_KEYS = { open: "audio-door-open", close: "audio-door-close" } as const;
export const DOOR_SOUND_URLS = {
    open: "/resources/objects/doors/door-open.ogg",
    close: "/resources/objects/doors/door-close.ogg",
} as const;

export interface DoorCharacter {
    x: number;
    y: number;
}

interface DoorRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface DoorPieceState {
    entity: Entity;
    piece: DoorPiece;
    rect: DoorRect;
    /**
     * Textures of the frames of both sets (swinging towards the north / west, then towards the south / east), by frame
     * number; undefined while they are loading or when the catalog lacks them.
     */
    textures: [string[], string[]] | undefined;
}

interface DoorState {
    frame: number;
    /** Time (scene clock) until which the door must stay open. */
    openUntil: number;
    /** Whether the door swings towards the south or the east: it is pushed away from the character who opens it. */
    reverse: boolean;
    nextFrameAt: number;
}

/**
 * Opens the doors of the map layer when a character comes near, and closes them behind. The doors are ordinary
 * entities: the animation only swaps their texture between the frames the catalog provides, so nothing is stored or
 * sent to the other players, and each client computes the same thing from the positions it already knows.
 */
export class DoorAnimator {
    private pieces = new Map<string, DoorPieceState>();
    private states = new Map<string, DoorState>();
    private nextScanAt = 0;
    private readonly pieceCache = new Map<string, DoorPiece | null>();

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly getEntities: () => Iterable<Entity>,
        private readonly getPrefab: (collectionName: string, id: string) => Promise<EntityPrefab | undefined>,
        private readonly playSound: (key: string, volume: number) => void,
        private readonly markDirty: () => void,
    ) {}

    /**
     * @param characters Every character that opens doors: the players, local and remote, and their companions.
     * @param listener Position of the local player, which sets how loud the doors are.
     */
    public update(time: number, characters: readonly DoorCharacter[], listener: DoorCharacter): void {
        if (time >= this.nextScanAt) {
            this.nextScanAt = time + RESCAN_PERIOD_MS;
            this.scan();
        }
        if (this.pieces.size === 0) {
            return;
        }

        const nearest = new Map<string, DoorCharacter | undefined>();
        for (const state of this.pieces.values()) {
            const key = this.doorKey(state);
            if (!nearest.has(key)) {
                nearest.set(key, this.nearestCharacter(state, characters));
            }
            const door = this.getDoorState(key, time);
            const pusher = nearest.get(key);
            if (pusher) {
                if (door.frame === DOOR_CLOSED_FRAME) {
                    door.reverse = this.isPushedTowardsViewer(state, pusher);
                }
                door.openUntil = time + CLOSE_DELAY_MS;
            }
            this.step(state, door, time, listener);
        }
    }

    public destroy(): void {
        // Doors are left as they are: the entities own their texture.
        this.pieces.clear();
        this.states.clear();
    }

    /** The two pieces of a door share their animation: it is told by the segment the door starts on. */
    private doorKey(state: DoorPieceState): string {
        return `${state.piece.orientation}:${state.rect.left},${state.rect.top}`;
    }

    private getDoorState(key: string, time: number): DoorState {
        let door = this.states.get(key);
        if (!door) {
            door = { frame: DOOR_CLOSED_FRAME, openUntil: 0, reverse: false, nextFrameAt: time };
            this.states.set(key, door);
        }
        return door;
    }

    private step(state: DoorPieceState, door: DoorState, time: number, listener: DoorCharacter): void {
        const target = time < door.openUntil ? 0 : DOOR_CLOSED_FRAME;
        // The first piece of a door moves the shared state, the second only follows it.
        const leader = state.piece.side === "g" || state.piece.side === "haut";
        if (leader && door.frame !== target && time >= door.nextFrameAt) {
            const previous = door.frame;
            door.frame += Math.sign(target - door.frame);
            door.nextFrameAt = time + FRAME_DURATION_MS;
            if (previous === DOOR_CLOSED_FRAME || door.frame === DOOR_CLOSED_FRAME) {
                this.playDoorSound(previous === DOOR_CLOSED_FRAME ? "open" : "close", state, listener);
            }
        }
        const texture = state.textures?.[door.reverse ? 1 : 0][door.frame];
        if (texture !== undefined && state.entity.texture.key !== texture) {
            state.entity.setTexture(texture);
            // The frames of a horizontal door have a margin above the door, the closed door (the prefab of the entity) has none.
            const margin = state.piece.orientation === "h" && door.frame !== DOOR_CLOSED_FRAME ? DOOR_FRAME_MARGIN : 0;
            state.entity.setOrigin(0, margin / state.entity.height);
            this.markDirty();
        }
    }

    private playDoorSound(kind: "open" | "close", state: DoorPieceState, listener: DoorCharacter): void {
        const centerX = (state.rect.left + state.rect.right) / 2;
        const centerY = (state.rect.top + state.rect.bottom) / 2;
        const distance = Math.hypot(centerX - listener.x, centerY - listener.y);
        if (distance < HEARING_DISTANCE) {
            const closeness = 1 - distance / HEARING_DISTANCE;
            this.playSound(DOOR_SOUND_KEYS[kind], DOOR_MAX_VOLUME * closeness * closeness);
        }
    }

    private isNear(rect: DoorRect, character: DoorCharacter): boolean {
        return (
            character.x >= rect.left - OPENING_DISTANCE &&
            character.x <= rect.right + OPENING_DISTANCE &&
            character.y >= rect.top - OPENING_DISTANCE &&
            character.y <= rect.bottom + OPENING_DISTANCE
        );
    }

    /** The character near the door that is the closest to its middle, if any. */
    private nearestCharacter(state: DoorPieceState, characters: readonly DoorCharacter[]): DoorCharacter | undefined {
        const centerX = (state.rect.left + state.rect.right) / 2;
        const centerY = (state.rect.top + state.rect.bottom) / 2;
        let best: DoorCharacter | undefined;
        let bestDistance = Infinity;
        for (const character of characters) {
            if (!this.isNear(state.rect, character)) continue;
            const distance = Math.hypot(character.x - centerX, character.y - centerY);
            if (distance < bestDistance) {
                best = character;
                bestDistance = distance;
            }
        }
        return best;
    }

    /**
     * The door is pushed away from the character: a character north of a horizontal door, or west of a vertical one,
     * makes it swing towards the south, or the east. Standing in the doorway counts as the south / east side.
     */
    private isPushedTowardsViewer(state: DoorPieceState, character: DoorCharacter): boolean {
        return state.piece.orientation === "h"
            ? character.y < state.rect.top
            : character.x < (state.rect.left + state.rect.right) / 2;
    }

    private parse(collectionName: string, prefabId: string): DoorPiece | undefined {
        const cached = this.pieceCache.get(prefabId);
        if (cached !== undefined) {
            return cached ?? undefined;
        }
        const piece = parseMapLayerPrefab(collectionName, prefabId);
        const door = piece?.kind === "door" && piece.frame === DOOR_CLOSED_FRAME ? piece : undefined;
        this.pieceCache.set(prefabId, door ?? null);
        return door;
    }

    /** Rectangle of the whole door (both pieces) that a piece belongs to, in pixels. */
    private doorRect(entity: Entity, piece: DoorPiece): DoorRect {
        const size = MAP_LAYER_TILE_SIZE;
        if (piece.orientation === "h") {
            const left = piece.side === "g" ? entity.x : entity.x - size;
            return { left, top: entity.y, right: left + 2 * size, bottom: entity.y + size };
        }
        const top = piece.side === "haut" ? entity.y : entity.y - size;
        const center = entity.x + DOOR_VERTICAL_WIDTH / 2;
        return { left: center - size / 2, top, right: center + size / 2, bottom: top + 2 * size };
    }

    /**
     * A vertical door starting under a corner or a T would hide behind the south face of the horizontal wall above it,
     * which reaches 20 px under the cap: the door would hang in the void under the wall. It is drawn right over that
     * face instead, so that it keeps looking attached to the wall.
     */
    private depthOverFacadeAbove(entity: Entity, piece: DoorPiece, facades: readonly Entity[]): number | undefined {
        if (piece.orientation !== "v" || piece.side !== "haut") {
            return undefined;
        }
        const center = entity.x + DOOR_VERTICAL_WIDTH / 2;
        let depth: number | undefined;
        for (const facade of facades) {
            // The door starts one cap (WALL_THICKNESS) under the line of the wall it hangs from.
            const above =
                facade.y === entity.y - WALL_THICKNESS &&
                facade.x <= center &&
                center <= facade.x + facade.displayWidth;
            if (above) {
                const facadeDepth = facade.y + facade.displayHeight + (facade.getPrefab().depthOffset ?? 0);
                depth = Math.max(depth ?? facadeDepth, facadeDepth) + 1;
            }
        }
        return depth;
    }

    private scan(): void {
        const seen = new Set<string>();
        const entities = Array.from(this.getEntities());
        const facades = entities.filter(
            (entity) =>
                parseMapLayerPrefab(entity.getPrefab().collectionName, entity.getPrefab().id)?.kind === "facade",
        );
        for (const entity of entities) {
            const prefab = entity.getPrefab();
            const piece = this.parse(prefab.collectionName, prefab.id);
            if (!piece) {
                continue;
            }
            seen.add(entity.entityId);
            const depth = this.depthOverFacadeAbove(entity, piece, facades);
            if (depth !== undefined && entity.depth < depth) {
                entity.setDepth(depth);
                this.markDirty();
            }
            const known = this.pieces.get(entity.entityId);
            if (known && known.entity === entity && known.piece === piece) {
                known.rect = this.doorRect(entity, piece);
                continue;
            }
            const state: DoorPieceState = {
                entity,
                piece,
                rect: this.doorRect(entity, piece),
                textures: undefined,
            };
            this.pieces.set(entity.entityId, state);
            this.loadFrames(state).catch((error: unknown) =>
                console.warn("Could not load the frames of a door", error),
            );
        }
        for (const entityId of this.pieces.keys()) {
            if (!seen.has(entityId)) {
                this.pieces.delete(entityId);
            }
        }
        const alive = new Set(Array.from(this.pieces.values(), (state) => this.doorKey(state)));
        for (const key of this.states.keys()) {
            if (!alive.has(key)) {
                this.states.delete(key);
            }
        }
    }

    /** Loads the textures of the frames; a door whose catalog has no frames simply does not move. */
    private async loadFrames(state: DoorPieceState): Promise<void> {
        const { piece } = state;
        const closed = state.entity.getPrefab();
        const sets: EntityPrefab[][] = [];
        for (const reverse of [false, true]) {
            // The prefabs of one set are looked up together, the closed door being the prefab of the entity.
            // eslint-disable-next-line no-await-in-loop
            const prefabs = await Promise.all(
                Array.from({ length: DOOR_CLOSED_FRAME + 1 }, (_, frame) =>
                    frame === DOOR_CLOSED_FRAME
                        ? Promise.resolve(closed)
                        : this.getPrefab(
                              closed.collectionName,
                              mapLayerPrefabId(
                                  closed.collectionName,
                                  doorPrefabName(piece.orientation, piece.tint, piece.side, frame, reverse),
                              ),
                          ),
                ),
            );
            if (prefabs.some((prefab) => prefab === undefined)) {
                return;
            }
            sets.push(prefabs as EntityPrefab[]);
        }
        await Promise.all(
            sets.flat().map((prefab) => TexturesHelper.loadEntityImage(this.scene, prefab.imagePath, prefab.imagePath)),
        );
        const textures = sets.map((set) => set.map((prefab) => prefab.imagePath));
        Object.assign(state, { textures });
    }
}
