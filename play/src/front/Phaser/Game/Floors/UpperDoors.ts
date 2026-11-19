import type { EntityPrefab } from "@workadventure/map-editor";
import type { Entity } from "../../ECS/Entity";
import { MAP_LAYER_UPPER_COLLECTIONS } from "../MapEditor/MapLayer/MapLayerCatalog";
import { DoorAnimator } from "../MapEditor/MapLayer/DoorAnimator";
import type { DoorCharacter, HearingZone } from "../MapEditor/MapLayer/DoorAnimator";
import { groundPrefabOfUpper } from "../MapEditor/MapLayer/MapLayerLevels";

/** What the doors of the floors read of a placed entity (an `Entity` fits). */
export interface RaisedPiece {
    y: number;
    getPrefab(): { collectionName: string; id: string };
    getElevation(): number;
}

const views = new WeakMap<object, { level: number; view: object }>();

/**
 * A wall, a door or a window standing on a raised floor, seen as the piece of the ground it stands for: under its name
 * of the ground and where it stands (its image is drawn the altitude further north). Everything else is the entity
 * itself: drawing on the view draws on the entity. The same view is given back for the same entity.
 *
 * It lets the animator of the doors of the ground, which knows nothing of the floors, animate the doors of a floor.
 */
export function groundView<E extends RaisedPiece>(entity: E, level: number): E {
    const known = views.get(entity);
    if (known?.level === level) return known.view as E;
    const view = new Proxy(entity, {
        get(target, property) {
            if (property === "y") return target.y + level;
            if (property === "getPrefab") {
                return () => {
                    const prefab = target.getPrefab();
                    const ground = groundPrefabOfUpper(prefab.collectionName, prefab.id);
                    return ground ? { ...prefab, collectionName: ground.collectionName, id: ground.prefabId } : prefab;
                };
            }
            const value: unknown = Reflect.get(target, property, target);
            return typeof value === "function" ? (value.bind(target) as unknown) : value;
        },
    });
    views.set(entity, { level, view });
    return view;
}

/** The altitudes of the floors that carry walls, doors or windows, lowest first. */
export function raisedDoorLevels(entities: Iterable<RaisedPiece>): number[] {
    const levels = new Set<number>();
    for (const entity of entities) {
        const elevation = entity.getElevation();
        if (elevation > 0 && MAP_LAYER_UPPER_COLLECTIONS.includes(entity.getPrefab().collectionName)) {
            levels.add(elevation);
        }
    }
    return [...levels].sort((a, b) => a - b);
}

/** A character near the doors, with the altitude of the floor it stands on. */
export interface RaisedCharacter {
    character: DoorCharacter;
    elevation: number;
}

/** The floors are looked for again this often: the map editor adds and removes them. */
const RESCAN_MS = 1000;

/**
 * The doors of the raised floors: they open for the characters of their own floor, like the doors of the ground do for
 * the ones of the ground. One animator of the ground per floor, fed with the pieces and the characters of that floor
 * as if they stood on the ground.
 */
export class UpperDoors {
    private readonly animators = new Map<number, DoorAnimator>();
    private levels: number[] = [];
    private nextScanAt = 0;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly getEntities: () => Iterable<Entity>,
        private readonly getPrefab: (collectionName: string, id: string) => Promise<EntityPrefab | undefined>,
        private readonly playSound: (key: string, volume: number) => void,
        private readonly markDirty: () => void,
        private readonly getHearingZones: () => readonly HearingZone[],
    ) {}

    private piecesOf(level: number): Entity[] {
        const pieces: Entity[] = [];
        for (const entity of this.getEntities()) {
            if (
                entity.getElevation() === level &&
                MAP_LAYER_UPPER_COLLECTIONS.includes(entity.getPrefab().collectionName)
            ) {
                pieces.push(groundView(entity, level));
            }
        }
        return pieces;
    }

    public isInOpenVerticalPassage(x: number, y: number, elevation: number): boolean {
        return this.animators.get(elevation)?.isInOpenVerticalPassage(x, y + elevation) ?? false;
    }

    /**
     * @param characters Everyone standing on a raised floor, at their place on the screen.
     * @param listener The local player, at their place on the screen: sets how loud the doors are.
     */
    public update(time: number, characters: readonly RaisedCharacter[], listener: DoorCharacter): void {
        if (time >= this.nextScanAt) {
            this.nextScanAt = time + RESCAN_MS;
            this.levels = raisedDoorLevels(this.getEntities());
            for (const level of this.animators.keys()) {
                if (!this.levels.includes(level)) this.animators.delete(level);
            }
        }
        for (const level of this.levels) {
            let animator = this.animators.get(level);
            if (!animator) {
                animator = new DoorAnimator(
                    this.scene,
                    () => this.piecesOf(level),
                    this.getPrefab,
                    this.playSound,
                    this.markDirty,
                    this.getHearingZones,
                );
                this.animators.set(level, animator);
            }
            // On the screen a character of this floor is drawn its altitude further north than where it stands.
            const onGround = (character: DoorCharacter): DoorCharacter => ({
                ...character,
                y: character.y + level,
                path: character.path?.map((point) => ({ x: point.x, y: point.y + level })),
            });
            const here = characters.filter((item) => Math.abs(item.elevation - level) < 2);
            const local = here.find((item) => item.character === listener);
            const people = here.map((item) => (item === local ? undefined : onGround(item.character)));
            const heard = onGround(listener);
            animator.update(
                time,
                people.map((person) => person ?? heard),
                heard,
            );
        }
    }
}
