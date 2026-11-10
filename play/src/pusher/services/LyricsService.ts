import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { lyricsTrackKey } from "../../common/Lyrics";
import type { LyricsResult, LyricsTrack } from "../../common/Lyrics";

const LrclibLyrics = z.object({
    plainLyrics: z.string().max(100_000).nullable(),
    syncedLyrics: z.string().max(100_000).nullable(),
    instrumental: z.boolean(),
});
const OvhLyrics = z.object({ lyrics: z.string().min(1).max(100_000) });

export type LyricsServiceResult =
    | LyricsResult
    | { status: "limited"; retryAfterMs: number }
    | { status: "unavailable" };

/** Shared, bounded cache and sequential provider access. A caller cancelling never cancels another caller's lookup. */
export class LyricsService {
    private readonly cache = new Map<string, { result: LyricsResult; until: number }>();
    private readonly pending = new Map<string, Promise<LyricsServiceResult>>();
    private tail: Promise<void> = Promise.resolve();
    private nextRequestAt = 0;
    private blockedUntil = 0;

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    public get(track: LyricsTrack): Promise<LyricsServiceResult> {
        const key = lyricsTrackKey(track);
        const cached = this.cache.get(key);
        if (cached && cached.until > this.now()) return Promise.resolve(cached.result);
        const pending = this.pending.get(key);
        if (pending) return pending;
        if (this.blockedUntil > this.now()) {
            return Promise.resolve({ status: "limited", retryAfterMs: this.blockedUntil - this.now() });
        }
        if (this.pending.size >= 32) return Promise.resolve({ status: "limited", retryAfterMs: 10_000 });
        const lookup = this.tail.then(async () => {
            try {
                const result = await this.lookup(track);
                if (result.status === "found" || result.status === "missing") {
                    if (this.cache.size >= 500) {
                        const oldest = this.cache.keys().next().value;
                        if (oldest !== undefined) this.cache.delete(oldest);
                    }
                    this.cache.set(key, {
                        result,
                        until: this.now() + (result.status === "found" ? 24 * 60 * 60_000 : 5 * 60_000),
                    });
                }
                return result;
            } catch {
                return { status: "unavailable" } satisfies LyricsServiceResult;
            } finally {
                this.pending.delete(key);
            }
        });
        this.pending.set(key, lookup);
        this.tail = lookup.then(() => undefined);
        return lookup;
    }

    private async providerRequest(url: URL): Promise<Response | { status: "limited"; retryAfterMs: number }> {
        if (this.blockedUntil > this.now()) {
            return { status: "limited", retryAfterMs: this.blockedUntil - this.now() };
        }
        const wait = this.nextRequestAt - this.now();
        if (wait > 0) await delay(wait);
        const response = await this.fetchFn(url, {
            headers: { "Lrclib-Client": "WorkAdventure-Infogene-Karaoke/1.0 (https://github.com/goyan/workadventure)" },
            signal: AbortSignal.timeout(10_000),
            redirect: "error",
        });
        this.nextRequestAt = this.now() + 750;
        if (response.status === 429 || response.status === 503) {
            const header = response.headers.get("Retry-After");
            const seconds = header === null ? NaN : Number(header);
            const retryAfterMs = Math.max(
                1000,
                Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? "") - this.now() || 60_000,
            );
            this.blockedUntil = this.now() + retryAfterMs;
            return { status: "limited", retryAfterMs };
        }
        return response;
    }

    private async lookup(track: LyricsTrack): Promise<LyricsServiceResult> {
        const url = new URL("https://lrclib.net/api/get");
        url.searchParams.set("track_name", track.title);
        url.searchParams.set("artist_name", track.artist);
        if (track.album) url.searchParams.set("album_name", track.album);
        if (track.durationMs !== undefined)
            url.searchParams.set("duration", String(Math.round(track.durationMs / 1000)));
        const response = await this.providerRequest(url);
        if (!(response instanceof Response)) return response;
        if (response.ok) {
            const parsed = LrclibLyrics.safeParse(await response.json());
            if (!parsed.success) return { status: "unavailable" };
            if (parsed.data.instrumental || parsed.data.plainLyrics || parsed.data.syncedLyrics) {
                return {
                    status: "found",
                    plainLyrics: parsed.data.plainLyrics ?? "",
                    syncedLyrics: parsed.data.syncedLyrics ?? "",
                    instrumental: parsed.data.instrumental,
                    source: "lrclib",
                };
            }
        } else if (response.status !== 404) {
            return { status: "unavailable" };
        }
        const fallback = await this.providerRequest(
            new URL(`https://api.lyrics.ovh/v1/${encodeURIComponent(track.artist)}/${encodeURIComponent(track.title)}`),
        );
        if (!(fallback instanceof Response)) return fallback;
        if (fallback.status === 404) return { status: "missing" };
        if (!fallback.ok) return { status: "unavailable" };
        const parsed = OvhLyrics.safeParse(await fallback.json());
        return parsed.success
            ? {
                  status: "found",
                  plainLyrics: parsed.data.lyrics,
                  syncedLyrics: "",
                  instrumental: false,
                  source: "lyrics.ovh",
              }
            : { status: "unavailable" };
    }
}
