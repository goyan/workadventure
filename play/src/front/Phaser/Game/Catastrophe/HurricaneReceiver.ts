import { hurricaneAt, hurricaneTrack } from "@workadventure/map-editor";
import type { Hurricane, HurricaneNow } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";

/**
 * The server tells its hurricane once a second: past this without a word (a lost connection), it is forgotten, so
 * that nobody keeps a storm the room no longer has.
 */
const SILENCE_MS = 3500;

/**
 * The hurricane of the room as this browser knows it, from what the server tells (CatastropheMessage of the kind
 * CATASTROPHE_HURRICANE, once a second): the hurricane itself, which its weather is computed from, and what it is at
 * the time of the server when it was told. Undefined once it ended, was stopped, or the server went silent.
 */
export class HurricaneReceiver {
    private hurricane: Hurricane | undefined;
    private silence: ReturnType<typeof setTimeout> | undefined;

    constructor(
        /** The time of the server, ms; undefined while it is not known. */
        private readonly serverNow: () => number | undefined,
        private readonly tell: (hurricane: Hurricane | undefined, now: HurricaneNow | undefined) => void,
    ) {}

    public report(message: CatastropheMessage): void {
        const track = message.hurricane;
        if (message.impactInMs <= 0 || !track) {
            this.forget();
            return;
        }
        const known = this.hurricane;
        const told: Hurricane = {
            id: message.id,
            startedAt: track.startedAt,
            ...hurricaneTrack(track, track.southern),
            fromX: track.fromX,
            fromY: track.fromY,
            toX: track.toX,
            toY: track.toY,
            anchorX: track.anchorX,
            anchorY: track.anchorY,
            // The crossing as the server runs it now (the speed of the map).
            ...(track.durationMs > 0 ? { durationMs: track.durationMs, times: track.times || 1 } : {}),
        };
        // The same hurricane told again keeps its object: what is computed from it is not computed again.
        const same =
            known &&
            known.id === told.id &&
            known.startedAt === told.startedAt &&
            known.durationMs === told.durationMs &&
            known.times === told.times &&
            known.category === told.category &&
            known.fromX === told.fromX &&
            known.fromY === told.fromY &&
            known.toX === told.toX &&
            known.toY === told.toY &&
            known.heading === told.heading &&
            known.southern === told.southern;
        if (!same) this.hurricane = told;
        const hurricane = this.hurricane ?? told;
        if (this.silence) clearTimeout(this.silence);
        this.silence = setTimeout(() => this.forget(), SILENCE_MS);
        const at = this.serverNow();
        this.tell(hurricane, at === undefined ? undefined : hurricaneAt(hurricane, at));
    }

    private forget(): void {
        if (this.silence) clearTimeout(this.silence);
        this.silence = undefined;
        this.hurricane = undefined;
        this.tell(undefined, undefined);
    }

    public destroy(): void {
        if (this.silence) clearTimeout(this.silence);
        this.silence = undefined;
        if (this.hurricane) {
            this.hurricane = undefined;
            this.tell(undefined, undefined);
        }
    }
}
