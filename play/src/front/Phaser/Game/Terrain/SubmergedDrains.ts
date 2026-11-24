import type { EntityDataProperties } from "@workadventure/map-editor";

/** Water deeper than this over its water point (pixels of the relief) covers a drain: it is drawn under it. */
export const SUBMERGED_PX = 1;
/** The drains are looked at this often (ms): the water of the server changes a few times a second at most. */
const LOOK_EVERY_MS = 250;

/** A placed object as SubmergedDrains reads it (an Entity fits). */
export interface DrainLike {
    x: number;
    y: number;
    getEntityData(): { properties: EntityDataProperties };
    setSubmerged(submerged: boolean): void;
}

/**
 * The drains of the map seen under the water that covers them: a grate at the bottom of a pool or in a flood shows
 * through the water until it drained it, then as it is. Only the drains (the objects with a sink): the rest of what
 * lies on the floor keeps its look.
 */
export class SubmergedDrains {
    private lookedAt = -Infinity;

    constructor(
        private readonly objects: () => Iterable<DrainLike>,
        /** The depth of the water shown over a point of the map (map pixels). */
        private readonly depthAt: (x: number, y: number) => number,
    ) {}

    public update(now: number): void {
        if (now - this.lookedAt < LOOK_EVERY_MS) return;
        this.lookedAt = now;
        for (const object of this.objects()) {
            const sink = object
                .getEntityData()
                .properties.find((property) => property.type === "waterSinkPropertyData");
            if (sink?.type !== "waterSinkPropertyData") continue;
            const depth = this.depthAt(object.x + (sink.anchorX ?? 0), object.y + (sink.anchorY ?? 0));
            object.setSubmerged(depth >= SUBMERGED_PX);
        }
    }
}
