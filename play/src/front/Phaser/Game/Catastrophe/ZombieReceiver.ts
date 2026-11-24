import { zombieAsk } from "@workadventure/map-editor";
import type { ZombieHorde } from "@workadventure/map-editor";
import type { CatastropheMessage } from "@workadventure/messages";

/**
 * The server tells its horde once a second: past this without a word (a lost connection), it is forgotten, so that
 * nobody keeps a horde the room no longer has.
 */
const SILENCE_MS = 3500;

/**
 * The horde of zombies of the room as this browser knows it, from what the server tells (CatastropheMessage of the
 * kind CATASTROPHE_ZOMBIES, once a second). Its water comes with it every few seconds only (the others carry its
 * hash): a horde is told on once its water is known, the same object while nothing changes. Undefined once it ended,
 * was stopped, or the server went silent.
 */
export class ZombieReceiver {
    private horde: ZombieHorde | undefined;
    /** The water last told, by its hash: a player who joins waits for it. */
    private terrain: { hash: number; text: string } | undefined;
    private silence: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly tell: (horde: ZombieHorde | undefined) => void) {}

    public report(message: CatastropheMessage): void {
        const told = message.zombies;
        if (message.impactInMs <= 0 || !told) {
            this.forget();
            return;
        }
        if (told.terrain) this.terrain = { hash: told.terrainHash, text: told.terrain };
        if (this.silence) clearTimeout(this.silence);
        this.silence = setTimeout(() => this.forget(), SILENCE_MS);
        if (!this.terrain || this.terrain.hash !== told.terrainHash) return;
        const known = this.horde;
        if (known && known.id === message.id && known.startedAt === told.startedAt && known.seed === told.seed) return;
        const ask = zombieAsk(told);
        this.horde = {
            id: message.id,
            seed: told.seed,
            count: ask.count,
            heading: ask.heading,
            durationMs: told.durationMs,
            startedAt: told.startedAt,
            dirX: told.dirX,
            dirY: told.dirY,
            anchorX: told.anchorX,
            anchorY: told.anchorY,
            widthCells: told.widthCells,
            heightCells: told.heightCells,
            terrain: this.terrain.text,
        };
        this.tell(this.horde);
    }

    /** The horde as last told, once its water is known. */
    public current(): ZombieHorde | undefined {
        return this.horde;
    }

    private forget(): void {
        if (this.silence) clearTimeout(this.silence);
        this.silence = undefined;
        const had = this.horde !== undefined;
        this.horde = undefined;
        this.terrain = undefined;
        if (had) this.tell(undefined);
    }

    public destroy(): void {
        this.forget();
    }
}
