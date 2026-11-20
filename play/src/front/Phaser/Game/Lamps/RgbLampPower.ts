/** A lamp a switch turns on or off fades over this long instead of jumping. */
export const RGB_LAMP_POWER_FADE_MS = 200;

interface LampPower {
    on: boolean;
    /** The level when it was last switched, and when that was. */
    from: number;
    since: number;
}

/**
 * The share of its light each lamp gives while a switch turns it on or off: 1 on, 0 off, in between for `fadeMs`
 * (200 ms by default). A lamp seen for the first time is at once as it is told (a player who joins sees no lamp fade),
 * and with reduced motion nothing fades.
 */
export class RgbLampPower {
    private readonly lamps = new Map<string, LampPower>();

    constructor(
        private readonly reducedMotion: () => boolean,
        private readonly fadeMs = RGB_LAMP_POWER_FADE_MS,
    ) {}

    public level(lampId: string, on: boolean, now: number): number {
        const lamp = this.lamps.get(lampId);
        if (!lamp || this.reducedMotion()) {
            this.lamps.set(lampId, { on, from: on ? 1 : 0, since: now - this.fadeMs });
            return on ? 1 : 0;
        }
        const current = levelOf(lamp, now, this.fadeMs);
        if (lamp.on !== on) {
            lamp.on = on;
            lamp.from = current;
            lamp.since = now;
        }
        return current;
    }

    public forget(lampId: string): void {
        this.lamps.delete(lampId);
    }
}

function levelOf({ on, from, since }: LampPower, now: number, fadeMs: number): number {
    const done = Math.max(0, now - since) / fadeMs;
    return on ? Math.min(1, from + done) : Math.max(0, from - done);
}
