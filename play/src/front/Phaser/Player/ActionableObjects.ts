import { PositionMessage_Direction } from "@workadventure/messages";
import { Direction } from "@workadventure/map-editor";
import type { GameScene } from "../Game/GameScene";
import { AvatarAction, readAvatarAction } from "../Entity/AvatarAction";
import { getObjectInteraction } from "../../Utils/ObjectCategories";

export interface ActionableObject {
    entityId: string;
    action: AvatarAction;
    trigger: "auto" | "key";
    feet: { x: number; y: number };
    direction: PositionMessage_Direction;
    depth: number;
}

/** Use the nearest object's boundary, so its collision box need not be crossed to interact. */
export function findActionableObject(
    scene: GameScene,
    feet: { x: number; y: number },
    elevation = 0,
): ActionableObject | undefined {
    let nearest: ActionableObject | undefined;
    let distance = 28;
    const entities = scene.getGameMapFrontWrapper()?.getEntitiesManager()?.getEntities();
    if (!entities) return undefined;
    for (const [entityId, entity] of entities) {
        // Only the objects of the floor the avatar stands on: the others are drawn over a place they are not at.
        if (Math.abs(entity.getElevation() - elevation) >= 2) continue;
        // The distance first: of the thousands of objects of a map, a handful are within reach of the avatar.
        const x = Math.max(entity.x, Math.min(feet.x, entity.x + entity.displayWidth));
        const y = Math.max(entity.y, Math.min(feet.y, entity.y + entity.displayHeight));
        const nextDistance = Math.hypot(x - feet.x, y - feet.y);
        if (nextDistance >= distance) continue;
        const { interaction, trigger } = getObjectInteraction(entity.getPrefab(), scene.wamFile?.settings?.categories);
        const action = readAvatarAction(interaction);
        if (action === AvatarAction.Idle) continue;
        const direction = entity.getPrefab().direction;
        nearest = {
            entityId,
            action,
            trigger,
            feet: { x: entity.x + entity.displayWidth / 2, y: entity.y + entity.displayHeight * 0.7 },
            direction:
                direction === Direction.Up
                    ? PositionMessage_Direction.UP
                    : direction === Direction.Left
                      ? PositionMessage_Direction.LEFT
                      : direction === Direction.Right
                        ? PositionMessage_Direction.RIGHT
                        : PositionMessage_Direction.DOWN,
            depth: entity.depth + 1,
        };
        distance = nextDistance;
    }
    return nearest;
}
