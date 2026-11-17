import { get, writable } from "svelte/store";
import { afterEach, expect, it, vi } from "vitest";
import { KARAOKE_STAGE_ACTION_EVENT, KARAOKE_STAGE_STATE_EVENT, KaraokeStageAction } from "@workadventure/map-editor";
import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";
import {
    startKaraokeStage,
    enableKaraokeGame,
    selectKaraokeSinger,
    karaokeStagesStore,
} from "../../../src/front/Karaoke/KaraokeStage";

const room: JamRoom = {
    zone: { areaId: "zone", propertyId: "prop", areaName: "Dance" },
    jam: { home: true, hostUuid: "host", hostName: "Host" },
};
const identity = { areaId: "zone", propertyId: "prop", hostUuid: "host" };
let stop: (() => void) | undefined;
afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
});

function harness(local = "host") {
    vi.useFakeTimers();
    let listener: ((name: string, data: unknown, senderId: number | undefined) => void) | undefined;
    let users = [
        { id: 1, uuid: "host", name: "Host" },
        { id: 2, uuid: "guest", name: "Guest" },
    ];
    const rooms = writable([room]);
    const send = vi.fn();
    stop = startKaraokeStage({
        rooms,
        localUuid: () => local,
        userByUuid: (uuid) => users.find((u) => u.uuid === uuid),
        userById: (id) => users.find((u) => u.id === id),
        send,
        onEvent: (callback) => {
            listener = callback;
            return () => {
                listener = undefined;
            };
        },
    });
    return {
        send,
        rooms,
        state: () => get(karaokeStagesStore).get("host"),
        action: (action: KaraokeStageAction) => listener?.(KARAOKE_STAGE_ACTION_EVENT, { ...identity, action }, 2),
        receive: (data: unknown, sender: number) => listener?.(KARAOKE_STAGE_STATE_EVENT, data, sender),
        disconnectGuest: () => {
            users = users.filter((u) => u.uuid !== "guest");
        },
    };
}

it("accepts a join immediately after a snapshot request, gives one mic and one applause per turn", () => {
    const host = harness();
    enableKaraokeGame(room, true);
    host.action(KaraokeStageAction.Request);
    host.action(KaraokeStageAction.Join);
    expect(host.state()?.queue).toEqual(["guest"]);
    const firstTurn = host.state()?.turnId;
    selectKaraokeSinger(room, "guest");
    expect(host.state()?.singerUuid).toBe("guest");
    expect(host.state()?.queue).toEqual([]);
    expect(host.state()?.turnId).not.toBe(firstTurn);
    host.action(KaraokeStageAction.Clap);
    expect(host.state()?.applause).toBe(0);
    selectKaraokeSinger(room, "host");
    vi.advanceTimersByTime(501);
    host.action(KaraokeStageAction.Clap);
    vi.advanceTimersByTime(501);
    host.action(KaraokeStageAction.Clap);
    expect(host.state()?.applause).toBe(1);
    host.action(KaraokeStageAction.Leave);
    enableKaraokeGame(room, false);
    expect(host.state()).toMatchObject({ enabled: false, singerUuid: null, queue: [] });
});

it("does not accept a forged host, an unknown user or another zone", () => {
    const guest = harness("guest");
    const state = {
        ...identity,
        enabled: true,
        singerUuid: "host",
        turnId: crypto.randomUUID(),
        queue: [],
        applause: 0,
    };
    guest.receive(state, 2);
    guest.receive(state, 123);
    guest.receive({ ...state, areaId: "other" }, 1);
    expect(guest.state()).toBeUndefined();
    guest.receive(state, 1);
    expect(guest.state()).toEqual(state);
    enableKaraokeGame(room, false);
    selectKaraokeSinger(room, "guest");
    expect(guest.state()).toEqual(state);
    expect(guest.send).not.toHaveBeenCalled();
    guest.rooms.set([]);
    expect(guest.state()).toBeUndefined();
});

it("drops disconnected singers and queued users", () => {
    const host = harness();
    enableKaraokeGame(room, true);
    host.action(KaraokeStageAction.Join);
    selectKaraokeSinger(room, "guest");
    host.disconnectGuest();
    vi.advanceTimersByTime(2000);
    expect(host.state()?.singerUuid).toBeNull();
});
