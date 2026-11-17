import { afterEach, describe, expect, it, vi } from "vitest";
import { JoinRoomMessage, PositionMessage_Direction } from "@workadventure/messages";
import {
    KARAOKE_LEADERBOARD_EVENT,
    KARAOKE_LEADERBOARD_REQUEST_EVENT,
    KARAOKE_SCORE_EVENT,
    KARAOKE_STAGE_STATE_EVENT,
    KaraokeReferenceSource,
    LISTENING_ZONE_JAM_VARIABLE,
} from "@workadventure/map-editor";
import type { UserSocket } from "../src/Model/User";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";
import { KaraokeLeaderboardManager } from "../src/Model/AreaPropertyEvents/KaraokeLeaderboardManager";

const saved = vi.hoisted(() => new Map<string, Map<string, string>>());
const repository = vi.hoisted(
    (): VariablesRepositoryInterface => ({
        loadVariables: (key) => Promise.resolve(Object.fromEntries(saved.get(key) ?? [])),
        saveVariable: (key, field, value) => {
            saved.set(key, new Map<string, string>(saved.get(key) ?? []).set(field, value));
            return Promise.resolve(1);
        },
    }),
);
vi.mock("../src/Services/Repository/VariablesRepository", () => ({
    getVariablesRepository: () => Promise.resolve(repository),
}));

// Imported after the mock: the room keeps its rankings in the in-memory repository above.
const { GameRoom } = await import("../src/Model/GameRoom");

const ROOM_URL = "https://play.workadventu.re/_/global/localhost/karaoke.json";
const reference = {
    id: "00000000-0000-4000-8000-000000000003",
    recordingKey: "song",
    title: "Song",
    artist: "Artist",
    source: KaraokeReferenceSource.UltraStar,
    notes: [{ startMs: 0, endMs: 1000, midi: 69, golden: false }],
};
const entry = (singerUuid: string, score: number) => ({ singerUuid, name: singerUuid, score, accuracy: 80, at: 5000 });

function socket(): UserSocket {
    return { write: vi.fn().mockReturnValue(true), end: vi.fn() } as unknown as UserSocket;
}
function join(uuid: string): JoinRoomMessage {
    return JoinRoomMessage.fromPartial({
        userUuid: uuid,
        IPAddress: "10.0.0.2",
        name: uuid.toUpperCase(),
        positionMessage: { x: 100, y: 100, direction: PositionMessage_Direction.DOWN, moving: false },
    });
}
function createWorld() {
    const noop = (): void => {};
    return GameRoom.create(ROOM_URL, noop, noop, 160, 160, noop, noop, noop, noop, noop, noop, noop, noop);
}

afterEach(() => saved.clear());

describe("KaraokeLeaderboardManager", () => {
    it("saves a song's ranking and reads it back after a restart", async () => {
        const first = new KaraokeLeaderboardManager({ repository, roomUrl: ROOM_URL });
        expect((await first.record(reference, entry("ana", 7000)))?.entries).toEqual([entry("ana", 7000)]);
        expect(await first.record(reference, entry("ana", 5000))).toBeUndefined();
        const stored = saved.get(`karaokeLeaderboards:${ROOM_URL}`)?.get("song") ?? "";
        expect(JSON.parse(stored)).toEqual(["Song", "Artist", [["ana", "ana", 7000, 80, 5]]]);
        const restarted = new KaraokeLeaderboardManager({ repository, roomUrl: ROOM_URL });
        expect((await restarted.get("song"))?.entries).toEqual([entry("ana", 7000)]);
        expect(await restarted.get("other")).toBeUndefined();
    });
    it("ignores a saved ranking that does not match its song", async () => {
        await repository.saveVariable(`karaokeLeaderboards:${ROOM_URL}`, "song", "{not json");
        await repository.saveVariable(
            `karaokeLeaderboards:${ROOM_URL}`,
            "other",
            JSON.stringify({ recordingKey: "song", title: "Song", artist: "Artist", entries: [] }),
        );
        const manager = new KaraokeLeaderboardManager({ repository, roomUrl: ROOM_URL });
        expect(await manager.get("song")).toBeUndefined();
        expect(await manager.get("other")).toBeUndefined();
    });
});

describe("GameRoom karaoke ranking", () => {
    it("ranks a finished turn sung through half the melody, and answers only the player who asks", async () => {
        const world = await createWorld();
        const host = await world.join(socket(), join("host"));
        const guest = await world.join(socket(), join("guest"));
        const stage = {
            areaId: "zone",
            propertyId: "prop",
            hostUuid: "host",
            enabled: true,
            singerUuid: "guest",
            turnId: "00000000-0000-4000-8000-000000000001",
            queue: [],
            applause: 0,
            reference,
        };
        const score = {
            hostUuid: "host",
            singerUuid: "guest",
            turnId: stage.turnId,
            referenceId: reference.id,
            score: 9000,
            accuracy: 90,
            coverage: 100,
            combo: 1,
            finished: true,
        };
        try {
            world.setAreaPropertyVariable(
                "zone",
                "prop",
                LISTENING_ZONE_JAM_VARIABLE,
                JSON.stringify([{ home: true, hostUuid: "host", hostName: "Host" }]),
            );
            world.dispatchEvent(KARAOKE_STAGE_STATE_EVENT, stage, host.id, []);
            const broadcast = vi.spyOn(world, "sendSubMessageToRoom");
            const rankings = () =>
                broadcast.mock.calls.filter(
                    ([message]) =>
                        message.message?.$case === "receivedEventMessage" &&
                        message.message.receivedEventMessage.name === KARAOKE_LEADERBOARD_EVENT,
                );

            world.dispatchEvent(KARAOKE_LEADERBOARD_EVENT, { recordingKey: "song" }, host.id, []);
            world.dispatchEvent(KARAOKE_SCORE_EVENT, { ...score, coverage: 40 }, guest.id, []);
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
            expect(saved.has(`karaokeLeaderboards:${ROOM_URL}`)).toBe(false);
            expect(rankings()).toHaveLength(0);

            world.dispatchEvent(KARAOKE_SCORE_EVENT, score, guest.id, []);
            await vi.waitFor(() => expect(rankings()).toHaveLength(1));
            expect(rankings()[0][0].message).toMatchObject({
                receivedEventMessage: {
                    senderId: undefined,
                    data: { recordingKey: "song", entries: [{ singerUuid: "guest", name: "GUEST", score: 9000 }] },
                },
            });

            const asked = vi.spyOn(host, "emitInBatch");
            broadcast.mockClear();
            world.dispatchEvent(KARAOKE_LEADERBOARD_REQUEST_EVENT, { recordingKey: "song" }, host.id, []);
            await vi.waitFor(() => expect(asked).toHaveBeenCalledOnce());
            expect(broadcast).not.toHaveBeenCalled();
        } finally {
            world.destroy();
        }
    });
});
