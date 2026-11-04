import {
    isHomeJam,
    LISTENING_ZONE_JAM_VARIABLE,
    listeningZoneJamKey,
    type ListeningZoneJam,
    parseListeningZoneJam,
} from "@workadventure/map-editor";
import { derived, get, type Readable, readable, type Unsubscriber } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { areaPropertyVariablesManagerStore, setAreaPropertyVariable } from "../Stores/AreaPropertyVariablesStore";
import { followedUserUuidStore } from "../Spotify/ListeningFollower";
import { listeningByUserUuidStore } from "../Spotify/SpotifyListeningDirectory";
import { currentListeningZoneStore, joinedJamStore, type ListeningZone } from "./ListeningZoneStore";

/** The Jam shared in the listening zone the local player stands in. */
export const currentJamStore: Readable<ListeningZoneJam | null> = readable<ListeningZoneJam | null>(null, (set) => {
    let unsubscribeChanges: Unsubscriber | undefined;
    const unsubscribe = derived(
        [currentListeningZoneStore, areaPropertyVariablesManagerStore],
        (values) => values,
    ).subscribe(([zone, manager]) => {
        unsubscribeChanges?.();
        unsubscribeChanges = undefined;
        if (!zone || !manager) {
            set(null);
            return;
        }
        // variableChanges emits right away, then on every change of any area variable.
        unsubscribeChanges = manager.variableChanges.subscribe(() => {
            set(parseListeningZoneJam(manager.getVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE)));
        });
    });
    return () => {
        unsubscribe();
        unsubscribeChanges?.();
    };
});

/** How many people took part in the Jam of the current zone, its host included. */
export const currentJamParticipantsCountStore: Readable<number> = derived(
    [currentListeningZoneStore, listeningByUserUuidStore],
    ([zone, listeningByUuid]) =>
        zone ? [...listeningByUuid.values()].filter((listening) => listening.jamAreaId === zone.areaId).length : 0,
);

export function isLocalUser(uuid: string): boolean {
    return uuid === localUserStore.getLocalUser()?.uuid;
}

export function enterListeningZone(zone: ListeningZone): void {
    currentListeningZoneStore.set(zone);
}

/**
 * Leaving the zone ends our part in its Jam. The back also removes the Jam if we were its host, but doing it here
 * spares everyone else a Jam whose host already left.
 */
export function leaveListeningZone(propertyId: string): void {
    const zone = get(currentListeningZoneStore);
    if (zone?.propertyId !== propertyId) {
        return;
    }
    const jam = get(currentJamStore);
    if (jam && isLocalUser(jam.hostUuid)) {
        setAreaPropertyVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, null);
    }
    stopFollowingHomeJamHost(jam);
    joinedJamStore.set(undefined);
    currentListeningZoneStore.set(undefined);
}

export function shareJam(url: string): void {
    const zone = get(currentListeningZoneStore);
    const uuid = localUserStore.getLocalUser()?.uuid;
    if (!zone || !uuid) {
        return;
    }
    const jam: ListeningZoneJam = { url, hostUuid: uuid, hostName: localUserStore.getName() ?? "" };
    // The back may refuse it (someone shared a Jam just before): syncJoinedJam() marks us in it once accepted.
    setAreaPropertyVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, jam);
}

/** Hosts a home Jam: guests with the desktop app and Spicetify play this user's tracks and add to their queue. */
export function startHomeJam(): void {
    const zone = get(currentListeningZoneStore);
    const uuid = localUserStore.getLocalUser()?.uuid;
    if (!zone || !uuid) {
        return;
    }
    const jam: ListeningZoneJam = { home: true, hostUuid: uuid, hostName: localUserStore.getName() ?? "" };
    setAreaPropertyVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, jam);
}

/** Joining a home Jam is listening along with its host, as long as we stay in it. */
export function joinHomeJam(): void {
    const zone = get(currentListeningZoneStore);
    const jam = get(currentJamStore);
    if (!zone || !isHomeJam(jam)) {
        return;
    }
    followedUserUuidStore.set(jam.hostUuid);
    joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: listeningZoneJamKey(jam) });
}

export function leaveHomeJam(): void {
    stopFollowingHomeJamHost(get(currentJamStore));
    joinedJamStore.set(undefined);
}

function stopFollowingHomeJamHost(jam: ListeningZoneJam | null): void {
    if (isHomeJam(jam) && get(followedUserUuidStore) === jam.hostUuid) {
        followedUserUuidStore.set(undefined);
    }
}

export function stopSharingJam(): void {
    const zone = get(currentListeningZoneStore);
    if (!zone) {
        return;
    }
    setAreaPropertyVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, null);
    joinedJamStore.set(undefined);
}

export function joinJam(): void {
    const zone = get(currentListeningZoneStore);
    const jam = get(currentJamStore);
    if (!zone || !jam || isHomeJam(jam)) {
        return;
    }
    window.open(jam.url, "_blank", "noopener,noreferrer");
    joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: jam.url });
}

/**
 * Keeps the joined Jam in line with the one shared in the zone: its host takes part in it as soon as the server
 * accepted it, and it is forgotten once removed or replaced by another one. A home Jam ends for a guest who stops
 * listening along with its host, and the follow ends with the home Jam.
 */
export function syncJoinedJam(): Unsubscriber {
    let previous: ListeningZoneJam | null = null;
    const unsubscribeJam = currentJamStore.subscribe((jam) => {
        const zone = get(currentListeningZoneStore);
        const joined = get(joinedJamStore);
        const key = jam ? listeningZoneJamKey(jam) : undefined;
        if (jam && zone && isLocalUser(jam.hostUuid)) {
            if (joined?.url !== key) {
                joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: listeningZoneJamKey(jam) });
            }
        } else if (joined && joined.url !== key) {
            if (previous && joined.url === listeningZoneJamKey(previous)) {
                stopFollowingHomeJamHost(previous);
            }
            joinedJamStore.set(undefined);
        }
        previous = jam;
    });
    const unsubscribeFollow = followedUserUuidStore.subscribe((followed) => {
        const jam = get(currentJamStore);
        const joined = get(joinedJamStore);
        if (isHomeJam(jam) && !isLocalUser(jam.hostUuid) && joined?.url === listeningZoneJamKey(jam)) {
            if (followed !== jam.hostUuid) {
                joinedJamStore.set(undefined);
            }
        }
    });
    return () => {
        unsubscribeJam();
        unsubscribeFollow();
    };
}
