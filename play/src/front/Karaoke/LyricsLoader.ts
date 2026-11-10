import { writable } from "svelte/store";
import { lyricsRecordingKey } from "../../common/Lyrics";
import type { LyricsResult, LyricsTrack } from "../../common/Lyrics";

export type LyricsLoadState =
    | { status: "empty" }
    | { status: "loading" | "error"; track: LyricsTrack }
    | { status: "ready"; track: LyricsTrack; lyrics: LyricsResult };

/** A panel's cancellable current lookup followed by its single forecast track. */
export class LyricsLoader {
    public readonly state = writable<LyricsLoadState>({ status: "empty" });
    private readonly cache = new Map<string, { result: LyricsResult; until: number }>();
    private readonly pending = new Map<string, { controller: AbortController; promise: Promise<LyricsResult> }>();
    private generation = 0;

    public constructor(private readonly request: (track: LyricsTrack, signal: AbortSignal) => Promise<LyricsResult>) {}

    public async load(track: LyricsTrack | undefined, next?: LyricsTrack): Promise<void> {
        const generation = ++this.generation;
        const wanted = new Set(track ? [lyricsRecordingKey(track), ...(next ? [lyricsRecordingKey(next)] : [])] : []);
        for (const [key, request] of this.pending) {
            if (!wanted.has(key)) {
                request.controller.abort();
                this.pending.delete(key);
            }
        }
        if (!track) {
            this.state.set({ status: "empty" });
            return;
        }
        const cached = this.cached(track);
        this.state.set(cached ? { status: "ready", track, lyrics: cached } : { status: "loading", track });
        try {
            const lyrics = await this.lookup(track);
            if (generation !== this.generation) return;
            this.state.set({ status: "ready", track, lyrics });
            if (next && lyricsRecordingKey(next) !== lyricsRecordingKey(track)) {
                // A missing/error forecast never hides the current song.
                await this.lookup(next).catch(() => undefined);
            }
        } catch {
            if (generation === this.generation) this.state.set({ status: "error", track });
        }
    }

    public destroy(): void {
        this.generation++;
        for (const request of this.pending.values()) request.controller.abort();
        this.pending.clear();
    }

    private async lookup(track: LyricsTrack): Promise<LyricsResult> {
        const key = lyricsRecordingKey(track);
        const cached = this.cached(track);
        if (cached) return cached;
        const pending = this.pending.get(key);
        if (pending) return pending.promise;
        const controller = new AbortController();
        const promise = this.request(track, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) {
                    if (this.cache.size >= 20) {
                        const oldest = this.cache.keys().next().value;
                        if (oldest !== undefined) this.cache.delete(oldest);
                    }
                    this.cache.set(key, {
                        result,
                        until: Date.now() + (result.status === "found" ? 24 * 60 * 60_000 : 5 * 60_000),
                    });
                }
                return result;
            })
            .finally(() => {
                if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
            });
        this.pending.set(key, { controller, promise });
        return promise;
    }

    private cached(track: LyricsTrack): LyricsResult | undefined {
        const entry = this.cache.get(lyricsRecordingKey(track));
        return entry && entry.until > Date.now() ? entry.result : undefined;
    }
}
