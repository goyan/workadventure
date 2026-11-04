import { writable } from "svelte/store";

export interface ListeningZone {
    areaId: string;
    propertyId: string;
    areaName: string;
}

export interface JoinedJam {
    areaId: string;
    areaName: string;
    // Joining is tied to one room: its invite link, or "home:<host>" for a home Jam (listeningZoneJamKey).
    url: string;
    // The room's host: the zone holds one room per host, and participants are counted by room.
    hostUuid: string;
}

/** The listening zone the local player stands in, if any. */
export const currentListeningZoneStore = writable<ListeningZone | undefined>(undefined);

/**
 * The Jam the local player clicked "Join" on, while they stay in its zone. Spotify does not tell who is in a Jam:
 * this is what "listening through a Jam" means for us.
 */
export const joinedJamStore = writable<JoinedJam | undefined>(undefined);
