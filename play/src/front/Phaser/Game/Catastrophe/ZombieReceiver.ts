import { ZOMBIE_ASK_WHOLE_MS, ZombieLogWriter, decodeZombieLog, zombieAsk } from "@workadventure/map-editor";
import type { ZombieHorde, ZombieLogEntry } from "@workadventure/map-editor";
import type { CatastropheMessage, ZombieDartMessage, ZombieHordeMessage } from "@workadventure/messages";

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

/** A message of the horde that asks for nothing yet: what a browser fills in to ask the server one thing. */
function zombieAsking(): ZombieHordeMessage {
    return {
        count: 0,
        minutes: 0,
        heading: 0,
        seed: 0,
        startedAt: 0,
        durationMs: 0,
        dirX: 0,
        dirY: 0,
        anchorX: 0,
        anchorY: 0,
        widthCells: 0,
        heightCells: 0,
        terrain: "",
        terrainHash: 0,
        collisions: "",
        collisionsWidth: 0,
        collisionsHeight: 0,
        anchorStep: 0,
        anchorAt: 0,
        msPerStep: 0,
        avatars: "",
        safeStep: 0,
    };
}

/** What a browser sends to ask the server for the whole horde (its ground and its whole log), answered to it alone. */
export function zombieWholeAsked(): ZombieHordeMessage {
    return { ...zombieAsking(), askWhole: true };
}

/** What the browser of a player sends when their Nerf shoots a dart into the horde (ZombieDart). */
export function zombieDartAsked(dart: ZombieDartMessage): ZombieHordeMessage {
    return { ...zombieAsking(), dart };
}

/**
 * The log of a horde as the server wrote it, from what its messages tell: each tells its entries from `logFrom` on
 * (the last ones, a shot alone), the whole log from 0 (with the ground, or to a browser that asked for it).
 */
export class ZombieLogGlue {
    private log: { id: number; startedAt: number; writer: ZombieLogWriter } | undefined;

    /**
     * The whole log with the entries a message tells: its text, undefined when entries before those were missed (a
     * lost message, or joined while the horde goes on). An old message never shortens it. The entries after those
     * known are written on (ZombieLogWriter): a message costs what it tells, not the whole log.
     */
    public read(id: number, message: ZombieHordeMessage): string | undefined {
        const from = message.logFrom ?? 0;
        if (this.log?.id !== id || this.log.startedAt !== message.startedAt) {
            this.log = { id, startedAt: message.startedAt, writer: new ZombieLogWriter() };
        }
        const log = this.log;
        const known = log.writer.entries.length;
        if (from > known) return undefined;
        // The whole log told again (with the ground, every 30 s) as it is known: nothing to read.
        if (from === 0 && known > 0 && message.avatars === log.writer.text) return log.writer.text;
        const entries = message.avatars === "" ? [] : decodeZombieLog(message.avatars);
        // Nothing new (entries known already: the same text, which the crowd reads as nothing new), or an old
        // message: told in order, the log is never shortened.
        const old = from + entries.length < known || (from > 0 && from + entries.length === known);
        if (old || (entries.length === 0 && from === known)) return log.writer.text;
        if (from === 0) log.writer = ZombieLogWriter.of(message.avatars, entries);
        else log.writer.append(entries.slice(known - from));
        return log.writer.text;
    }

    /** The entries of the log as last read, in the order they were told: the same array while it grows. */
    public entries(): readonly ZombieLogEntry[] | undefined {
        return this.log?.writer.entries;
    }

    public forget(): void {
        this.log = undefined;
    }
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
    /** The log of the horde as the server wrote it. */
    private readonly log = new ZombieLogGlue();
    /**
     * The horde last stopped or ended: a message of it that comes after (a whole one answered to this browser, sent
     * in a batch a little later) does not bring it back.
     */
    private ended: { id: number; startedAt: number } | undefined;
    private silence: ReturnType<typeof setTimeout> | undefined;

    /** When this browser last asked for the whole horde (ms, `now`). */
    private askedAt = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly tell: (horde: ZombieHorde | undefined) => void,
        /**
         * Asks the server for the whole horde, its ground and its whole log (zombieWholeAsked): it joined while the
         * horde went on, or lost a message. Once in ZOMBIE_ASK_WHOLE_MS at most; false when it could not be sent.
         */
        private readonly askWhole: () => boolean = () => false,
        private readonly now: () => number = () => Date.now(),
    ) {}

    /** Asks for the whole horde, not too often: the server tells its ground and its whole log every 30 s anyway. */
    private ask(): void {
        const now = this.now();
        if (now - this.askedAt < ZOMBIE_ASK_WHOLE_MS) return;
        if (this.askWhole()) this.askedAt = now;
    }

    public report(message: CatastropheMessage): void {
        const told = message.zombies;
        if (message.impactInMs <= 0 || !told) {
            if (told) this.ended = { id: message.id, startedAt: told.startedAt };
            this.forget();
            return;
        }
        if (this.ended?.id === message.id && this.ended.startedAt === told.startedAt) return;
        if (told.terrain) this.terrain = { hash: told.terrainHash, text: told.terrain };
        if (this.silence) clearTimeout(this.silence);
        this.silence = setTimeout(() => this.forget(), SILENCE_MS);
        const log = this.log.read(message.id, told);
        // Joined while it goes on, or entries of its log missed: the whole of it is asked for.
        if (!this.terrain || this.terrain.hash !== told.terrainHash || log === undefined) this.ask();
        if (!this.terrain || this.terrain.hash !== told.terrainHash) return;
        const horde = zombieHordeOf(message.id, told, this.terrain.text);
        const same = this.horde?.id === horde.id && this.horde.startedAt === horde.startedAt;
        if (log === undefined) {
            // Entries missed: the clock goes on, the log stays where it was complete until the whole one comes.
            if (!same || !this.horde) return;
            this.horde = { ...horde, avatars: this.horde.avatars, safeStep: this.horde.safeStep, log: this.horde.log };
        } else {
            this.horde = { ...horde, avatars: log, log: this.log.entries() };
        }
        // Told each second: where the avatars stood since, the clock of the horde; the view keeps its crowd.
        this.tell(this.horde);
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
        this.log.forget();
        if (had) this.tell(undefined);
    }

    public destroy(): void {
        this.forget();
    }
}
