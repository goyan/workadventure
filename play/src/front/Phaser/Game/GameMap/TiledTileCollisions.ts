import { GameMapProperties } from "@workadventure/map-editor";
import { getTiledTileCollisionRectangles } from "../../../Utils/TiledTileCollisionRectangles";
import type { Player } from "../../Player/Player";
import { isPathClearOfStaticGroups } from "./StaticGroupsPath";

/**
 * Opt-in Arcade rectangles. Tile properties are preserved for the existing navigation/editor grid.
 */
export class TiledTileCollisions {
    private readonly layers = new Map<
        Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer,
        { group: Phaser.Physics.Arcade.StaticGroup; collider?: Phaser.Physics.Arcade.Collider }
    >();
    private player: Player | undefined;

    constructor(private readonly scene: Phaser.Scene) {}

    public setPlayer(player: Player): void {
        this.player = player;
        for (const state of this.layers.values()) {
            state.collider?.destroy();
            state.collider = this.scene.physics.add.collider(player, state.group);
        }
    }

    public updateLayer(layer: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer): void {
        const previous = this.layers.get(layer);
        previous?.collider?.destroy();
        previous?.group.clear(true, true);
        previous?.group.destroy();
        this.layers.delete(layer);

        // Synthetic entity/area layers keep their own full-cell collision policy.
        if (layer.layer.name.startsWith("__") || !layer.visible) {
            return;
        }
        const group = this.scene.physics.add.staticGroup();
        for (const row of layer.layer.data) {
            for (const tile of row) {
                if (!tile?.properties?.[GameMapProperties.COLLIDES]) {
                    continue;
                }
                // Scaled/parallax layers cannot share the normal world/navigation coordinates.
                if (
                    layer.scaleX !== 1 ||
                    layer.scaleY !== 1 ||
                    layer.scrollFactorX !== 1 ||
                    layer.scrollFactorY !== 1
                ) {
                    continue;
                }
                const rectangles = getTiledTileCollisionRectangles(tile);
                if (!rectangles) {
                    continue;
                }
                tile.resetCollision();
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
            }
        }
        this.layers.set(layer, {
            group,
            collider: this.player ? this.scene.physics.add.collider(this.player, group) : undefined,
        });
        // A scripted wall change invalidates a path already being followed.
        this.player?.finishFollowingPath(true);
    }

    /**
     * EasyStar accepts blocked starting tiles. Check the initial/final segments too, because
     * keyboard movement can place the player in the free portion of a partially blocked tile.
     */
    public isPathClear(player: Player, path: { x: number; y: number }[]): boolean {
        return isPathClearOfStaticGroups(
            player,
            path,
            Array.from(this.layers.values(), (state) => state.group),
        );
    }

    public destroy(): void {
        for (const state of this.layers.values()) {
            state.collider?.destroy();
            state.group.clear(true, true);
            state.group.destroy();
        }
        this.layers.clear();
        this.player = undefined;
    }
}
