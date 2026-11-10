import type * as Phaser from "phaser";
import type { EntityPrefab } from "@workadventure/map-editor";
import { getObjectInteraction, type MapCategories } from "../../../Utils/ObjectCategories";
import type { GameScene } from "../GameScene";

/** A rectangle of ice in world pixels. */
export interface IceRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** What IceZones reads of a placed object: its image (top-left origin) and its prefab. */
export interface PlacedObject {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    getPrefab(): EntityPrefab;
}

let cache: { scene: Phaser.Scene; frame: number; rectangles: IceRectangle[] } | undefined;

/** The ice of these objects: the whole image of each object whose category makes players skate. */
export function iceRectanglesOf(objects: Iterable<PlacedObject>, categories: MapCategories): IceRectangle[] {
    const rectangles: IceRectangle[] = [];
    for (const object of objects) {
        if (getObjectInteraction(object.getPrefab(), categories).interaction !== "iceSkate") continue;
        rectangles.push({ x: object.x, y: object.y, width: object.displayWidth, height: object.displayHeight });
    }
    return rectangles;
}

/**
 * The ice of the map. Read every frame by each character, so it is computed once per frame; the map editor may move
 * or remove a rink at any time.
 */
export function getIceRectangles(scene: Phaser.Scene): IceRectangle[] {
    const frame = scene.game?.loop?.frame ?? -1;
    if (cache && cache.scene === scene && cache.frame === frame) {
        return cache.rectangles;
    }
    // The map may not be loaded yet when the first characters are created.
    const gameScene = scene as Partial<GameScene>;
    const entities = gameScene.getGameMapFrontWrapper?.()?.getEntitiesManager?.()?.getEntities();
    const rectangles = iceRectanglesOf(entities?.values() ?? [], gameScene.wamFile?.settings?.categories);
    cache = { scene, frame, rectangles };
    return rectangles;
}

/** Whether the point (the center of a body) is on the ice. */
export function isOnIce(rectangles: IceRectangle[], point: { x: number; y: number }): boolean {
    return rectangles.some(
        (r) => point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height,
    );
}
