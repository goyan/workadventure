import { castPoint, castTiles } from "@workadventure/map-editor";
import type { FishingDirection } from "@workadventure/map-editor";

/**
 * The gesture of the local player with their rod: the key held charges a cast, released it casts; with a line in the
 * water the key reels at once (it hooks a biting fish, or brings the line back). The server decides what follows.
 */
export class FishingRod {
    private pressedAt: number | undefined;

    /** The key goes down: "reel" when a line is in the water, else the cast starts charging. */
    public press(now: number, hasLine: boolean): "reel" | undefined {
        if (hasLine) {
            this.pressedAt = undefined;
            return "reel";
        }
        this.pressedAt ??= now;
        return undefined;
    }

    /** How far the cast would go now, in tiles; undefined while no cast is charging. */
    public chargeTiles(now: number): number | undefined {
        return this.pressedAt === undefined ? undefined : castTiles(now - this.pressedAt);
    }

    /** The key goes up: where the float should land, when a cast was charging. */
    public release(
        now: number,
        player: { x: number; y: number; direction: FishingDirection },
    ): { x: number; y: number } | undefined {
        const tiles = this.chargeTiles(now);
        this.pressedAt = undefined;
        return tiles === undefined ? undefined : castPoint(player.x, player.y, player.direction, tiles);
    }

    /** The cast is given up (the avatar walked, the rod was put away). */
    public cancel(): void {
        this.pressedAt = undefined;
    }
}
