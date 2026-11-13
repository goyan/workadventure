import { afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";
import {
    dismissJamLinkRequests,
    JAM_LINK_REQUEST_COOLDOWN_MS,
    JAM_LINK_REQUEST_EVENT,
    jamLinkRequestCardStore,
    requestNewJamLink,
    sentJamLinkRequestsStore,
    startJamLinkRequests,
} from "../../../src/front/ListeningZone/JamLinkRequest";

const room: JamRoom = {
    zone: { areaId: "area", propertyId: "property", areaName: "Dancefloor" },
    jam: { url: "https://spotify.link/expired", hostUuid: "host", hostName: "Antoine" },
};
const identity = { areaId: "area", propertyId: "property", jamKey: "https://spotify.link/expired" };
// Server-side user ids: 1 is the host, 2 to 4 are guests.
const users = new Map([
    [1, { uuid: "host", name: "Antoine" }],
    [2, { uuid: "guest-1", name: "Hervé" }],
    [3, { uuid: "guest-2", name: "Nat" }],
    [4, { uuid: "guest-3", name: "Lou" }],
]);

function harness(localUuid: string) {
    let time = 100_000;
    const rooms = writable<JamRoom[]>([room]);
    const send = vi.fn();
    const alert = vi.fn();
    let receive: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
    const stop = startJamLinkRequests({
        rooms,
        localUuid: () => localUuid,
        userByUuid: (uuid) => {
            const entry = [...users].find(([, user]) => user.uuid === uuid);
            return entry && { id: entry[0], name: entry[1].name };
        },
        userById: (id) => users.get(id),
        send,
        onEvent: (listener) => {
            receive = listener;
            return () => {
                receive = undefined;
            };
        },
        now: () => time,
        alert,
    });
    return {
        rooms,
        send,
        alert,
        stop,
        advance: (ms: number) => {
            time += ms;
            vi.advanceTimersByTime(ms);
        },
        receive: (data: unknown, senderId: number, name = JAM_LINK_REQUEST_EVENT) => receive?.(name, data, senderId),
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("asking a Jam's host for a new invite link", () => {
    it("sends the request to the host only, once per Jam every two minutes", () => {
        vi.useFakeTimers();
        const guest = harness("guest-1");
        requestNewJamLink(room);
        expect(guest.send).toHaveBeenCalledExactlyOnceWith(JAM_LINK_REQUEST_EVENT, identity, [1]);
        expect(get(sentJamLinkRequestsStore).has(identity.jamKey)).toBe(true);

        requestNewJamLink(room);
        expect(guest.send).toHaveBeenCalledOnce();

        guest.advance(JAM_LINK_REQUEST_COOLDOWN_MS);
        expect(get(sentJamLinkRequestsStore).has(identity.jamKey)).toBe(false);
        requestNewJamLink(room);
        expect(guest.send).toHaveBeenCalledTimes(2);
        guest.stop();
    });

    it("never asks oneself, a Jukebox or a Live room", () => {
        const host = harness("host");
        requestNewJamLink(room);
        requestNewJamLink({ ...room, jam: { home: true, hostUuid: "other", hostName: "Other" } });
        requestNewJamLink({ ...room, jam: { live: true, hostUuid: "other", hostName: "Other" } });
        expect(host.send).not.toHaveBeenCalled();
        host.stop();
    });

    it("gathers the requests for the host's Jam in one card, and alerts once per guest every two minutes", () => {
        vi.useFakeTimers();
        const host = harness("host");
        host.receive(identity, 2);
        expect(get(jamLinkRequestCardStore)).toMatchObject({
            jamKey: identity.jamKey,
            requesters: [{ uuid: "guest-1", name: "Hervé" }],
        });
        expect(host.alert).toHaveBeenCalledExactlyOnceWith(["Hervé"]);

        host.receive(identity, 3);
        host.receive(identity, 4);
        host.receive(identity, 2);
        // Latest requester first, each once.
        expect(get(jamLinkRequestCardStore)?.requesters.map((requester) => requester.name)).toEqual([
            "Hervé",
            "Lou",
            "Nat",
        ]);
        // Hervé asked again too soon: no new alert for him.
        expect(host.alert).toHaveBeenCalledTimes(3);
        host.advance(JAM_LINK_REQUEST_COOLDOWN_MS);
        host.receive(identity, 2);
        expect(host.alert).toHaveBeenCalledTimes(4);
        host.stop();
    });

    it("ignores a request for another link, another room, from the host, from nobody or malformed", () => {
        const host = harness("host");
        host.receive({ ...identity, jamKey: "https://spotify.link/older" }, 2);
        host.receive({ ...identity, propertyId: "other" }, 2);
        host.receive(identity, 1);
        host.receive({ areaId: "area" }, 2);
        host.receive(identity, 9);
        host.receive(identity, 2, "infogene.wave");
        expect(get(jamLinkRequestCardStore)).toBeUndefined();
        expect(host.alert).not.toHaveBeenCalled();
        host.stop();
    });

    it("shows nothing to a guest who receives a request", () => {
        const guest = harness("guest-1");
        guest.receive(identity, 3);
        expect(get(jamLinkRequestCardStore)).toBeUndefined();
        guest.stop();
    });

    it("removes the card once the host pastes a new link, closes the room or dismisses it", () => {
        const host = harness("host");
        host.receive(identity, 2);
        host.rooms.set([{ ...room, jam: { ...room.jam, url: "https://spotify.link/fresh" } }]);
        expect(get(jamLinkRequestCardStore)).toBeUndefined();

        host.rooms.set([room]);
        host.receive(identity, 2);
        host.rooms.set([]);
        expect(get(jamLinkRequestCardStore)).toBeUndefined();

        host.rooms.set([room]);
        host.receive(identity, 3);
        dismissJamLinkRequests();
        expect(get(jamLinkRequestCardStore)).toBeUndefined();
        host.stop();
    });
});
