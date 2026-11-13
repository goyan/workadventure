import { isHomeJam, isLiveJam, listeningZoneJamKey } from "@workadventure/map-editor";
import { get, writable } from "svelte/store";
import type { Readable, Unsubscriber } from "svelte/store";
import { z } from "zod";
import type { HomeJamContext } from "../Spotify/HomeJam";
import type { JamRoom } from "./ListeningZoneController";

/**
 * A guest asks the host of a Spotify Jam for a new invite link (Spotify plays nothing for it any more). Like the wave
 * (`infogene.wave`), a scripting event of the room: no protocol nor back change, the sender is the `senderId` the
 * server sets. Unlike the wave it goes to the host only.
 */
export const JAM_LINK_REQUEST_EVENT = "infogene.jam-link-request";
/** One request per guest and per Jam within this delay; the host is alerted once per guest within it too. */
export const JAM_LINK_REQUEST_COOLDOWN_MS = 120_000;

const RequestMessage = z.object({
    areaId: z.string().min(1).max(200),
    propertyId: z.string().min(1).max(200),
    jamKey: z.string().min(1).max(2048),
});
type RequestMessage = z.infer<typeof RequestMessage>;

export interface JamLinkRequester {
    uuid: string;
    name: string;
}

/** The requests for the host's Jam, gathered: the latest requester first. */
export interface JamLinkRequestCard extends RequestMessage {
    requesters: JamLinkRequester[];
}

export interface JamLinkRequestContext extends Pick<
    HomeJamContext,
    "rooms" | "localUuid" | "userByUuid" | "userById" | "send" | "onEvent" | "now"
> {
    /** Sound and system notification for the host, with the requesters' names (latest first). */
    alert: (names: string[]) => void;
}

const card = writable<JamLinkRequestCard | undefined>(undefined);
/** The host's card: at most one, a user hosts one room. */
export const jamLinkRequestCardStore: Readable<JamLinkRequestCard | undefined> = card;
const sent = writable<ReadonlySet<string>>(new Set());
/** The Jams (by key) this guest asked a new link for, until the delay is over. */
export const sentJamLinkRequestsStore: Readable<ReadonlySet<string>> = sent;

interface Active {
    request(room: JamRoom): void;
    dismiss(): void;
}
let active: Active | undefined;

function identity(room: JamRoom): RequestMessage {
    return { areaId: room.zone.areaId, propertyId: room.zone.propertyId, jamKey: listeningZoneJamKey(room.jam) };
}

function sameRoom(a: RequestMessage, b: RequestMessage): boolean {
    return a.areaId === b.areaId && a.propertyId === b.propertyId && a.jamKey === b.jamKey;
}

/** Asks the host of this Spotify Jam for a new link; nothing while the previous request is too recent. */
export function requestNewJamLink(room: JamRoom): void {
    active?.request(room);
}

/** The host closes their card. */
export function dismissJamLinkRequests(): void {
    active?.dismiss();
}

export function startJamLinkRequests(context: JamLinkRequestContext): Unsubscriber {
    const now = context.now ?? Date.now;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const lastAlertAt = new Map<string, number>();
    let own: JamRoom | undefined;

    const controller: Active = {
        request(room) {
            const localUuid = context.localUuid();
            if (isHomeJam(room.jam) || isLiveJam(room.jam) || !localUuid || room.jam.hostUuid === localUuid) return;
            const message = identity(room);
            if (get(sent).has(message.jamKey)) return;
            const host = context.userByUuid(room.jam.hostUuid);
            if (!host) return;
            context.send(JAM_LINK_REQUEST_EVENT, message, [host.id]);
            sent.update((keys) => new Set(keys).add(message.jamKey));
            const timer = setTimeout(() => {
                timers.delete(timer);
                sent.update((keys) => {
                    const next = new Set(keys);
                    next.delete(message.jamKey);
                    return next;
                });
            }, JAM_LINK_REQUEST_COOLDOWN_MS);
            timers.add(timer);
        },
        dismiss() {
            card.set(undefined);
        },
    };
    active = controller;

    const unsubscribeRooms = context.rooms.subscribe((rooms) => {
        own = rooms.find(
            (room) => room.jam.hostUuid === context.localUuid() && !isHomeJam(room.jam) && !isLiveJam(room.jam),
        );
        // A new link (or a closed room) answers the requests: their card goes.
        const current = get(card);
        if (current && (!own || !sameRoom(identity(own), current))) card.set(undefined);
    });

    const unsubscribeEvents = context.onEvent((name, data, senderId) => {
        if (name !== JAM_LINK_REQUEST_EVENT || senderId === undefined || !own) return;
        const parsed = RequestMessage.safeParse(data);
        const sender = context.userById(senderId);
        if (!parsed.success || !sender || sender.uuid === context.localUuid()) return;
        if (!sameRoom(identity(own), parsed.data)) return;
        const previous = get(card);
        const others = previous && sameRoom(previous, parsed.data) ? previous.requesters : [];
        const requesters = [
            { uuid: sender.uuid, name: sender.name },
            ...others.filter((requester) => requester.uuid !== sender.uuid),
        ];
        card.set({ ...parsed.data, requesters });
        const at = now();
        if (at - (lastAlertAt.get(sender.uuid) ?? -Infinity) < JAM_LINK_REQUEST_COOLDOWN_MS) return;
        lastAlertAt.set(sender.uuid, at);
        context.alert(requesters.map((requester) => requester.name));
    });

    return () => {
        unsubscribeRooms();
        unsubscribeEvents();
        for (const timer of timers) clearTimeout(timer);
        if (active === controller) active = undefined;
        card.set(undefined);
        sent.set(new Set());
    };
}
