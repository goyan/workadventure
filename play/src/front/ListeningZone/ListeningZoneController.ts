import {
    isHomeJam,
    LISTENING_ZONE_JAM_VARIABLE,
    listeningZoneJamKey,
    type ListeningZoneJam,
    MAX_LISTENING_ZONE_JAMS,
    parseListeningZoneJams,
} from "@workadventure/map-editor";
import { derived, get, type Readable, readable, type Unsubscriber } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { areaPropertyVariablesManagerStore, setAreaPropertyVariable } from "../Stores/AreaPropertyVariablesStore";
import { followedUserUuidStore } from "../Spotify/ListeningFollower";
import { listeningByUserUuidStore } from "../Spotify/SpotifyListeningDirectory";
import { currentListeningZoneStore, joinedJamStore, type ListeningZone } from "./ListeningZoneStore";

/** The Jam rooms of the listening zone the local player stands in: one per host, Spotify or home Jam. */
export const currentJamsStore: Readable<ListeningZoneJam[]> = readable<ListeningZoneJam[]>([], (set) => {
    let unsubscribeChanges: Unsubscriber | undefined;
    const unsubscribe = derived(
        [currentListeningZoneStore, areaPropertyVariablesManagerStore],
        (values) => values,
    ).subscribe(([zone, manager]) => {
        unsubscribeChanges?.();
        unsubscribeChanges = undefined;
        if (!zone || !manager) {
            set([]);
            return;
        }
        // variableChanges emits right away, then on every change of any area variable.
        unsubscribeChanges = manager.variableChanges.subscribe(() => {
            set(parseListeningZoneJams(manager.getVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE)));
        });
    });
    return () => {
        unsubscribe();
        unsubscribeChanges?.();
    };
});

/** The room the local user hosts in the current zone, if any: a user opens one room at a time. */
export const ownJamStore: Readable<ListeningZoneJam | undefined> = derived(currentJamsStore, (jams) =>
    jams.find((jam) => isLocalUser(jam.hostUuid)),
);

/** Whether the zone still has room for another Jam room. */
export const canOpenJamStore: Readable<boolean> = derived(
    currentJamsStore,
    (jams) => jams.length < MAX_LISTENING_ZONE_JAMS,
);

/** How many people take part in each room of the current zone, its host included, by host uuid. */
export const jamParticipantsCountStore: Readable<Map<string, number>> = derived(
    [currentListeningZoneStore, listeningByUserUuidStore],
    ([zone, listeningByUuid]) => {
        const counts = new Map<string, number>();
        for (const listening of listeningByUuid.values()) {
            if (zone && listening.jamAreaId === zone.areaId && listening.jamHostUuid !== "") {
                counts.set(listening.jamHostUuid, (counts.get(listening.jamHostUuid) ?? 0) + 1);
            }
        }
        return counts;
    },
);

export function isLocalUser(uuid: string): boolean {
    return uuid === localUserStore.getLocalUser()?.uuid;
}

export function enterListeningZone(zone: ListeningZone): void {
    currentListeningZoneStore.set(zone);
}

/**
 * Leaving the zone ends our part in its rooms. The back also closes our room once we are out, but doing it here
 * spares everyone else a room whose host already left.
 */
export function leaveListeningZone(propertyId: string): void {
    const zone = get(currentListeningZoneStore);
    if (zone?.propertyId !== propertyId) {
        return;
    }
    if (get(ownJamStore)) {
        writeOthersRooms(zone);
    }
    leaveJam();
    currentListeningZoneStore.set(undefined);
}

/** Opens (or replaces) our room with a Spotify Jam: its invite link is offered to the zone. */
export function shareJam(url: string): void {
    openRoom((uuid, hostName) => ({ url, hostUuid: uuid, hostName }));
}

/** Opens (or replaces) our room with a home Jam: guests with the desktop app and Spicetify follow our tracks. */
export function startHomeJam(): void {
    openRoom((uuid, hostName) => ({ home: true, hostUuid: uuid, hostName }));
}

