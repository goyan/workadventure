import { getPrefabCollisionRectangles } from "../../../Utils/PrefabCollisionRectangles";
import type { Entity } from "../../ECS/Entity";
import type { Player } from "../../Player/Player";
import { isPathClearOfStaticGroups } from "./StaticGroupsPath";

interface EntityCollisionState {
    entity: Entity;
    group: Phaser.Physics.Arcade.StaticGroup;
    collider?: Phaser.Physics.Arcade.Collider;
    left: number;
    top: number;
}

/**
 * Opt-in Arcade rectangles for entities whose prefab declares `collisionRectangles`.
 * They complement the 32px `collisionGrid` and follow the entity when the map editor moves it.
 */
export class EntityCollisionRectangles {
    private readonly states = new Map<string, EntityCollisionState>();
    private player: Player | undefined;

    constructor(private readonly scene: Phaser.Scene) {
        this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.followEntities);
    }

    public setPlayer(player: Player): void {
        this.player = player;
        for (const state of this.states.values()) {
            state.collider?.destroy();
            state.collider = this.scene.physics.add.collider(player, state.group);
        }
    }

    public add(entity: Entity): void {
        this.remove(entity.entityId);
        // Entities use the top-left corner as origin: x and y are enough, no vector to allocate.
        const topLeft = { x: entity.x, y: entity.y };
        const rectangles = getPrefabCollisionRectangles(topLeft, entity.getPrefab().collisionRectangles);
        if (rectangles.length === 0) {
            return;
        }
        const group = this.scene.physics.add.staticGroup();
        for (const rectangle of rectangles) {
            const object = this.scene.add
                .rectangle(
                    rectangle.x + rectangle.width / 2,
                    rectangle.y + rectangle.height / 2,
                    rectangle.width,
                    rectangle.height,
                )
                .setVisible(false);
            group.add(object);
        }
        this.states.set(entity.entityId, {
            entity,
            group,
            collider: this.player ? this.scene.physics.add.collider(this.player, group) : undefined,
            left: topLeft.x,
            top: topLeft.y,
        });
        // A new wall may invalidate a path already being followed; removing one never does.
        this.player?.finishFollowingPath(true);
    }

    public remove(entityId: string): void {
        const state = this.states.get(entityId);
        if (!state) {
            return;
        }
        state.collider?.destroy();
        state.group.clear(true, true);
        state.group.destroy();
        this.states.delete(entityId);
    }

    public isPathClear(player: Player, path: { x: number; y: number }[]): boolean {
        return isPathClearOfStaticGroups(
            player,
            path,
            Array.from(this.states.values(), (state) => state.group),
        );
    }

    public destroy(): void {
        this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.followEntities);
        for (const entityId of Array.from(this.states.keys())) {
            this.remove(entityId);
        }
        this.player = undefined;
    }

    /**
     * The map editor moves entities by assigning x/y: re-place the rectangles when the entity moved.
     */
    private readonly followEntities = (): void => {
        for (const state of this.states.values()) {
            const topLeft = { x: state.entity.x, y: state.entity.y };
            if (topLeft.x === state.left && topLeft.y === state.top) {
                continue;
            }
            const rectangles = getPrefabCollisionRectangles(topLeft, state.entity.getPrefab().collisionRectangles);
            state.group.getChildren().forEach((object, index) => {
                const rectangle = rectangles[index];
                if (!rectangle || !(object instanceof Phaser.GameObjects.Rectangle)) {
                    return;
                }
                object.setPosition(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2);
                if (object.body instanceof Phaser.Physics.Arcade.StaticBody) {
                    object.body.updateFromGameObject();
                }
            });
            state.left = topLeft.x;
            state.top = topLeft.y;
        }
    };
}
