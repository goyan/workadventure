import { z } from "zod";

/**
 * Name of the area property variable that holds the Jam rooms of a listening zone (see `ListeningZonePropertyData`):
 * a list of `ListeningZoneJam`, each opened by its host. Older values (one Jam, or null) still read.
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

/** The title its host gives a room; without one, the room is named after its host. */
export const MAX_LISTENING_ZONE_JAM_TITLE_LENGTH = 60;
const title = z.string().trim().min(1).max(MAX_LISTENING_ZONE_JAM_TITLE_LENGTH).optional();
/** Set by the host: the light effects of the room are off for everyone, who sees the room as the map draws it. */
const lightsOff = z.boolean().optional();

const SpotifyJam = z.object({
    url: z.string().max(512).refine(isSpotifyJamUrl),
    hostUuid: z.string().min(1).max(256),
    hostName: z.string().max(256),
    title,
    lightsOff,
});

/**
 * A home Jam: no Spotify Jam, the guests' Spotify apps play the host's tracks (desktop app with the WorkAdventure
 * Spicetify extension, Spotify Free included), and they add tracks to the host's queue.
 */
const HomeJam = z.object({
    home: z.literal(true),
    hostUuid: z.string().min(1).max(256),
    hostName: z.string().max(256),
    title,
    // DJ mode: only the host removes tracks from the queue.
    djMode: z.boolean().optional(),
    lightsOff,
});

/** Live music captured from a physical or virtual audio input, with no Spotify account or invite link. */
const LiveJam = z.object({
    live: z.literal(true),
    hostUuid: z.string().min(1).max(256),
    hostName: z.string().max(256),
    title,
    lightsOff,
});

export const ListeningZoneJam = z.union([HomeJam, LiveJam, SpotifyJam]);

export type ListeningZoneJam = z.infer<typeof ListeningZoneJam>;
export type HomeJam = z.infer<typeof HomeJam>;
export type LiveJam = z.infer<typeof LiveJam>;

export function isHomeJam(jam: ListeningZoneJam | null | undefined): jam is HomeJam {
    return jam !== null && jam !== undefined && "home" in jam;
}

export function isLiveJam(jam: ListeningZoneJam | null | undefined): jam is LiveJam {
    return jam !== null && jam !== undefined && "live" in jam;
}

/** Tells one room from another: its Spotify invite link, or its kind and host. */
export function listeningZoneJamKey(jam: ListeningZoneJam): string {
    if (isHomeJam(jam)) return `home:${jam.hostUuid}`;
    if (isLiveJam(jam)) return `live:${jam.hostUuid}`;
    return jam.url;
}

/** Rooms a zone holds at most: each user opens one, and the list travels with every change. */
export const MAX_LISTENING_ZONE_JAMS = 6;

/**
 * Reads the value of the Jam variable, as stored in JSON by the back: the valid rooms, at most one per host. A single
 * Jam (older value) reads as a list of one; anything else as no room.
 */
export function parseListeningZoneJams(value: unknown): ListeningZoneJam[] {
    let json = value;
    if (typeof value === "string") {
        try {
            json = JSON.parse(value);
        } catch {
            return [];
        }
    }
    const entries: unknown[] = Array.isArray(json) ? json : json === null || json === undefined ? [] : [json];
    const jams: ListeningZoneJam[] = [];
    for (const entry of entries.slice(0, MAX_LISTENING_ZONE_JAMS)) {
        const result = ListeningZoneJam.safeParse(entry);
        if (result.success && !jams.some((jam) => jam.hostUuid === result.data.hostUuid)) {
            jams.push(result.data);
        }
    }
    return jams;
}

/**
 * What a client asks to store, read strictly: a list (or null for none) of valid rooms, at most one per host and
 * within the limit. Anything else is refused, not trimmed. Null when refused.
 */
export function parseListeningZoneJamsUpdate(value: string): ListeningZoneJam[] | null {
    let json: unknown;
    try {
        json = JSON.parse(value);
    } catch {
        return null;
    }
    if (json === null) {
        return [];
    }
    const result = z.array(ListeningZoneJam).max(MAX_LISTENING_ZONE_JAMS).safeParse(json);
    if (!result.success) {
        return null;
    }
    const hosts = new Set(result.data.map((jam) => jam.hostUuid));
    return hosts.size === result.data.length ? result.data : null;
}

/**
 * Each user opens, replaces or closes their own room only, one at a time, within the zone's limit. Nobody closes
 * someone else's room: the back does it when its host leaves the zone.
 */
export function canUpdateListeningZoneJams(
    current: readonly ListeningZoneJam[],
    next: readonly ListeningZoneJam[],
    userUuid: string,
): boolean {
    const others = (jams: readonly ListeningZoneJam[]) =>
        JSON.stringify(jams.filter((jam) => jam.hostUuid !== userUuid));
    return (
        next.length <= MAX_LISTENING_ZONE_JAMS &&
        next.filter((jam) => jam.hostUuid === userUuid).length <= 1 &&
        others(next) === others(current)
    );
}
