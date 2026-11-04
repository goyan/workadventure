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

const SpotifyJam = z.object({
    url: z.string().max(512).refine(isSpotifyJamUrl),
    hostUuid: z.string().min(1).max(256),
    hostName: z.string().max(256),
});

/**
 * A home Jam: no Spotify Jam, the guests' Spotify apps play the host's tracks (desktop app with the WorkAdventure
 * Spicetify extension, Spotify Free included), and they add tracks to the host's queue.
 */
const HomeJam = z.object({
    home: z.literal(true),
    hostUuid: z.string().min(1).max(256),
    hostName: z.string().max(256),
});

export const ListeningZoneJam = z.union([HomeJam, SpotifyJam]);

export type ListeningZoneJam = z.infer<typeof ListeningZoneJam>;
export type HomeJam = z.infer<typeof HomeJam>;

export function isHomeJam(jam: ListeningZoneJam | null | undefined): jam is HomeJam {
    return jam !== null && jam !== undefined && "home" in jam;
}

/** Tells one Jam from another: its invite link, or its host for a home Jam. */
export function listeningZoneJamKey(jam: ListeningZoneJam): string {
    return isHomeJam(jam) ? `home:${jam.hostUuid}` : jam.url;
}

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
