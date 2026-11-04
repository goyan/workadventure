import { isHomeJam, listeningZoneJamKey, type ListeningZoneJam } from "@workadventure/map-editor";
import { derived, get, type Readable, type Unsubscriber } from "svelte/store";
import { z } from "zod";
import type { WorkAdventureDesktopApi } from "../Interfaces/DesktopAppInterfaces";
import type { JoinedJam, ListeningZone } from "../ListeningZone/ListeningZoneStore";
import type { ListeningByUserUuid } from "./SpotifyListeningDirectory";

/** Event a home Jam guest sends to its host, through the room server (which sets the sender): tracks to queue. */
export const HOME_JAM_QUEUE_EVENT = "workadventure.home-jam-queue";
/** Same limit as the desktop app and the extension. */
const MAX_TRACKS_PER_REQUEST = 5;
/** A guest cannot flood the host's queue: requests beyond that, within a minute, are dropped. */
const MAX_REQUESTS_PER_MINUTE = 10;

const QueueRequest = z.object({
    uris: z
        .array(z.string().regex(/^spotify:track:[A-Za-z0-9]+$/))
        .min(1)
        .max(MAX_TRACKS_PER_REQUEST),
});

export interface HomeJamContext {
    zone: Readable<ListeningZone | undefined>;
    jams: Readable<ListeningZoneJam[]>;
    joined: Readable<JoinedJam | undefined>;
    listeningByUserUuid: Readable<ListeningByUserUuid>;
    localUuid: () => string | undefined;
    /** The connected user with this uuid (id and name), undefined when they are not in the room. */
    userByUuid: (uuid: string) => { id: number; name: string } | undefined;
    userById: (id: number) => { uuid: string; name: string } | undefined;
    sendToUser: (userId: number, data: unknown) => void;
    /** Events received from other users: name, data and the sender's id as set by the room server. */
    onEvent: (listener: (name: string, data: unknown, senderId: number | undefined) => void) => Unsubscriber;
    desktop: WorkAdventureDesktopApi | undefined;
    now?: () => number;
}

/**
 * Wires the home Jam to the desktop app. A guest's Spotify offers "add to the home Jam" (right click on tracks): the
 * tracks go to the host through the room server. The host's desktop app adds them to its Spotify queue, only from
 * users taking part in its home Jam (they publish it in their listening). Without the desktop app, nothing happens.
 */
export function startHomeJam(context: HomeJamContext): Unsubscriber {
    const { desktop } = context;
    if (!desktop?.setHomeJam || !desktop.onQueueRequest || !desktop.enqueueOnSpotify) {
        return () => undefined;
    }
    const { setHomeJam, enqueueOnSpotify } = desktop;
    const now = context.now ?? Date.now;

    /** The home Jam room this user takes part in as a guest. */
    const guestOf = derived(
        [context.jams, context.joined],
        ([jams, joined]) =>
            jams.find(
                (jam) =>
                    isHomeJam(jam) && jam.hostUuid !== context.localUuid() && joined?.url === listeningZoneJamKey(jam),
            ) ?? null,
    );
    // Only changes are told: the desktop app starts with no home Jam.
    let told: string | null = null;
    const unsubscribeGuest = guestOf.subscribe((jam) => {
        const hostName = jam ? jam.hostName : null;
        if (hostName === told) return;
        told = hostName;
        setHomeJam(jam ? { hostName: jam.hostName } : null);
    });

    desktop.onQueueRequest((uris) => {
        const jam = get(guestOf);
        const request = QueueRequest.safeParse({ uris });
        const host = jam ? context.userByUuid(jam.hostUuid) : undefined;
        if (!request.success || !host) return;
        context.sendToUser(host.id, request.data);
    });

    const requestsBySender = new Map<number, number[]>();
    const unsubscribeEvents = context.onEvent((name, data, senderId) => {
        if (name !== HOME_JAM_QUEUE_EVENT || senderId === undefined) return;
        const localUuid = context.localUuid();
        const hostsHomeJam = get(context.jams).some((jam) => isHomeJam(jam) && jam.hostUuid === localUuid);
        const zone = get(context.zone);
        const sender = context.userById(senderId);
        const request = QueueRequest.safeParse(data);
        if (!request.success || !sender || !zone || !hostsHomeJam) return;
        // Only participants of our room: they publish its zone and host in their listening.
        const listening = get(context.listeningByUserUuid).get(sender.uuid);
        if (listening?.jamAreaId !== zone.areaId || listening.jamHostUuid !== localUuid) return;
        const recent = (requestsBySender.get(senderId) ?? []).filter((at) => now() - at < 60_000);
        if (recent.length >= MAX_REQUESTS_PER_MINUTE) return;
        requestsBySender.set(senderId, [...recent, now()]);
        enqueueOnSpotify({ uris: request.data.uris, from: sender.name });
    });

    return () => {
        unsubscribeGuest();
        unsubscribeEvents();
        if (told) setHomeJam(null);
    };
}
