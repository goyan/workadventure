import type { Player } from "../../Player/Player";

/**
 * True when the player body, moved along the path, never touches a static rectangle of the groups.
 */
export function isPathClearOfStaticGroups(
    player: Player,
    path: { x: number; y: number }[],
    groups: ReadonlyArray<Phaser.Physics.Arcade.StaticGroup>,
): boolean {
    const body = player.body;
    if (!(body instanceof Phaser.Physics.Arcade.Body)) {
        return false;
    }
    let previous = { x: body.center.x, y: body.center.y };
    for (const step of path) {
        const next = {
            x: step.x + body.center.x - player.x,
            y: step.y - body.height / 2 - body.offset.y + body.center.y - player.y,
        };
        const line = new Phaser.Geom.Line(previous.x, previous.y, next.x, next.y);
        for (const group of groups) {
            for (const object of group.getChildren()) {
                const obstacle = object.body;
                if (!(obstacle instanceof Phaser.Physics.Arcade.StaticBody)) {
                    continue;
                }
                const expanded = new Phaser.Geom.Rectangle(
                    obstacle.x - body.halfWidth + Phaser.Math.EPSILON,
                    obstacle.y - body.halfHeight + Phaser.Math.EPSILON,
                    obstacle.width + body.width - 2 * Phaser.Math.EPSILON,
                    obstacle.height + body.height - 2 * Phaser.Math.EPSILON,
                );
                if (Phaser.Geom.Intersects.LineToRectangle(line, expanded)) {
                    return false;
                }
            }
        }
        previous = next;
    }
    return true;
}
