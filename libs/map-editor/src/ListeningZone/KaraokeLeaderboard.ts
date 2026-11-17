import { z } from "zod";

/** Sent by the server to the whole room when a song's ranking changes, and to one player who asked for it. */
export const KARAOKE_LEADERBOARD_EVENT = "workadventure.karaoke-leaderboard";
/** Sent by a player to the server only: the ranking of one song. */
export const KARAOKE_LEADERBOARD_REQUEST_EVENT = "workadventure.karaoke-leaderboard-request";
export const KARAOKE_LEADERBOARD_SIZE = 11;
/** A turn ranks only once half the melody was sung: a singer leaving the stage early does not fill the ranking. */
export const KARAOKE_LEADERBOARD_MIN_COVERAGE = 50;

export const KaraokeLeaderboardEntrySchema = z.object({
    singerUuid: z.string().min(1).max(256),
    name: z.string().max(200),
    score: z.number().int().min(0).max(10_000),
    accuracy: z.number().int().min(0).max(100),
    at: z.number().int().nonnegative(),
});
export const KaraokeSongLeaderboardSchema = z.object({
    recordingKey: z.string().min(1).max(1000),
    title: z.string().min(1).max(200),
    artist: z.string().min(1).max(200),
    entries: z.array(KaraokeLeaderboardEntrySchema).max(KARAOKE_LEADERBOARD_SIZE),
});
export const KaraokeLeaderboardRequestSchema = z.object({ recordingKey: z.string().min(1).max(1000) });
export type KaraokeLeaderboardEntry = z.infer<typeof KaraokeLeaderboardEntrySchema>;
export type KaraokeSongLeaderboard = z.infer<typeof KaraokeSongLeaderboardSchema>;

/**
 * Keeps each singer's best turn on a song, best first: equal scores go to the better accuracy, then to whoever reached
 * it first. Returns the same ranking when the turn does not improve the singer's best.
 */
export function addKaraokeLeaderboardEntry(
    board: KaraokeSongLeaderboard,
    entry: KaraokeLeaderboardEntry,
): KaraokeSongLeaderboard {
    const previous = board.entries.find((candidate) => candidate.singerUuid === entry.singerUuid);
    if (previous && compareEntries(previous, entry) <= 0) return board;
    return {
        ...board,
        entries: [...board.entries.filter((candidate) => candidate.singerUuid !== entry.singerUuid), entry]
            .sort(compareEntries)
            .slice(0, KARAOKE_LEADERBOARD_SIZE),
    };
}

function compareEntries(first: KaraokeLeaderboardEntry, second: KaraokeLeaderboardEntry): number {
    return second.score - first.score || second.accuracy - first.accuracy || first.at - second.at;
}
