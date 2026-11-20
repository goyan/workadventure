/** An invitation rings like a phone call: this long, then it is missed. */
export const INVITATION_RING_MS = 30_000;
/** The ring is played again this often while the invitation rings. */
export const INVITATION_RING_REPEAT_MS = 4_000;
/** After accepting, the position of the caller is awaited this long to teleport there (a later answer walks). */
export const INVITATION_TELEPORT_WAIT_MS = 10_000;

/**
 * The invitations this person sent that still ring, by the name of whom they called: unanswered when their ring ends.
 * The answer of the server only gives the name of who answered, hence the key.
 */
export class OutgoingCalls {
    private readonly ringing = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly unanswered: (name: string) => void,
        private readonly ringMs = INVITATION_RING_MS,
    ) {}

    public start(name: string): void {
        this.answered(name);
        this.ringing.set(
            name,
            setTimeout(() => {
                this.ringing.delete(name);
                this.unanswered(name);
            }, this.ringMs),
        );
    }

    /** The call to this name was answered (accepted or declined): true when it was still ringing. */
    public answered(name: string): boolean {
        const timer = this.ringing.get(name);
        if (timer === undefined) return false;
        clearTimeout(timer);
        this.ringing.delete(name);
        return true;
    }

    public isRinging(name: string): boolean {
        return this.ringing.has(name);
    }

    public close(): void {
        for (const timer of this.ringing.values()) clearTimeout(timer);
        this.ringing.clear();
    }
}

/**
 * The invitation this person received, ringing: `ring(true)` plays at once, `ring(false)` again every
 * INVITATION_RING_REPEAT_MS,
 * `missed` is called when nobody answered in time. Stopped by an answer.
 */
export class IncomingCall {
    private ringTimer: ReturnType<typeof setInterval> | undefined;
    private missTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly ring: (first: boolean) => void,
        private readonly missed: () => void,
        private readonly ringMs = INVITATION_RING_MS,
        private readonly repeatMs = INVITATION_RING_REPEAT_MS,
    ) {}

    /** Starts ringing; returns when the ring ends (epoch ms), for the countdown. */
    public start(now = Date.now()): number {
        this.stop();
        this.ring(true);
        this.ringTimer = setInterval(() => this.ring(false), this.repeatMs);
        this.missTimer = setTimeout(() => {
            this.stop();
            this.missed();
        }, this.ringMs);
        return now + this.ringMs;
    }

    public stop(): void {
        if (this.ringTimer !== undefined) clearInterval(this.ringTimer);
        if (this.missTimer !== undefined) clearTimeout(this.missTimer);
        this.ringTimer = undefined;
        this.missTimer = undefined;
    }

    public isRinging(): boolean {
        return this.missTimer !== undefined;
    }
}
