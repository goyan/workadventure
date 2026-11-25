import { decodeZombieLog, encodeZombieLog, zombieAsk } from "@workadventure/map-editor";
import type { ZombieHorde, ZombieLogEntry } from "@workadventure/map-editor";
import type { CatastropheMessage, ZombieHordeMessage } from "@workadventure/messages";

/** The horde a message of the server tells, over the ground it told before (`terrain`). */
export function zombieHordeOf(id: number, told: ZombieHordeMessage, terrain: string): ZombieHorde {
    const ask = zombieAsk(told);
    return {
        id,
        seed: told.seed,
        count: ask.count,
        heading: ask.heading,
        durationMs: told.durationMs,
        startedAt: told.startedAt,
        anchorStep: told.anchorStep,
        anchorAt: told.anchorAt,
        msPerStep: told.msPerStep > 0 ? told.msPerStep : 100,
        dirX: told.dirX,
        dirY: told.dirY,
        anchorX: told.anchorX,
        anchorY: told.anchorY,
        widthCells: told.widthCells,
        heightCells: told.heightCells,
        terrain,
        avatars: told.avatars,
        safeStep: told.safeStep,
    };
}

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
    /**
     * The log of the horde as the server wrote it (each message tells its entries from `logFrom` on, the whole one
     * with the water), and the horde it is the log of.
     */
    private log: { id: number; startedAt: number; entries: ZombieLogEntry[]; text: string } | undefined;
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
        const log = this.readLog(message.id, told);
        if (!this.terrain || this.terrain.hash !== told.terrainHash) return;
        const horde = zombieHordeOf(message.id, told, this.terrain.text);
        const same = this.horde?.id === horde.id && this.horde.startedAt === horde.startedAt;
        if (log === undefined) {
            // Entries missed: the clock goes on, the log stays where it was complete until the whole one comes.
            if (!same || !this.horde) return;
            this.horde = { ...horde, avatars: this.horde.avatars, safeStep: this.horde.safeStep };
        } else {
            this.horde = { ...horde, avatars: log };
        }
        // Told each second: where the avatars stood since, the clock of the horde; the view keeps its crowd.
        this.tell(this.horde);
    }

    /**
     * The whole log of the horde with the entries a message tells (from its `logFrom` on): the text of it, undefined
     * when entries before those were missed (a lost message).
     */
    private readLog(id: number, told: ZombieHordeMessage): string | undefined {
        const from = told.logFrom ?? 0;
        if (this.log?.id !== id || this.log.startedAt !== told.startedAt) {
            this.log = { id, startedAt: told.startedAt, entries: [], text: "" };
        }
        const log = this.log;
        if (from > log.entries.length) return undefined;
        // Nothing new: the same text, which the crowd reads as nothing new.
        if (from === log.entries.length && told.avatars === "") return log.text;
        if (from === 0) {
            log.entries = decodeZombieLog(told.avatars);
            log.text = told.avatars;
        } else {
            log.entries = log.entries.slice(0, from).concat(decodeZombieLog(told.avatars));
            log.text = encodeZombieLog(log.entries);
        }
        return log.text;
    }

    /** The horde as last told, once its ground is known. */
    public current(): ZombieHorde | undefined {
        return this.horde;
    }

    private forget(): void {
        if (this.silence) clearTimeout(this.silence);
        this.silence = undefined;
        const had = this.horde !== undefined;
        this.horde = undefined;
        this.terrain = undefined;
        this.log = undefined;
        if (had) this.tell(undefined);
    }

    public destroy(): void {
        this.forget();
    }
}
