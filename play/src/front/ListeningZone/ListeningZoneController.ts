import {
    isHomeJam,
    isLiveJam,
    LISTENING_ZONE_JAM_VARIABLE,
    listeningZoneJamKey,
    type ListeningZoneJam,
    MAX_LISTENING_ZONE_JAM_TITLE_LENGTH,
    MAX_LISTENING_ZONE_JAMS,
    parseListeningZoneJams,
} from "@workadventure/map-editor";
import { derived, get, type Readable, readable, type Unsubscriber } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { areaPropertyVariablesManagerStore, setAreaPropertyVariable } from "../Stores/AreaPropertyVariablesStore";
import { followedUserUuidStore } from "../Spotify/ListeningFollower";
import { listeningByUserUuidStore } from "../Spotify/SpotifyListeningDirectory";
import {
    currentListeningZoneStore,
    joinedJamStore,
    type ListeningZone,
    listeningZoneNamesStore,
} from "./ListeningZoneStore";

/** A Jam room and the listening zone it was opened in (its variable lives there). */
export interface JamRoom {
    zone: ListeningZone;
    jam: ListeningZoneJam;
}

/**
 * Every Jam room of the map: one per host, Spotify or home Jam. A room follows its host, so it is offered everywhere,
 * not only in its zone.
 */
export const allJamRoomsStore: Readable<JamRoom[]> = readable<JamRoom[]>([], (set) => {
    let unsubscribeChanges: Unsubscriber | undefined;
    const unsubscribe = derived(
        [areaPropertyVariablesManagerStore, listeningZoneNamesStore],
        (values) => values,
    ).subscribe(([manager, names]) => {
        unsubscribeChanges?.();
        unsubscribeChanges = undefined;
        if (!manager) {
            set([]);
            return;
        }
        // variableChanges emits right away, then on every change of any area variable.
        unsubscribeChanges = manager.variableChanges.subscribe(() => {
            set(
                manager.getVariablesWithKey(LISTENING_ZONE_JAM_VARIABLE).flatMap(({ areaId, propertyId, value }) =>
                    parseListeningZoneJams(value).map((jam) => ({
                        zone: { areaId, propertyId, areaName: names.get(areaId) ?? "" },
                        jam,
                    })),
                ),
            );
        });
    });
    return () => {
        unsubscribe();
        unsubscribeChanges?.();
    };
});

/** The room the local user hosts, wherever it was opened: a user opens one room at a time. */
export const ownJamRoomStore: Readable<JamRoom | undefined> = derived(allJamRoomsStore, (rooms) =>
    rooms.find((room) => isLocalUser(room.jam.hostUuid)),
);

/** Whether the zone the local player stands in still has room for another Jam room. */
export const canOpenJamStore: Readable<boolean> = derived(
    [allJamRoomsStore, currentListeningZoneStore],
    ([rooms, zone]) =>
        zone !== undefined &&
        roomsInZone(rooms, zone).filter((room) => !isLocalUser(room.jam.hostUuid)).length < MAX_LISTENING_ZONE_JAMS,
);

