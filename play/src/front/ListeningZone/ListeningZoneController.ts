import { LISTENING_ZONE_JAM_VARIABLE, type ListeningZoneJam, parseListeningZoneJam } from "@workadventure/map-editor";
import { derived, get, type Readable, readable, type Unsubscriber } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { areaPropertyVariablesManagerStore, setAreaPropertyVariable } from "../Stores/AreaPropertyVariablesStore";
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
    if (!zone || !jam) {
        return;
    }
    window.open(jam.url, "_blank", "noopener,noreferrer");
    joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: jam.url });
}

/**
 * Keeps the joined Jam in line with the one shared in the zone: its host takes part in it as soon as the server
 * accepted it, and it is forgotten once removed or replaced by another one.
 */
export function syncJoinedJam(): Unsubscriber {
    return currentJamStore.subscribe((jam) => {
        const zone = get(currentListeningZoneStore);
        const joined = get(joinedJamStore);
        if (jam && zone && isLocalUser(jam.hostUuid)) {
            if (joined?.url !== jam.url) {
                joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: jam.url });
            }
        } else if (joined && joined.url !== jam?.url) {
            joinedJamStore.set(undefined);
        }
    });
}
