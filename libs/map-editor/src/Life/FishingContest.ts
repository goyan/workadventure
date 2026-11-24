/**
 * The rules of a fishing contest (see Fishing for the rules of a line). Pure: the server keeps the contest of a room
 * and runs these; a browser only shows what it is told.
 *
 * A contest lasts a few minutes. Every catch made meanwhile counts for the player who made it, whoever started the
 * contest. The heaviest basket wins; a fish, let go after each catch, counts once for a player.
 */

/** How long a contest may last, in minutes. */
export const FISHING_CONTEST_MINUTES: readonly number[] = [3, 5, 10];

/** A player of a contest: `key` stays the same through a reconnection (the uuid of the user), `name` is shown. */
export interface FishingContestPlayer {
    key: string;
    name: string;
}

export interface FishingContestEntry {
    key: string;
    name: string;
    totalGrams: number;
    /** The heaviest catch of the player. */
    bestGrams: number;
    catches: number;
    /** When the player got to this total: of two equal players, the first is ahead. */
    scoredAt: number;
}

export interface FishingContest {
    hostName: string;
    minutes: number;
    startedAt: number;
    endsAt: number;
    entries: Map<string, FishingContestEntry>;
    /** The fish each player already caught in this contest, by player key. */
    caught: Map<string, Set<number>>;
}

/** The heaviest fish ever caught on a map. */
export interface FishingRecord {
    name: string;
    grams: number;
    female: boolean;
    at: number;
}

/** A contest that starts now; undefined when it may not last that long. */
export function startContest(host: FishingContestPlayer, minutes: number, now: number): FishingContest | undefined {
    if (!FISHING_CONTEST_MINUTES.includes(minutes)) return undefined;
    return {
        hostName: host.name,
        minutes,
        startedAt: now,
        endsAt: now + minutes * 60_000,
        entries: new Map(),
        caught: new Map(),
    };
}

export function contestOver(contest: FishingContest, now: number): boolean {
    return now >= contest.endsAt;
}

/** A catch made during a contest. False when it does not count: the contest is over, or the player had this fish. */
export function recordCatch(
    contest: FishingContest,
    player: FishingContestPlayer,
    fishId: number,
    grams: number,
    now: number,
): boolean {
    if (contestOver(contest, now)) return false;
    let fish = contest.caught.get(player.key);
    if (!fish) {
        fish = new Set();
        contest.caught.set(player.key, fish);
    }
    if (fish.has(fishId)) return false;
    fish.add(fishId);
    const entry = contest.entries.get(player.key);
    if (entry) {
        entry.name = player.name;
        entry.totalGrams += grams;
        entry.bestGrams = Math.max(entry.bestGrams, grams);
        entry.catches++;
        entry.scoredAt = now;
    } else {
        contest.entries.set(player.key, {
            key: player.key,
            name: player.name,
            totalGrams: grams,
            bestGrams: grams,
            catches: 1,
            scoredAt: now,
        });
    }
    return true;
}

/** The players of a contest, the winner first: total weight, then heaviest catch, then who got there first. */
export function contestRanking(contest: FishingContest): FishingContestEntry[] {
    return [...contest.entries.values()].sort(
        (a, b) => b.totalGrams - a.totalGrams || b.bestGrams - a.bestGrams || a.scoredAt - b.scoredAt,
    );
}

/** The record of a map after a catch: only a heavier fish beats it. */
export function betterRecord(record: FishingRecord | undefined, candidate: FishingRecord): FishingRecord {
    return record && record.grams >= candidate.grams ? record : candidate;
}
