import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { get, readable } from "svelte/store";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "local" }) },
}));
vi.mock("../../../../../src/front/Stores/PlayersStore", () => ({
    playersStore: { getPlayerById: () => undefined, getPlayerByUuid: () => undefined },
}));
vi.mock("../../../../../src/front/Notification/SystemNotifier", () => ({
    isLocalDoNotDisturb: vi.fn(() => false),
}));
vi.mock("../../../../../src/i18n/i18n-svelte", () => {
    const LL = readable({ coffee: { someone: () => "Quelqu'un" } });
    return { LL, default: LL };
});

import { CoffeeManager } from "../../../../../src/front/Phaser/Game/Coffee/CoffeeManager";
import { COFFEE_EVENT_NAME, encodeCoffee } from "../../../../../src/front/Phaser/Game/Coffee/CoffeeProtocol";
import { COFFEE_CARD_TTL_MS, COFFEE_INVITE_COOLDOWN_MS } from "../../../../../src/front/Phaser/Game/Coffee/CoffeeState";
import { AvatarAction } from "../../../../../src/front/Phaser/Entity/AvatarAction";
import { coffeeCardsStore } from "../../../../../src/front/Stores/CoffeeStore";
import { isLocalDoNotDisturb } from "../../../../../src/front/Notification/SystemNotifier";

const LOCAL_USER_ID = 1;

function makeScene({ lateUser }: { lateUser?: Promise<{ uuid: string; name: string }> } = {}) {
    const stream = new Subject<{ name: string; data: unknown; senderId: number | undefined }>();
    const emitScriptableEvent = vi.fn((_name: string, _data: unknown, _target: unknown) => Promise.resolve());
    const emitAskPosition = vi.fn();
    const scene = {
        connection: {
            receivedEventMessageStream: stream,
            emitScriptableEvent,
            emitAskPosition,
            getUserId: () => LOCAL_USER_ID,
            getSpaceUserId: () => `room_${LOCAL_USER_ID}`,
        },
        roomUrl: "room",
        MapPlayersByKey: new Map([[7, { userUuid: "sam", playerName: "Sam" }]]),
        worldSpace: lateUser && {
            getSpaceUserBySpaceUserId: () => undefined,
            waitForSpaceUser: (id: string) =>
                id === "room_42" ? lateUser : Promise.reject(new Error("unknown space user")),
        },
    };
    return {
        scene: scene as unknown as GameScene,
        emitScriptableEvent,
        emitAskPosition,
        receive(state: "start" | "end", senderId = 7) {
            const { name, data } = encodeCoffee({ state, at: 1 });
            stream.next({ name, data, senderId });
        },
    };
}

describe("CoffeeManager", () => {
    let manager: CoffeeManager | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        vi.mocked(isLocalDoNotDisturb).mockReturnValue(false);
        coffeeCardsStore.set([]);
    });

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
        vi.useRealTimers();
    });

    it("announces the start and the end of the local coffee, at most once per cooldown", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);

        manager.onLocalAction(AvatarAction.Coffee);
        manager.onLocalAction(AvatarAction.Idle);
        expect(
            fake.emitScriptableEvent.mock.calls.map(([name, data]) => [name, (data as { state: string }).state]),
        ).toEqual([
            [COFFEE_EVENT_NAME, "start"],
            [COFFEE_EVENT_NAME, "end"],
        ]);

        // A second coffee within the cooldown stays private: no start, hence no end.
        vi.advanceTimersByTime(COFFEE_INVITE_COOLDOWN_MS - 1);
        manager.onLocalAction(AvatarAction.Coffee);
        manager.onLocalAction(AvatarAction.Idle);
        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(1);
        manager.onLocalAction(AvatarAction.Coffee);
        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(3);
    });

    it("ends the coffee when another action replaces it", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);
        manager.onLocalAction(AvatarAction.Coffee);
        manager.onLocalAction(AvatarAction.Dance);
        expect((fake.emitScriptableEvent.mock.calls[1][1] as { state: string }).state).toBe("end");
    });

    it("shows a card for a colleague's coffee and removes it at their end", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);
        fake.receive("start");
        expect(get(coffeeCardsStore)).toEqual([{ senderUuid: "sam", senderName: "Sam", receivedAt: 1_000_000 }]);
        fake.receive("end");
        expect(get(coffeeCardsStore)).toEqual([]);
    });

    it("drops a card after its lifetime when the end never comes", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);
        fake.receive("start");
        vi.advanceTimersByTime(COFFEE_CARD_TTL_MS + 60_000);
        expect(get(coffeeCardsStore)).toEqual([]);
    });

    it("shows nothing for our own echo, an unknown sender, or in do not disturb", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);
        fake.receive("start", LOCAL_USER_ID);
        fake.receive("start", 99);
        vi.mocked(isLocalDoNotDisturb).mockReturnValue(true);
        fake.receive("start");
        expect(get(coffeeCardsStore)).toEqual([]);
    });

    it("waits for a colleague who joined the room just before their coffee", async () => {
        let arrive: (user: { uuid: string; name: string }) => void = () => {};
        const fake = makeScene({
            lateUser: new Promise((resolve) => {
                arrive = resolve;
            }),
        });
        manager = new CoffeeManager(fake.scene);
        fake.receive("start", 42);
        expect(get(coffeeCardsStore)).toEqual([]);
        arrive({ uuid: "far", name: "Far" });
        await vi.waitFor(() => expect(get(coffeeCardsStore).map((card) => card.senderName)).toEqual(["Far"]));
    });

    it("walks to the colleague on join and closes the card", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);
        fake.receive("start");
        manager.join("sam");
        expect(fake.emitAskPosition).toHaveBeenCalledWith("sam", "room");
        expect(get(coffeeCardsStore)).toEqual([]);
    });

    it("announces the end when the scene closes during a coffee", () => {
        const fake = makeScene();
        manager = new CoffeeManager(fake.scene);
        manager.onLocalAction(AvatarAction.Coffee);
        manager.destroy();
        manager = undefined;
        expect((fake.emitScriptableEvent.mock.calls[1][1] as { state: string }).state).toBe("end");
    });
});
