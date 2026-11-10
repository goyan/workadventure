import { LyricsResultSchema } from "../../common/Lyrics";
import type { LyricsResult, LyricsTrack } from "../../common/Lyrics";
import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";

export async function fetchLyrics(track: LyricsTrack, signal: AbortSignal): Promise<LyricsResult> {
    const url = new URL("lyrics", ABSOLUTE_PUSHER_URL);
    url.searchParams.set("title", track.title);
    url.searchParams.set("artist", track.artist);
    if (track.album) url.searchParams.set("album", track.album);
    if (track.durationMs !== undefined) url.searchParams.set("durationMs", String(track.durationMs));
    const response = await fetch(url, {
        headers: { Authorization: localUserStore.getAuthToken() ?? "" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) throw new Error(`Lyrics lookup failed (${response.status})`);
    return LyricsResultSchema.parse(await response.json());
}