/** How many people take part in each room, its host included, by host uuid (one room per host). */
export const jamParticipantsCountStore: Readable<Map<string, number>> = derived(
    [allJamRoomsStore, listeningByUserUuidStore],
    ([rooms, listeningByUuid]) => {
        const zoneOfHost = new Map(rooms.map((room) => [room.jam.hostUuid, room.zone.areaId]));
        // An open room always includes its host, even if they listen to another room or their presence has not arrived.
        const counts = new Map(rooms.map((room) => [room.jam.hostUuid, 1]));
        for (const [uuid, listening] of listeningByUuid) {
            if (
                listening.jamHostUuid !== "" &&
                uuid !== listening.jamHostUuid &&
                zoneOfHost.get(listening.jamHostUuid) === listening.jamAreaId
            ) {
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
 * Leaving the zone only stops offering to open a room there: rooms follow their host and guests stay in the room they
 * joined until they leave it. The back closes a room once its host has left the map.
 */
export function leaveListeningZone(propertyId: string): void {
    if (get(currentListeningZoneStore)?.propertyId === propertyId) {
        currentListeningZoneStore.set(undefined);
    }
}

/** Opens (or replaces) our room with a Spotify Jam, in the zone we stand in: its invite link is offered to everyone. */
export function shareJam(url: string, title = ""): void {
    openRoom((uuid, hostName) => ({ url, hostUuid: uuid, hostName, ...titled(title) }));
}

/** Opens (or replaces) our room with a home Jam: guests with the desktop app and Spicetify follow our tracks. */
export function startHomeJam(title = ""): void {
    openRoom((uuid, hostName) => ({ home: true, hostUuid: uuid, hostName, ...titled(title) }));
}

/** Opens a Live room: its host shares an audio input through the existing Jam media session. */
export function startLiveJam(title = ""): void {
    openRoom((uuid, hostName) => ({ live: true, hostUuid: uuid, hostName, ...titled(title) }));
}

/**
 * Renames our room (an empty title names it after us again), switches the DJ mode of our Jukebox, or turns the light
 * effects of our room off or on for everyone in it.
 */
export function updateOwnRoom(change: { title?: string; djMode?: boolean; lightsOff?: boolean }): void {
    const own = get(ownJamRoomStore);
    if (!own) {
        return;
    }
    // An undefined title is left out of the stored JSON.
    const jam: ListeningZoneJam = {
        ...own.jam,
        ...(change.title !== undefined && { title: titled(change.title).title }),
        ...(change.djMode !== undefined && isHomeJam(own.jam) && { djMode: change.djMode }),
        ...(change.lightsOff !== undefined && { lightsOff: change.lightsOff }),
    };
    const rooms = roomsInZone(get(allJamRoomsStore), own.zone).map((room) =>
        room.jam.hostUuid === own.jam.hostUuid ? jam : room.jam,
    );
    setAreaPropertyVariable(own.zone.areaId, own.zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, rooms);
}

/** A room without a title is named after its host. */
function titled(title: string): { title?: string } {
    const trimmed = title.trim().slice(0, MAX_LISTENING_ZONE_JAM_TITLE_LENGTH);
    return trimmed ? { title: trimmed } : {};
}

/** Closes our room, wherever we are; the other rooms stay. */
export function stopSharingJam(): void {
    const own = get(ownJamRoomStore);
    if (own) {
        writeRoomsWithout(own.zone, own.jam.hostUuid);
    }
    leaveJam();
}

/** Joins a Spotify or Live room. Only a Spotify Jam opens an invite link. */
export function joinJam(room: JamRoom): void {
    if (isHomeJam(room.jam)) {
        return;
    }
    leaveJam();
    if (!isLiveJam(room.jam)) {
        window.open(room.jam.url, "_blank", "noopener,noreferrer");
    }
    enterRoom(room);
}

/** Joining a home Jam room is listening along with its host, until we leave the room. */
export function joinHomeJam(room: JamRoom): void {
    if (!isHomeJam(room.jam)) {
        return;
    }
    leaveJam();
    followedUserUuidStore.set(room.jam.hostUuid);
    enterRoom(room);
}

/** Leaves the joined room, which is no longer joined again after a reload; a home Jam also stops the follow. */
export function leaveJam(): void {
    forgetJoinedRoom();
    const joined = get(joinedJamStore);
    // The room first: stopping the follow while still in it would read as "stopped listening along".
    joinedJamStore.set(undefined);
    if (joined && isHomeJamKey(joined.url) && get(followedUserUuidStore) === joined.hostUuid) {
        followedUserUuidStore.set(undefined);
    }
}

/**
 * Keeps the joined room in line with the rooms of the map: a host takes part in their own room as soon as the server
 * accepted it, a room is forgotten once closed or replaced, and the room joined before a reload is joined again. A
 * home Jam ends for a guest who stops listening along with its host, and the follow ends with the home Jam.
 */
export function syncJoinedJam(): Unsubscriber {
    const unsubscribeRooms = allJamRoomsStore.subscribe((rooms) => {
        // No manager means the scene is reconnecting, not that the host closed the room.
        if (!get(areaPropertyVariablesManagerStore)) return;
        const joined = get(joinedJamStore);
        const own = rooms.find((room) => isLocalUser(room.jam.hostUuid));
        if (own) {
            if (joined?.url !== listeningZoneJamKey(own.jam)) {
                enterRoom(own);
            }
        } else if (joined && !rooms.some((room) => listeningZoneJamKey(room.jam) === joined.url)) {
            leaveJam();
        } else if (!joined) {
            rejoinRememberedRoom(rooms);
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
        unsubscribeRooms();
        unsubscribeFollow();
    };
}

/** The rooms opened in a zone: they share its variable. */
export function roomsInZone(rooms: readonly JamRoom[], zone: ListeningZone): JamRoom[] {
    return rooms.filter((room) => room.zone.areaId === zone.areaId && room.zone.propertyId === zone.propertyId);
}

function isHomeJamKey(key: string): boolean {
    return key.startsWith("home:");
}

function enterRoom({ zone, jam }: JamRoom): void {
    const key = listeningZoneJamKey(jam);
    joinedJamStore.set({ areaId: zone.areaId, areaName: zone.areaName, url: key, hostUuid: jam.hostUuid });
    if (!isLocalUser(jam.hostUuid)) {
        rememberJoinedRoom({ url: key, hostUuid: jam.hostUuid });
    }
}

/** Our room replaces any previous one of ours, here or in another zone; the back refuses it when the zone is full. */
function openRoom(build: (uuid: string, hostName: string) => ListeningZoneJam): void {
    const zone = get(currentListeningZoneStore);
    const uuid = localUserStore.getLocalUser()?.uuid;
    if (!zone || !uuid) {
        return;
    }
    leaveJam();
    const own = get(ownJamRoomStore);
    if (own && (own.zone.areaId !== zone.areaId || own.zone.propertyId !== zone.propertyId)) {
        writeRoomsWithout(own.zone, uuid);
    }
    const others = roomsInZone(get(allJamRoomsStore), zone)
        .map((room) => room.jam)
        .filter((jam) => jam.hostUuid !== uuid);
    // syncJoinedJam() puts us in our room once the server accepted it.
    setAreaPropertyVariable(zone.areaId, zone.propertyId, LISTENING_ZONE_JAM_VARIABLE, [
        ...others,
        build(uuid, localPlayerName()),
    ]);
}

function writeRoomsWithout(zone: ListeningZone, hostUuid: string): void {
    const others = roomsInZone(get(allJamRoomsStore), zone)
        .map((room) => room.jam)
        .filter((jam) => jam.hostUuid !== hostUuid);
    setAreaPropertyVariable(
        zone.areaId,
        zone.propertyId,
        LISTENING_ZONE_JAM_VARIABLE,
        others.length > 0 ? others : null,
    );
}

/** The room joined before a reload is joined again, wherever we are, until we leave it. */
const JOINED_ROOM_KEY = "listeningZoneJoinedRoom";

interface RememberedRoom {
    url: string;
    hostUuid: string;
}

function rejoinRememberedRoom(rooms: JamRoom[]): void {
    const remembered = recallJoinedRoom();
    const room = remembered && rooms.find((candidate) => listeningZoneJamKey(candidate.jam) === remembered.url);
    if (!room || isLocalUser(room.jam.hostUuid)) {
        return;
    }
    // A Spotify Jam is not opened again: Spotify keeps us in it, we only show it.
    if (isHomeJam(room.jam)) {
        followedUserUuidStore.set(room.jam.hostUuid);
    }
    enterRoom(room);
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
            "url" in value &&
            "hostUuid" in value &&
            typeof value.url === "string" &&
            typeof value.hostUuid === "string"
        ) {
            return { url: value.url, hostUuid: value.hostUuid };
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
