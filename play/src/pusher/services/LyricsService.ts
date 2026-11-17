import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { lyricsTrackKey } from "../../common/Lyrics";
import type { LyricsResult, LyricsTrack } from "../../common/Lyrics";

const LrclibLyrics = z.object({
    plainLyrics: z.string().max(100_000).nullable(),
    syncedLyrics: z.string().max(100_000).nullable(),
    instrumental: z.boolean(),
});
const LrclibSearchResults = z
    .array(
        LrclibLyrics.extend({
            trackName: z.string().max(1000).nullish(),
            artistName: z.string().max(1000).nullish(),
            albumName: z.string().max(1000).nullish(),
            duration: z.number().nullish(),
        }),
    )
    .max(100);
type LrclibSearchResult = z.infer<typeof LrclibSearchResults>[number];
const OvhLyrics = z.object({ lyrics: z.string().min(1).max(100_000) });

function normalizeName(name: string): string {
    return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function primaryArtist(artist: string): string {
    return artist.split(/,\s+|\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim();
}

/** The title without its edition labels ("- Arabic Version", "(Remastered)"): to find every synced version. */
function baseTitle(title: string): string {
    return (
        title
            .replace(/\s*[([][^)\]]*[)\]]/g, "")
            .replace(/\s+-\s+.*$/, "")
            .trim() || title
    );
}

const COMPARED_LINES = 6;
/** A version further than this from what the others agree on is a mistimed contribution. */
const MAX_TIMING_DRIFT_MS = 1000;

/**
 * Several people often sync the same recording on LRCLIB, and one of them may be off by seconds. Among the versions with
 * the same first lines, the one whose timing is closest to the others wins over an outlier; with fewer than three
 * versions to compare, nothing can be decided and the exact match stays.
 */
export function agreedTiming(exact: string, others: readonly string[]): string {
    const reference = timedLines(exact);
    // The exact match is often listed again among the versions: it must not vote for itself.
    const candidates = others.filter((other) => other !== exact);
    const pool = [exact, ...candidates]
        .map(timedLines)
        .map((lines, index) => ({ lines, lrc: index === 0 ? exact : candidates[index - 1] }))
        .filter(
            ({ lines }, index) =>
                index === 0 || (lines.length >= 3 && lines.every((line, row) => line.text === reference[row]?.text)),
        );
    if (pool.length < 3 || reference.length < 3) return exact;
    const spread = (index: number): number =>
        median(pool.flatMap((other, row) => (row === index ? [] : [timingGap(pool[index].lines, other.lines)])));
    const best = pool.reduce((best, _, index) => (spread(index) < spread(best) ? index : best), 0);
    return spread(0) - spread(best) > MAX_TIMING_DRIFT_MS ? pool[best].lrc : exact;
}

function timedLines(lrc: string): { atMs: number; text: string }[] {
    return lrc
        .split(/\r?\n/)
        .flatMap((line) => {
            const match = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line.trim());
            const text = match ? normalizeName(match[3]).replace(/[^\p{L}\p{N}]/gu, "") : "";
            return match && text ? [{ atMs: (Number(match[1]) * 60 + Number(match[2])) * 1000, text }] : [];
        })
        .slice(0, COMPARED_LINES);
}

