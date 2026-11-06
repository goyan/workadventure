import type * as Phaser from "phaser";
import type { InteractionTrigger } from "@workadventure/map-editor";
import { getPrefabCollisionRectangles } from "../../../Utils/PrefabCollisionRectangles";
import { getObjectInteraction } from "../../../Utils/ObjectCategories";
import type { GameScene } from "../GameScene";

/** A rectangle of water in world pixels. */
export interface WaterRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
    /** `auto`: players dive on touching it; `key` (default): with the interaction key at its edge. */
    trigger?: InteractionTrigger;
}

interface Point {
    x: number;
    y: number;
}

/**
 * A character is in the water when the center of its body is: that center is this far below the position of the
 * character (CHARACTER_BODY_OFFSET_Y in Character.ts, not imported to keep this module free of Phaser objects).
 */
export const BODY_CENTER_OFFSET_Y = 8;

/** How far from the water a player may dive in from, in pixels from the center of its body. */
export const DIVE_DISTANCE = 24;
/** How far inside the water a dive lands, so that the whole body is in it. */
export const DIVE_DEPTH = 14;

let cache: { scene: Phaser.Scene; frame: number; rectangles: WaterRectangle[] } | undefined;

/**
 * The water of the map: the `water` rectangles of the placed objects. Read every frame by each character, so it is
 * computed once per frame; the map editor may move or edit a pool at any time.
 */
export function getWaterRectangles(scene: Phaser.Scene): WaterRectangle[] {
    const frame = scene.game?.loop?.frame ?? -1;
    if (cache && cache.scene === scene && cache.frame === frame) {
        return cache.rectangles;
    }
    // The map may not be loaded yet when the first characters are created.
    const gameScene = scene as Partial<GameScene>;
    const entities = gameScene.getGameMapFrontWrapper?.()?.getEntitiesManager?.()?.getEntities();
    const categories = gameScene.wamFile?.settings?.categories;
    const rectangles: WaterRectangle[] = [];
    for (const entity of entities?.values() ?? []) {
        const prefab = entity.getPrefab();
        if (prefab.water?.length) {
            const { trigger } = getObjectInteraction(prefab, categories);
            rectangles.push(
                ...getPrefabCollisionRectangles({ x: entity.x, y: entity.y }, prefab.water).map((rectangle) => ({
                    ...rectangle,
                    trigger,
                })),
            );
        }
    }
    cache = { scene, frame, rectangles };
    return rectangles;
}

export function isPointInWater(rectangles: WaterRectangle[], point: Point): boolean {
    return rectangles.some(
        (r) => point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height,
    );
}

/** At most one map tile from the water boundary, including the diagonal neighbouring tiles. */
export function isWithinOneTileOfWater(
    rectangles: WaterRectangle[],
    point: Point,
    tile: { width: number; height: number },
): boolean {
    return rectangles.some(
        (r) =>
            Math.abs(point.x - clamp(point.x, r.x, r.x + r.width)) <= tile.width &&
            Math.abs(point.y - clamp(point.y, r.y, r.y + r.height)) <= tile.height,
    );
}

export function intersectsWater(rectangles: WaterRectangle[], box: WaterRectangle): boolean {
    return rectangles.some(
        (r) => box.x < r.x + r.width && r.x < box.x + box.width && box.y < r.y + r.height && r.y < box.y + box.height,
    );
}

/**
 * Where a player standing at `point` lands when diving: the nearest water within DIVE_DISTANCE, DIVE_DEPTH inside
 * its edge (or its middle, for a pool narrower than that). Undefined when no water is close enough.
 */
export function findDiveTarget(
    rectangles: WaterRectangle[],
    point: Point,
): (Point & { distance: number; trigger: InteractionTrigger }) | undefined {
    let best: { target: Point; distance: number; trigger: InteractionTrigger } | undefined;
    for (const r of rectangles) {
        const nearestX = clamp(point.x, r.x, r.x + r.width);
        const nearestY = clamp(point.y, r.y, r.y + r.height);
        const distance = Math.hypot(point.x - nearestX, point.y - nearestY);
        if (distance > DIVE_DISTANCE || (best && best.distance <= distance)) {
            continue;
        }
        best = {
            distance,
            trigger: r.trigger ?? "key",
            target: {
                x: clampInside(point.x, r.x, r.width),
                y: clampInside(point.y, r.y, r.height),
            },
        };
    }
    return best ? { ...best.target, distance: best.distance, trigger: best.trigger } : undefined;
}

/** Whether walking straight from `from` to `to` goes through water (sampled every 4 pixels). */
export function segmentCrossesWater(rectangles: WaterRectangle[], from: Point, to: Point): boolean {
    if (rectangles.length === 0) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (isPointInWater(rectangles, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })) {
            return true;
        }
    }
    return false;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function clampInside(value: number, start: number, size: number): number {
    if (size <= DIVE_DEPTH * 2) return start + size / 2;
    return clamp(value, start + DIVE_DEPTH, start + size - DIVE_DEPTH);
}