/** Closes our room; the other rooms of the zone stay. */
export function stopSharingJam(): void {
    const zone = get(currentListeningZoneStore);
    if (!zone) {
        return;
    }
    writeOthersRooms(zone);
    leaveJam();
}

/** Joins a Spotify Jam room: its invite link opens in Spotify. Joining a room leaves the previous one. */
export function joinJam(jam: ListeningZoneJam): void {
    const zone = get(currentListeningZoneStore);
    if (!zone || isHomeJam(jam)) {
        return;
    }
    leaveJam();
    window.open(jam.url, "_blank", "noopener,noreferrer");
    joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: jam.url, hostUuid: jam.hostUuid });
}

/** Joining a home Jam room is listening along with its host, as long as we stay in it. */
export function joinHomeJam(jam: ListeningZoneJam): void {
    const zone = get(currentListeningZoneStore);
    if (!zone || !isHomeJam(jam)) {
        return;
    }
    leaveJam();
    followedUserUuidStore.set(jam.hostUuid);
    joinedJamStore.set({
        areaId: zone.areaId,
        areaName: zone.areaName,
        url: listeningZoneJamKey(jam),
        hostUuid: jam.hostUuid,
    });
}

/** Leaves the joined room; a home Jam also stops listening along with its host. */
export function leaveJam(): void {
    const joined = get(joinedJamStore);
    if (joined && isHomeJamKey(joined.url) && get(followedUserUuidStore) === joined.hostUuid) {
        followedUserUuidStore.set(undefined);
    }
    joinedJamStore.set(undefined);
}

/**
 * Keeps the joined room in line with the rooms of the zone: a host takes part in their own room as soon as the server
 * accepted it, and a room is forgotten once closed or replaced. A home Jam ends for a guest who stops listening along
 * with its host, and the follow ends with the home Jam.
 */
export function syncJoinedJam(): Unsubscriber {
    const unsubscribeJams = currentJamsStore.subscribe((jams) => {
        const zone = get(currentListeningZoneStore);
        const joined = get(joinedJamStore);
        const own = jams.find((jam) => isLocalUser(jam.hostUuid));
        if (own && zone) {
            if (joined?.url !== listeningZoneJamKey(own)) {
                joinedJamStore.set({
                    areaId: zone.areaId,
                    areaName: zone.areaName,
                    url: listeningZoneJamKey(own),
                    hostUuid: own.hostUuid,
                });
            }
        } else if (joined && !jams.some((jam) => listeningZoneJamKey(jam) === joined.url)) {
            leaveJam();
        }
    });
    const unsubscribeFollow = followedUserUuidStore.subscribe((followed) => {
        const joined = get(joinedJamStore);
        if (joined && isHomeJamKey(joined.url) && !isLocalUser(joined.hostUuid) && followed !== joined.hostUuid) {
            joinedJamStore.set(undefined);
        }
    });
    return () => {
        unsubscribeJams();
        unsubscribeFollow();
    };
}

function isHomeJamKey(key: string): boolean {
    return key.startsWith("home:");
}

/** Our room replaces any previous one of ours; the back refuses it when the zone is full. */
function openRoom(build: (uuid: string, hostName: string) => ListeningZoneJam): void {
    const zone = get(currentListeningZoneStore);
    const uuid = localUserStore.getLocalUser()?.uuid;
    if (!zone || !uuid) {
        return;
    }
    leaveJam();
    const others = get(currentJamsStore).filter((jam) => jam.hostUuid !== uuid);
    // syncJoinedJam() puts us in our room once the server accepted it.
    setAreaPropertyVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, [
        ...others,
        build(uuid, localUserStore.getName() ?? ""),
    ]);
}

function writeOthersRooms(zone: ListeningZone): void {
    const others = get(currentJamsStore).filter((jam) => !isLocalUser(jam.hostUuid));
    setAreaPropertyVariable(
        zone.areaId,
        zone.propertyId,
        LISTENING_ZONE_JAM_VARIABLE,
        others.length > 0 ? others : null,
    );
}
