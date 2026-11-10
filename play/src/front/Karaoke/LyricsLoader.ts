import { writable } from "svelte/store";
import { lyricsTrackKey } from "../../common/Lyrics";
import type { LyricsResult, LyricsTrack } from "../../common/Lyrics";

export type LyricsLoadState =
    | { status: "empty" }
    | { status: "loading" | "error"; track: LyricsTrack }
    | { status: "ready"; track: LyricsTrack; lyrics: LyricsResult };

/** A panel's cancellable current lookup followed by its single forecast track. */
export class LyricsLoader {
    public readonly state = writable<LyricsLoadState>({ status: "empty" });
    private readonly cache = new Map<string, { result: LyricsResult; until: number }>();
    private controller: AbortController | undefined;
    private generation = 0;

    public constructor(private readonly request: (track: LyricsTrack, signal: AbortSignal) => Promise<LyricsResult>) {}

    public async load(track: LyricsTrack | undefined, next?: LyricsTrack): Promise<void> {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const generation = ++this.generation;
        if (!track) {
            this.state.set({ status: "empty" });
            return;
        }
        const cached = this.cached(track);
        this.state.set(cached ? { status: "ready", track, lyrics: cached } : { status: "loading", track });
        try {
            const lyrics = await this.lookup(track, controller.signal);
            if (controller.signal.aborted || generation !== this.generation) return;
            this.state.set({ status: "ready", track, lyrics });
            if (next && lyricsTrackKey(next) !== lyricsTrackKey(track)) {
                // A missing/error forecast never hides the current song.
                await this.lookup(next, controller.signal).catch(() => undefined);
            }
        } catch {
            if (!controller.signal.aborted && generation === this.generation)
                this.state.set({ status: "error", track });
        }
    }

    public destroy(): void {
        this.generation++;
        this.controller?.abort();
    }

    private async lookup(track: LyricsTrack, signal: AbortSignal): Promise<LyricsResult> {
        const key = lyricsTrackKey(track);
        const cached = this.cached(track);
        if (cached) return cached;
        const result = await this.request(track, signal);
        if (!signal.aborted) {
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
    }

    private cached(track: LyricsTrack): LyricsResult | undefined {
        const entry = this.cache.get(lyricsTrackKey(track));
        return entry && entry.until > Date.now() ? entry.result : undefined;
    }
}
