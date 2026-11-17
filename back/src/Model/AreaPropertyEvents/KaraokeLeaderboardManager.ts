import type { KaraokeLeaderboardEntry, KaraokeReference, KaraokeSongLeaderboard } from "@workadventure/map-editor";
import { addKaraokeLeaderboardEntry, KaraokeSongLeaderboardSchema } from "@workadventure/map-editor";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../../Services/Repository/VariablesRepositoryInterface";

const PackedLeaderboardSchema = z.tuple([
    z.string(),
    z.string(),
    z.array(z.tuple([z.string(), z.string(), z.number(), z.number(), z.number()])),
]);

/**
 * The karaoke ranking of each song of a map, its 11 best singers: kept in its own Redis hash (one field per song), so it
 * survives restarts and the room emptying. Loaded once, on the first use.
 */
export class KaraokeLeaderboardManager {
    private boards: Promise<Map<string, KaraokeSongLeaderboard>> | undefined;

    constructor(private readonly store: { repository: VariablesRepositoryInterface; roomUrl: string }) {}

    public async get(recordingKey: string): Promise<KaraokeSongLeaderboard | undefined> {
        return (await this.load()).get(recordingKey);
    }

    /** Records a finished turn; resolves with the new ranking, or undefined when the turn did not change it. */
    public async record(
        reference: Pick<KaraokeReference, "recordingKey" | "title" | "artist">,
        entry: KaraokeLeaderboardEntry,
    ): Promise<KaraokeSongLeaderboard | undefined> {
        const boards = await this.load();
        const board = boards.get(reference.recordingKey) ?? { ...reference, entries: [] };
        const next = addKaraokeLeaderboardEntry(board, entry);
        if (next === board) return undefined;
        boards.set(reference.recordingKey, next);
        await this.store.repository.saveVariable(this.hashKey(), reference.recordingKey, pack(next));
        return next;
    }

    private load(): Promise<Map<string, KaraokeSongLeaderboard>> {
        this.boards ??= this.store.repository.loadVariables(this.hashKey()).then(
            (saved) =>
                new Map(
                    Object.entries(saved).flatMap(([recordingKey, value]) => {
                        const board = unpack(recordingKey, value);
                        return board ? [[recordingKey, board] as const] : [];
                    }),
                ),
        );
        return this.boards;
    }

    private hashKey(): string {
        return `karaokeLeaderboards:${this.store.roomUrl}`;
    }
}

/**
 * A ranking as Redis keeps it: no field names, the song key already being the field, times in seconds. About half the
 * size of the JSON players receive: `[title, artist, [[singerUuid, name, score, accuracy, atSeconds], …]]`.
 */
function pack(board: KaraokeSongLeaderboard): string {
    return JSON.stringify([
        board.title,
        board.artist,
        board.entries.map((entry) => [
            entry.singerUuid,
            entry.name,
            entry.score,
            entry.accuracy,
            Math.floor(entry.at / 1000),
        ]),
    ]);
}

function unpack(recordingKey: string, value: string): KaraokeSongLeaderboard | undefined {
    const packed = PackedLeaderboardSchema.safeParse(safeJson(value));
    if (!packed.success) return undefined;
    const [title, artist, entries] = packed.data;
    const board = KaraokeSongLeaderboardSchema.safeParse({
        recordingKey,
        title,
        artist,
        entries: entries.map(([singerUuid, name, score, accuracy, atSeconds]) => ({
            singerUuid,
            name,
            score,
            accuracy,
            at: atSeconds * 1000,
        })),
    });
    return board.success ? board.data : undefined;
}

function safeJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}
