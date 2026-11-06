import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { get, readable } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const playersById = new Map<number, { userUuid: string; name: string; availabilityStatus: AvailabilityStatus }>();

vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "local" }) },
}));
vi.mock("../../../../../src/front/Stores/PlayersStore", () => ({
    playersStore: {
        getPlayerById: (id: number) => playersById.get(id),
        getPlayerByUuid: (uuid: string) => [...playersById.values()].find((player) => player.userUuid === uuid),
    },
}));
vi.mock("../../../../../src/front/Notification/SystemNotifier", () => ({
    notifySystem: vi.fn(),
}));
vi.mock("../../../../../src/front/Components/PrivateMessage/openPrivateMessage", () => ({
    openPrivateMessage: vi.fn(),
}));
vi.mock("../../../../../src/i18n/i18n-svelte", () => {
    const LL = readable({
        wave: {
            received: ({ name }: { name: string }) => `received ${name}`,
            doNotDisturb: ({ name }: { name: string }) => `dnd ${name}`,
            someone: () => "Quelqu'un",
        },
    });
    return { LL, default: LL };
});

import { WAVE_EMOJI, WaveManager } from "../../../../../src/front/Phaser/Game/Wave/WaveManager";
import { encodeWave } from "../../../../../src/front/Phaser/Game/Wave/WaveProtocol";
import { WAVE_COOLDOWN_MS } from "../../../../../src/front/Phaser/Game/Wave/WaveState";
import { waveCardsStore } from "../../../../../src/front/Stores/WaveStore";
import { notifySystem } from "../../../../../src/front/Notification/SystemNotifier";
import { openPrivateMessage } from "../../../../../src/front/Components/PrivateMessage/openPrivateMessage";

const LOCAL_USER_ID = 1;
const ROOM_URL = "https://play.example/_/global/map.json";

interface FakeSpaceUser {
    uuid: string;
    name: string;
    spaceUserId: string;
    status: AvailabilityStatus;
}

function makeScene({ spaceUsers = [] as FakeSpaceUser[] } = {}) {
    const stream = new Subject<{ name: string; data: unknown; senderId: number | undefined }>();
    const emitScriptableEvent = vi.fn((_name: string, _data: unknown, _target: unknown) => Promise.resolve());
    const emitEmoteEvent = vi.fn();
    const emitAskPosition = vi.fn();
    const player = { playEmote: vi.fn(), playText: vi.fn(), destroyText: vi.fn() };
    const playBubbleInSound = vi.fn();
    const worldSpace = {
        getSpaceUserBySpaceUserId: (id: string) => {
            const user = spaceUsers.find((candidate) => candidate.spaceUserId === id);
            return user && { uuid: user.uuid, name: user.name };
        },
        getSpaceUserByUuid: (uuid: string) => {
            const user = spaceUsers.find((candidate) => candidate.uuid === uuid);
            return (
                user && {
                    uuid: user.uuid,
                    name: user.name,
                    reactiveUser: { availabilityStatus: readable(user.status) },
                }
            );
        },
    };
    const scene = {
        connection: {
            receivedEventMessageStream: stream,
            emitScriptableEvent,
            emitEmoteEvent,
            emitAskPosition,
            getUserId: () => LOCAL_USER_ID,
            getSpaceUserId: () => `${ROOM_URL}_${LOCAL_USER_ID}`,
        },
        roomUrl: ROOM_URL,
        CurrentPlayer: player,
        MapPlayersByKey: new Map([[7, { userUuid: "sam", playerName: "Sam" }]]),
        playBubbleInSound,
        worldSpace,
    };
    return {
        scene: scene as unknown as GameScene,
        stream,
        emitScriptableEvent,
        emitEmoteEvent,
        emitAskPosition,
        player,
        playBubbleInSound,
        receive(targetUuid: string, senderId: number) {
            const { name, data } = encodeWave({ targetUuid, at: 1 });
            stream.next({ name, data, senderId });
        },
    };
}

