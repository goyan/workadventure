import type { FishingContestMessage, FishingRecordMessage } from "@workadventure/messages";

/** How long the podium of a contest stays once it ended. */
export const FISHING_PODIUM_MS = 20_000;
/** The lines of the ranking shown while a contest runs; the local player is always shown. */
export const FISHING_RANKING_ROWS = 5;
/** The lines of the podium. */
export const FISHING_PODIUM_ROWS = 3;

export interface FishingContestRow {
    rank: number;
    name: string;
    totalGrams: number;
    /** The heaviest catch of the player. */
    bestGrams: number;
    catches: number;
    /** The local player. */
    own: boolean;
}

/** The fishing contest of the room as this browser shows it. */
export interface FishingContestShown {
    hostName: string;
    minutes: number;
    /** When the contest ends on the clock of this browser (the server tells how long is left, not a date). */
    endsAt: number;
    finished: boolean;
    /** Every player, the winner first. */
    rows: FishingContestRow[];
}

/** The heaviest fish ever caught on the map. */
export interface FishingRecordShown {
    name: string;
    grams: number;
    female: boolean;
    /** When, in milliseconds since 1970. */
    at: number;
}

/** What the server tells of a contest, for this browser: its own line marked, its end on the local clock. */
export function contestShown(
    message: FishingContestMessage,
    ownId: number | undefined,
    now: number,
): FishingContestShown {
    return {
        hostName: message.hostName,
        minutes: message.minutes,
        endsAt: now + message.remainingMs,
        finished: message.finished,
        rows: message.entries.map((entry, index) => ({
            rank: index + 1,
            name: entry.name,
            totalGrams: entry.totalGrams,
            bestGrams: entry.bestGrams,
            catches: entry.catches,
            // 0: the server no longer knows which player of the room this is.
            own: ownId !== undefined && entry.userId !== 0 && entry.userId === ownId,
        })),
    };
}

/** The lines to show: the first ones, and the local player's own when it is further down. */
export function shownRows(rows: readonly FishingContestRow[], count: number): FishingContestRow[] {
    const first = rows.slice(0, count);
    const own = rows.find((row) => row.own);
    return own && own.rank > count ? [...first, own] : first;
}

/** The heaviest catch of a contest and who made it; undefined when nothing was caught. */
export function biggestCatch(rows: readonly FishingContestRow[]): { name: string; grams: number } | undefined {
    let best: FishingContestRow | undefined;
    for (const row of rows) if (!best || row.bestGrams > best.bestGrams) best = row;
    return best ? { name: best.name, grams: best.bestGrams } : undefined;
}

/** The time left as "03:12"; never under zero. */
export function formatRemaining(milliseconds: number): string {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function recordShown(message: FishingRecordMessage): FishingRecordShown {
    return {
        name: message.name,
        grams: message.grams,
        female: message.kind % 2 === 1,
        at: message.atSeconds * 1000,
    };
}
