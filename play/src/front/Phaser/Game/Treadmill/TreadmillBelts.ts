/** An object whose belt can be set moving or still: an animated treadmill. */
export interface TreadmillBelt {
    setBeltMoving(moving: boolean): void;
}

/**
 * Which treadmills have someone running on them, the local player or a colleague. An animated treadmill stays on its
 * first image; its belt moves while at least one avatar runs on it.
 */
export class TreadmillBelts {
    /** The treadmill each runner is on, by character. */
    private readonly runners = new Map<object, string>();

    constructor(private readonly findBelt: (entityId: string) => TreadmillBelt | undefined) {}

    /** Records that this character runs on the treadmill, or on none (undefined). */
    public setRunner(runner: object, entityId: string | undefined): void {
        const previous = this.runners.get(runner);
        if (previous === entityId) return;
        if (entityId === undefined) this.runners.delete(runner);
        else this.runners.set(runner, entityId);
        if (previous !== undefined && !this.isMoving(previous)) this.findBelt(previous)?.setBeltMoving(false);
        if (entityId !== undefined) this.findBelt(entityId)?.setBeltMoving(true);
    }

    public isMoving(entityId: string): boolean {
        for (const id of this.runners.values()) if (id === entityId) return true;
        return false;
    }
}
