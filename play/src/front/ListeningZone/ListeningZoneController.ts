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

/** The name others see: an OpenID login only sets the session name, the stored one may stay empty. */
export function localPlayerName(): string {
    return localUserStore.getDisplayNameForMatrixProfile() ?? localUserStore.getName() ?? "";
}

export function enterListeningZone(zone: ListeningZone): void {
    currentListeningZoneStore.set(zone);
}

/**
 * Leaving the zone ends our part in its rooms for now. Our own room stays: the back closes it once we have been out
 * for a while, so that a reload or a quick step out does not close it.
 */
export function leaveListeningZone(propertyId: string): void {
    const zone = get(currentListeningZoneStore);
    if (zone?.propertyId !== propertyId) {
        return;
    }
    noteSteppedOut();
    clearJoinedRoom();
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
    enterRoom(zone, jam);
}

/** Joining a home Jam room is listening along with its host, as long as we stay in it. */
export function joinHomeJam(jam: ListeningZoneJam): void {
    const zone = get(currentListeningZoneStore);
    if (!zone || !isHomeJam(jam)) {
        return;
    }
    leaveJam();
    followedUserUuidStore.set(jam.hostUuid);
    enterRoom(zone, jam);
}

/** Leaves the joined room, which is no longer joined again after a reload; a home Jam also stops the follow. */
export function leaveJam(): void {
    forgetJoinedRoom();
    clearJoinedRoom();
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
        } else if (!joined && zone) {
            rejoinRememberedRoom(zone, jams);
        }
    });
    const unsubscribeFollow = followedUserUuidStore.subscribe((followed) => {
        const joined = get(joinedJamStore);
        if (joined && isHomeJamKey(joined.url) && !isLocalUser(joined.hostUuid) && followed !== joined.hostUuid) {
            forgetJoinedRoom();
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

function enterRoom(zone: ListeningZone, jam: ListeningZoneJam): void {
    const key = listeningZoneJamKey(jam);
    joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: key, hostUuid: jam.hostUuid });
    rememberJoinedRoom({ areaId: zone.areaId, url: key, hostUuid: jam.hostUuid });
}

/** Ends our part in the joined room, without forgetting it: a reload or a quick step out joins it again. */
function clearJoinedRoom(): void {
    const joined = get(joinedJamStore);
    // The room first: stopping the follow while still in it would read as "stopped listening along" and forget it.
    joinedJamStore.set(undefined);
    if (joined && isHomeJamKey(joined.url) && get(followedUserUuidStore) === joined.hostUuid) {
        followedUserUuidStore.set(undefined);
    }
}

/** A room joined before a reload, or before stepping out of the zone for a moment, is joined again. */
const JOINED_ROOM_KEY = "listeningZoneJoinedRoom";
/** Longer than a reload; walking out of the zone for longer means leaving the room. */
export const REJOIN_WITHIN_MS = 2 * 60 * 1000;

interface RememberedRoom {
    areaId: string;
    url: string;
    hostUuid: string;
    /** When we stepped out of the zone; absent while inside. */
    leftAt?: number;
}

function rejoinRememberedRoom(zone: ListeningZone, jams: ListeningZoneJam[]): void {
    const remembered = recallJoinedRoom();
    if (!remembered || remembered.areaId !== zone.areaId) {
        return;
    }
    if (remembered.leftAt !== undefined && Date.now() - remembered.leftAt > REJOIN_WITHIN_MS) {
        return;
    }
    const jam = jams.find((candidate) => listeningZoneJamKey(candidate) === remembered.url);
    if (!jam || isLocalUser(jam.hostUuid)) {
        return;
    }
    // A Spotify Jam is not opened again: Spotify keeps us in it, we only show it.
    if (isHomeJam(jam)) {
        followedUserUuidStore.set(jam.hostUuid);
    }
    enterRoom(zone, jam);
}

function rememberJoinedRoom(room: RememberedRoom): void {
    try {
        localStorage.setItem(JOINED_ROOM_KEY, JSON.stringify(room));
    } catch {
        // Storage refused (private window): the room is simply not joined again after a reload.
    }
}

function recallJoinedRoom(): RememberedRoom | undefined {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(JOINED_ROOM_KEY) ?? "null");
        if (
            typeof value === "object" &&
            value !== null &&
            "areaId" in value &&
            "url" in value &&
            "hostUuid" in value &&
            typeof value.areaId === "string" &&
            typeof value.url === "string" &&
            typeof value.hostUuid === "string"
        ) {
            const leftAt = "leftAt" in value && typeof value.leftAt === "number" ? value.leftAt : undefined;
            return { areaId: value.areaId, url: value.url, hostUuid: value.hostUuid, leftAt };
        }
    } catch {
        // Unreadable: nothing to join again.
    }
    return undefined;
}

function forgetJoinedRoom(): void {
    try {
        localStorage.removeItem(JOINED_ROOM_KEY);
    } catch {
        // Nothing stored.
    }
}

function noteSteppedOut(): void {
    const remembered = recallJoinedRoom();
    if (remembered && remembered.leftAt === undefined) {
        rememberJoinedRoom({ ...remembered, leftAt: Date.now() });
    }
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
        build(uuid, localPlayerName()),
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
