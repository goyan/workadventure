import { z } from "zod";

/**
 * Name of the area property variable that holds the Spotify Jam shared in a listening zone
 * (see `ListeningZonePropertyData`). Its value is a `ListeningZoneJam`, or null when no Jam is shared.
 */
export const LISTENING_ZONE_JAM_VARIABLE = "jam";

/**
 * Spotify has no API for Jams: the only thing we can share is the invite link the host copies from the app.
 * It is either a short link (`spotify.link/…`) or the full `open.spotify.com/socialsession/…` link.
 */
export function isSpotifyJamUrl(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if (url.protocol !== "https:") {
        return false;
    }
    if (url.hostname === "spotify.link") {
        return url.pathname.length > 1;
    }
    return url.hostname === "open.spotify.com" && url.pathname.startsWith("/socialsession/");
}

export const ListeningZoneJam = z.object({
    url: z.string().max(512).refine(isSpotifyJamUrl),
    hostUuid: z.string().min(1).max(256),
    hostName: z.string().max(256),
});

export type ListeningZoneJam = z.infer<typeof ListeningZoneJam>;

/**
 * Reads the value of the Jam variable, as stored in JSON by the back. Anything that is not a valid Jam reads as
 * "no Jam".
 */
export function parseListeningZoneJam(value: unknown): ListeningZoneJam | null {
    let json = value;
    if (typeof value === "string") {
        try {
            json = JSON.parse(value);
        } catch {
            return null;
        }
    }
    const result = ListeningZoneJam.safeParse(json);
    return result.success ? result.data : null;
}

/**
 * Only one Jam is shared at a time in a zone, and only its host can replace or remove it. Nobody else needs to:
 * the back removes it as soon as the host leaves the zone.
 */
export function canUpdateListeningZoneJam(
    current: ListeningZoneJam | null,
    next: ListeningZoneJam | null,
    userUuid: string,
): boolean {
    if (current !== null && current.hostUuid !== userUuid) {
        return false;
    }
    return next === null || next.hostUuid === userUuid;
}
