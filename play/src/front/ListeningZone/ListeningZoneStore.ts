import { writable } from "svelte/store";

export interface ListeningZone {
    areaId: string;
    propertyId: string;
    areaName: string;
}

export interface JoinedJam {
    areaId: string;
    areaName: string;
    // Joining is tied to one invite link: a new Jam in the same zone is not joined until "Join" is clicked again.
    url: string;
}

/** The listening zone the local player stands in, if any. */
export const currentListeningZoneStore = writable<ListeningZone | undefined>(undefined);

/**
 * The Jam the local player clicked "Join" on, while they stay in its zone. Spotify does not tell who is in a Jam:
 * this is what "listening through a Jam" means for us.
 */
export const joinedJamStore = writable<JoinedJam | undefined>(undefined);
