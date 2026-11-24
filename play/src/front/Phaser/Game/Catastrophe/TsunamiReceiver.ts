import { tsunamiMetres } from "@workadventure/map-editor";
import type { Tsunami } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";

/**
 * The server tells its tsunami once a second: past this without a word (a lost connection), it is forgotten, so
 * that nobody keeps a sea the room no longer has.
 */
const SILENCE_MS = 3500;

/**
 * The tsunami of the room as this browser knows it, from what the server tells (CatastropheMessage of the kind
 * CATASTROPHE_TSUNAMI, once a second). The water it brings comes with the water of the room, as any water: this is
 * what the panel says of it. Undefined once it ended, was stopped, or the server went silent.
 */
export class TsunamiReceiver {
    private tsunami: Tsunami | undefined;
    private silence: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly tell: (tsunami: Tsunami | undefined) => void) {}

    public report(message: CatastropheMessage): void {
        const told = message.tsunami;
        if (message.impactInMs <= 0 || !told || !(told.durationMs > 0)) {
            this.forget();
            return;
        }
        const known = this.tsunami;
        // The same tsunami told again keeps its object.
        if (!known || known.id !== message.id || known.startedAt !== told.startedAt) {
            this.tsunami = {
                id: message.id,
                startedAt: told.startedAt,
                metres: tsunamiMetres(told.metres),
                durationMs: told.durationMs,
            };
        }
        if (this.silence) clearTimeout(this.silence);
        this.silence = setTimeout(() => this.forget(), SILENCE_MS);
        this.tell(this.tsunami);
    }

    private forget(): void {
        if (this.silence) clearTimeout(this.silence);
        this.silence = undefined;
        this.tsunami = undefined;
        this.tell(undefined);
    }

    public destroy(): void {
        if (this.silence) clearTimeout(this.silence);
        this.silence = undefined;
        if (this.tsunami) {
            this.tsunami = undefined;
            this.tell(undefined);
        }
    }
}