function timingGap(first: readonly { atMs: number }[], second: readonly { atMs: number }[]): number {
    const count = Math.min(first.length, second.length);
    let total = 0;
    for (let index = 0; index < count; index++) total += Math.abs(first[index].atMs - second[index].atMs);
    return count === 0 ? Infinity : total / count;
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function songTitle(title: string): string {
    // Featured credits vary across catalogues; live/remix/version labels must stay distinct.
    return title.replace(/\s*[([](?:feat\.?|ft\.?|featuring)\s+[^)\]]+[)\]]\s*$/i, "").trim();
}

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
                const exact: LyricsResult = {
                    status: "found",
                    plainLyrics: parsed.data.plainLyrics ?? "",
                    syncedLyrics: parsed.data.syncedLyrics ?? "",
                    instrumental: parsed.data.instrumental,
                    source: "lrclib",
                };
                // A version chosen by hand in the panel only has a title and an artist: show it as is.
                const automatic = Boolean(track.album) || track.durationMs !== undefined;
                if (exact.syncedLyrics.trim() && automatic && track.durationMs !== undefined) {
                    const timing = agreedTiming(exact.syncedLyrics, await this.syncedVersions(track));
                    return timing === exact.syncedLyrics ? exact : { ...exact, syncedLyrics: timing };
                }
                if (exact.instrumental || exact.syncedLyrics.trim() || !automatic) return exact;
                const equivalent = await this.searchEquivalent(track, true);
                return equivalent?.status === "found" ? equivalent : exact;
            }
        } else if (response.status !== 404) {
            return { status: "unavailable" };
        }
        const equivalent = await this.searchEquivalent(track, false);
        if (equivalent) return equivalent;
        const fallback = await this.providerRequest(
            new URL(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist(track.artist))}/${encodeURIComponent(songTitle(track.title))}`,
            ),
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

    /**
     * The other synced versions of a recording (any edition label, the same duration within 3 seconds): their text is
     * compared before their timing is trusted. A failed search gives none.
     */
    private async syncedVersions(track: LyricsTrack): Promise<string[]> {
        try {
            const url = new URL("https://lrclib.net/api/search");
            url.searchParams.set("track_name", baseTitle(track.title));
            url.searchParams.set("artist_name", primaryArtist(track.artist));
            const response = await this.providerRequest(url);
            if (!(response instanceof Response) || !response.ok) return [];
            const parsed = LrclibSearchResults.safeParse(await response.json());
            if (!parsed.success || track.durationMs === undefined) return [];
            const seconds = track.durationMs / 1000;
            return parsed.data.flatMap((candidate) =>
                !candidate.instrumental &&
                candidate.syncedLyrics?.trim() &&
                candidate.duration !== null &&
                candidate.duration !== undefined &&
                Math.abs(candidate.duration - seconds) <= 3 &&
                normalizeName(primaryArtist(candidate.artistName ?? "")) === normalizeName(primaryArtist(track.artist))
                    ? [candidate.syncedLyrics]
                    : [],
            );
        } catch {
            return [];
        }
    }

    /**
     * LRCLIB stores one entry per edition: the exact album may only have plain lyrics while another edition of the
     * same recording is synced. Any failure keeps the plain lyrics already found.
     */
    private async searchEquivalent(track: LyricsTrack, syncedOnly: boolean): Promise<LyricsServiceResult | undefined> {
        try {
            const url = new URL("https://lrclib.net/api/search");
            url.searchParams.set("track_name", songTitle(track.title));
            url.searchParams.set("artist_name", primaryArtist(track.artist));
            const response = await this.providerRequest(url);
            if (!(response instanceof Response)) return response;
            if (!response.ok) return { status: "unavailable" };
            const parsed = LrclibSearchResults.safeParse(await response.json());
            if (!parsed.success) return { status: "unavailable" };
            const same = (a: string | null | undefined, b: string | undefined) =>
                a !== null && a !== undefined && b !== undefined && normalizeName(a) === normalizeName(b);
            const seconds = track.durationMs === undefined ? undefined : track.durationMs / 1000;
            const gap = (candidate: LrclibSearchResult) =>
                seconds === undefined
                    ? 0
                    : candidate.duration === null || candidate.duration === undefined
                      ? Infinity
                      : Math.abs(candidate.duration - seconds);
            const candidates = parsed.data.filter(
                (candidate) =>
                    !candidate.instrumental &&
                    (syncedOnly
                        ? Boolean(candidate.syncedLyrics?.trim())
                        : Boolean(candidate.syncedLyrics?.trim() || candidate.plainLyrics?.trim())) &&
                    // The search is fuzzy: never take another song, whatever its duration.
                    same(
                        candidate.trackName ? songTitle(candidate.trackName) : candidate.trackName,
                        songTitle(track.title),
                    ) &&
                    same(
                        candidate.artistName ? primaryArtist(candidate.artistName) : candidate.artistName,
                        primaryArtist(track.artist),
                    ) &&
                    (seconds === undefined || gap(candidate) <= 3),
            );
            const sameAlbum = (candidate: LrclibSearchResult) => (same(candidate.albumName, track.album) ? 0 : 1);
            const rank = (a: LrclibSearchResult, b: LrclibSearchResult): number =>
                Number(!a.syncedLyrics?.trim()) - Number(!b.syncedLyrics?.trim()) ||
                sameAlbum(a) - sameAlbum(b) ||
                gap(a) - gap(b);
            const best = candidates.reduce<LrclibSearchResult | undefined>(
                (best, candidate) => (!best || rank(candidate, best) < 0 ? candidate : best),
                undefined,
            );
            if (!best) return undefined;
            return {
                status: "found",
                plainLyrics: best.plainLyrics ?? "",
                syncedLyrics: best.syncedLyrics ?? "",
                instrumental: false,
                source: "lrclib",
            };
        } catch {
            return { status: "unavailable" };
        }
    }
}