describe("WaveManager", () => {
    let manager: WaveManager | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        playersById.clear();
        vi.mocked(notifySystem).mockClear();
        vi.mocked(openPrivateMessage).mockClear();
        waveCardsStore.set([]);
    });

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
        vi.useRealTimers();
    });

    it("sends the wave event and the emote, then refuses a second wave within the cooldown", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);

        expect(manager.canWave("bob")).toBe(true);
        manager.wave("bob", "Bob");

        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(fake.emitScriptableEvent).toHaveBeenCalledWith(
            "infogene.wave",
            { targetUuid: "bob", at: 1_000_000 },
            undefined,
        );
        expect(fake.emitEmoteEvent).toHaveBeenCalledWith(WAVE_EMOJI);
        expect(fake.player.playEmote).toHaveBeenCalledWith(WAVE_EMOJI);
        expect(fake.player.playText).not.toHaveBeenCalled();

        expect(manager.canWave("bob")).toBe(false);
        manager.wave("bob", "Bob");
        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(fake.emitEmoteEvent).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(WAVE_COOLDOWN_MS);
        expect(manager.canWave("bob")).toBe(true);
    });

    it("never waves at oneself", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        expect(manager.canWave("local")).toBe(false);
        manager.wave("local", "Me");
        expect(fake.emitScriptableEvent).not.toHaveBeenCalled();
    });

    it("tells the sender when the recipient is in do not disturb (status read in the players store)", () => {
        playersById.set(9, { userUuid: "bob", name: "Bob", availabilityStatus: AvailabilityStatus.DO_NOT_DISTURB });
        const fake = makeScene();
        manager = new WaveManager(fake.scene);

        manager.wave("bob", "Bob");

        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(fake.player.playText).toHaveBeenCalledTimes(1);
        const [id, text, duration, , , type] = fake.player.playText.mock.calls[0];
        expect(id).toBe("wave-dnd-bob");
        expect(text).toBe("dnd Bob");
        expect(duration).toBe(5000);
        expect(type).toBe("message");
    });

    it("prefers the live status of the world space for do not disturb", () => {
        playersById.set(9, { userUuid: "bob", name: "Bob", availabilityStatus: AvailabilityStatus.ONLINE });
        const fake = makeScene({
            spaceUsers: [{ uuid: "bob", name: "Bob", spaceUserId: "x_9", status: AvailabilityStatus.DO_NOT_DISTURB }],
        });
        manager = new WaveManager(fake.scene);
        manager.wave("bob", "Bob_*");
        // The name is Markdown-escaped in the bubble text.
        expect(fake.player.playText.mock.calls[0][1]).toBe("dnd Bob\\_\\*");
    });

    it("ignores a wave meant for someone else", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.receive("bob", 7);
        expect(get(waveCardsStore)).toEqual([]);
        expect(notifySystem).not.toHaveBeenCalled();
        expect(fake.playBubbleInSound).not.toHaveBeenCalled();
    });

    it("ignores the echo of its own wave", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.receive("local", LOCAL_USER_ID);
        expect(get(waveCardsStore)).toEqual([]);
        expect(notifySystem).not.toHaveBeenCalled();
    });

    it("ignores an invalid or foreign event", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.stream.next({ name: "infogene.wave", data: { nope: true }, senderId: 7 });
        fake.stream.next({ name: "other", data: { targetUuid: "local", at: 1 }, senderId: 7 });
        expect(get(waveCardsStore)).toEqual([]);
    });

    it("shows a card for a wave meant for the local player, plays a sound and notifies", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);

        fake.receive("local", 7);

        expect(get(waveCardsStore)).toEqual([{ senderUuid: "sam", senderName: "Sam", receivedAt: 1_000_000 }]);
        expect(fake.playBubbleInSound).toHaveBeenCalledTimes(1);
        expect(notifySystem).toHaveBeenCalledTimes(1);
        expect(notifySystem).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "wave", title: "received Sam", body: "", tag: "wave:sam" }),
        );
    });

    it("throttles the sound and the notification of repeated waves from the same sender, but updates the card", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);

        fake.receive("local", 7);
        vi.advanceTimersByTime(WAVE_COOLDOWN_MS - 1);
        fake.receive("local", 7);

        expect(fake.playBubbleInSound).toHaveBeenCalledTimes(1);
        expect(notifySystem).toHaveBeenCalledTimes(1);
        expect(get(waveCardsStore)).toEqual([
            { senderUuid: "sam", senderName: "Sam", receivedAt: 1_000_000 + WAVE_COOLDOWN_MS - 1 },
        ]);

        vi.advanceTimersByTime(WAVE_COOLDOWN_MS);
        fake.receive("local", 7);
        expect(fake.playBubbleInSound).toHaveBeenCalledTimes(2);
        expect(notifySystem).toHaveBeenCalledTimes(2);
    });

    it("keeps one card per sender, most recent first", () => {
        playersById.set(8, { userUuid: "alice", name: "Alice", availabilityStatus: AvailabilityStatus.ONLINE });
        const fake = makeScene();
        manager = new WaveManager(fake.scene);

        fake.receive("local", 7);
        vi.advanceTimersByTime(10);
        fake.receive("local", 8);
        vi.advanceTimersByTime(10);
        fake.receive("local", 7);

        expect(get(waveCardsStore).map((card) => card.senderUuid)).toEqual(["sam", "alice"]);
    });

    it("resolves the sender through the players store, then the world space", () => {
        playersById.set(8, { userUuid: "alice", name: "Alice", availabilityStatus: AvailabilityStatus.ONLINE });
        const fake = makeScene({
            spaceUsers: [
                {
                    uuid: "far",
                    name: "Farah",
                    spaceUserId: `${ROOM_URL}_12`,
                    status: AvailabilityStatus.ONLINE,
                },
            ],
        });
        manager = new WaveManager(fake.scene);

        fake.receive("local", 8);
        fake.receive("local", 12);

        expect(
            get(waveCardsStore)
                .map((card) => `${card.senderUuid}:${card.senderName}`)
                .sort(),
        ).toEqual(["alice:Alice", "far:Farah"]);
    });

    it("names an unknown sender 'Quelqu'un'", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);

        fake.receive("local", 42);

        expect(get(waveCardsStore)).toEqual([{ senderUuid: "", senderName: "Quelqu'un", receivedAt: 1_000_000 }]);
        expect(notifySystem).toHaveBeenCalledWith(expect.objectContaining({ title: "received Quelqu'un" }));
    });

    it("goTo asks for the sender's position and removes the card", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.receive("local", 7);

        manager.goTo("sam");

        expect(fake.emitAskPosition).toHaveBeenCalledWith("sam", ROOM_URL);
        expect(get(waveCardsStore)).toEqual([]);
    });

    it("reply opens the private message to the sender and removes the card", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.receive("local", 7);

        manager.reply("sam");

        expect(openPrivateMessage).toHaveBeenCalledWith("sam", "Sam");
        expect(get(waveCardsStore)).toEqual([]);
    });

    it("dismiss removes the card only", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.receive("local", 7);

        manager.dismiss("sam");

        expect(get(waveCardsStore)).toEqual([]);
        expect(fake.emitAskPosition).not.toHaveBeenCalled();
        expect(openPrivateMessage).not.toHaveBeenCalled();
    });

    it("destroy unsubscribes and clears the cards", () => {
        const fake = makeScene();
        manager = new WaveManager(fake.scene);
        fake.receive("local", 7);
        expect(get(waveCardsStore)).toHaveLength(1);

        manager.destroy();
        manager = undefined;

        expect(get(waveCardsStore)).toEqual([]);
        expect(fake.stream.observed).toBe(false);
        fake.receive("local", 7);
        expect(get(waveCardsStore)).toEqual([]);
    });
});
