/** The ground drawn in pixel art, the relief seen in 3/4, and what goes with it (its workers, glints, footprints). */
export interface PixelGround {
    setHidden(hidden: boolean): void;
    update(now: number): void;
    destroy(): void;
}

/**
 * Two engines draw the ground of a map: the flat one (TerrainView), always there, and the relief in 3/4 in pixel art,
 * which this keeps. It exists only for who chose it: not chosen, nothing of it is made (no block, no texture, no
 * worker), and it is destroyed as soon as it is no longer chosen. Chosen but not shown (the map is edited, Basique), it
 * is hidden and kept, so that it shows again at once.
 */
export class GroundEngines<T extends PixelGround> {
    private ground: T | undefined;

    constructor(private readonly create: () => T) {}

    /** Called at each image of the game. */
    public sync(state: { chosen: boolean; shown: boolean }, now: number): void {
        if (!state.chosen) {
            this.destroy();
            return;
        }
        this.ground ??= this.create();
        this.ground.setHidden(!state.shown);
        this.ground.update(now);
    }

    public current(): T | undefined {
        return this.ground;
    }

    public destroy(): void {
        this.ground?.destroy();
        this.ground = undefined;
    }
}
