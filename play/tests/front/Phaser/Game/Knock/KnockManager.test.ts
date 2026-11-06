import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { get, readable, writable } from "svelte/store";
import { marked } from "marked";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const onVisitorAccepted = vi.fn();
const linkDestroy = vi.fn();

vi.mock("../../../../../src/front/Phaser/Game/Knock/KnockStatusLink", () => ({
    KnockStatusLink: class {
        onVisitorAccepted = onVisitorAccepted;
        destroy = linkDestroy;
    },
}));
vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "local" }) },
}));
vi.mock("../../../../../src/front/Stores/MediaStore", () => ({
    requestedStatusStore: writable(null),
}));
vi.mock("../../../../../src/front/Rules/StatusRules/statusChangerFunctions", () => ({
    resetAllStatusStoreExcept: vi.fn(),
}));
vi.mock("../../../../../src/front/Stores/AreaPropertyVariablesStore", () => ({
    setAreaPropertyVariable: vi.fn(),
}));
const notifySystem = vi.hoisted(() => vi.fn());
vi.mock("../../../../../src/front/Notification/SystemNotifier", () => ({ notifySystem }));
vi.mock("../../../../../src/front/Touch/TouchScreenManager", () => ({
    touchScreenManager: { detectPrimaryTouchDevice: () => false },
}));
vi.mock("../../../../../src/i18n/i18n-svelte", () => {
    const LL = readable({
        trigger: { spaceKeyboard: () => "Space" },
        area: {
            knock: {
                request: ({ name }: { name: string }) => `request ${name}`,
                waiting: () => "waiting",
                later: () => "later",
                noAnswer: () => "noAnswer",
                opened: ({ name }: { name: string }) => `opened ${name}`,
            },
        },
    });
    return { LL, default: LL };
});

import {
    KNOCK_CANCEL_DISTANCE_PX,
    KNOCK_SOUND_KEY,
    KnockManager,
} from "../../../../../src/front/Phaser/Game/Knock/KnockManager";
import { knockRequestsStore } from "../../../../../src/front/Stores/KnockStore";
import { encodeKnockMessage } from "../../../../../src/front/Phaser/Game/Knock/KnockProtocol";
import type { KnockMessage } from "../../../../../src/front/Phaser/Game/Knock/KnockProtocol";
import {
    KNOCK_CLOCK_MARGIN_MS,
    KNOCK_COOLDOWN_MS,
    KNOCK_PASS_MS,
    KNOCK_REPLY_TIMEOUT_MS,
} from "../../../../../src/front/Phaser/Game/Knock/KnockState";
import { Character } from "../../../../../src/front/Phaser/Entity/Character";
import { setAreaPropertyVariable } from "../../../../../src/front/Stores/AreaPropertyVariablesStore";

// Area "z": a 100 x 100 square at (100, 100).
const ZONE = { areaId: "z", propertyId: "lock-prop", area: { id: "z", x: 100, y: 100, width: 100, height: 100 } };

interface FakeText {
    text: string;
    callback: () => void;
}

function makeScene({ admin = false }: { admin?: boolean } = {}) {
    const stream = new Subject<{ name: string; data: unknown; senderId: number | undefined }>();
    const emitScriptableEvent = vi.fn((_name: string, _data: unknown, _target: unknown) => Promise.resolve());
    const insideAreas = new Set<string>();
    const areasManager = {
        setLockPass: vi.fn(),
        getLockedAreas: vi.fn(() => [ZONE]),
        updateAreaCollision: vi.fn(),
        isCurrentPlayerInArea: vi.fn((areaId: string) => insideAreas.has(areaId)),
    };
    // Keeps its texts like a Character does, so that the real Space handler can run over them.
    const texts = new Map<string, FakeText>();
    const player = {
        x: 150,
        y: 90,
        playerName: "Local",
        texts,
        // Like Character.playText: a text shown again under the same id is removed, then added at the end.
        playText: vi.fn((id: string, text: string, _duration: number, callback: () => void) => {
            texts.delete(id);
            texts.set(id, { text, callback });
        }),
        destroyText: vi.fn((id: string) => {
            texts.delete(id);
        }),
    };
    const soundPlay = vi.fn();
    let tick: (() => void) | undefined;
    const timerRemove = vi.fn();
    const scene = {
        connection: {
            receivedEventMessageStream: stream,
            emitScriptableEvent,
            hasTag: (tag: string) => admin && tag === "admin",
        },
        CurrentPlayer: player,
        sound: { play: soundPlay },
        time: {
            addEvent: (config: { callback: () => void }) => {
                tick = config.callback;
                return { remove: timerRemove };
            },
        },
        getGameMapFrontWrapper: () => ({ areasManager }),
    };
    return {
        scene: scene as unknown as GameScene,
        stream,
        emitScriptableEvent,
        insideAreas,
        areasManager,
        player,
        soundPlay,
        timerRemove,
        tick: () => tick?.(),
        /** The real Character handler, as GameSceneUserInputHandler calls it on Space. */
        pressSpace: () => Character.prototype.handlePressSpacePlayerTextCallback.call(player as unknown as Character),
        receive(message: KnockMessage) {
            const { name, data } = encodeKnockMessage(message);
            stream.next({ name, data, senderId: 7 });
        },
    };
}

function emittedKinds(emit: ReturnType<typeof makeScene>["emitScriptableEvent"]): string[] {
    return emit.mock.calls.map(([name]) => name);
}

describe("KnockManager", () => {
    let manager: KnockManager | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        onVisitorAccepted.mockClear();
        notifySystem.mockClear();
        linkDestroy.mockClear();
        vi.mocked(setAreaPropertyVariable).mockClear();
    });

    afterEach(() => {
        manager?.destroy();
        manager = undefined;
        vi.useRealTimers();
    });

    it("emits a request and shows the waiting text; a second immediate knock emits nothing", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);

        manager.knock("z");

        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.request"]);
        expect(fake.emitScriptableEvent.mock.calls[0][1]).toMatchObject({
            kind: "request",
            areaId: "z",
            visitorUuid: "local",
            visitorName: "Local",
        });
        expect(fake.player.playText).toHaveBeenCalledWith(
            "knock-z",
            "waiting",
            expect.any(Number),
            expect.any(Function),
            true,
            "message",
        );

        manager.knock("z");
        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
    });

    it("shows a request to an occupant of the area and plays the knock sound once", () => {
        const fake = makeScene();
        fake.insideAreas.add("z");
        manager = new KnockManager(fake.scene);

        fake.receive({ kind: "request", areaId: "z", visitorUuid: "v", visitorName: "Alice", at: 0 });

        expect(get(knockRequestsStore)).toMatchObject([{ areaId: "z", visitorUuid: "v", visitorName: "Alice" }]);
        expect(fake.soundPlay).toHaveBeenCalledWith(KNOCK_SOUND_KEY, expect.objectContaining({ volume: 0.5 }));

        fake.tick();
        expect(fake.soundPlay).toHaveBeenCalledTimes(1);
        expect(notifySystem).toHaveBeenCalledTimes(1);
        expect(notifySystem).toHaveBeenCalledWith({
            kind: "knock",
            title: "request Alice",
            body: "",
            tag: "knock:z:v",
        });
    });

    it("shows nothing and plays no sound to a player outside the area", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);

        fake.receive({ kind: "request", areaId: "z", visitorUuid: "v", visitorName: "Alice", at: 0 });

        expect(get(knockRequestsStore)).toEqual([]);
        expect(fake.soundPlay).not.toHaveBeenCalled();
        expect(notifySystem).not.toHaveBeenCalled();
    });

    it("answers enter: emits the answer, clears the request and lets the status link restore the status", () => {
        const fake = makeScene();
        fake.insideAreas.add("z");
        manager = new KnockManager(fake.scene);
        fake.receive({ kind: "request", areaId: "z", visitorUuid: "v", visitorName: "Alice", at: 0 });

        manager.answer("z", "v", "enter");

        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.answer"]);
        expect(fake.emitScriptableEvent.mock.calls[0][1]).toMatchObject({
            kind: "answer",
            areaId: "z",
            visitorUuid: "v",
            answer: "enter",
            answeredBy: "Local",
        });
        expect(get(knockRequestsStore)).toEqual([]);
        expect(onVisitorAccepted).toHaveBeenCalledTimes(1);
    });

    it("consumes the local visitor's pass once inside: leaving again means knocking again", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");
        fake.receive({ kind: "answer", areaId: "z", visitorUuid: "local", answer: "enter", answeredBy: "Bob", at: 0 });
        fake.areasManager.updateAreaCollision.mockClear();

        fake.insideAreas.add("z");
        fake.tick();

        expect(emittedKinds(fake.emitScriptableEvent)).toContain("infogene.knock.entered");
        expect(manager.hasPass("local", "z")).toBe(false);
        expect(fake.areasManager.updateAreaCollision).toHaveBeenCalledWith("z");
    });

    it("gives the local visitor a pass on enter, removed after KNOCK_PASS_MS", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");

        fake.receive({ kind: "answer", areaId: "z", visitorUuid: "local", answer: "enter", answeredBy: "Bob", at: 0 });

        expect(manager.hasPass("local", "z")).toBe(true);
        expect(fake.areasManager.updateAreaCollision).toHaveBeenCalledWith("z");
        expect(fake.player.playText).toHaveBeenLastCalledWith(
            "knock-z",
            "opened Bob",
            expect.any(Number),
            expect.any(Function),
            true,
            "message",
        );
        // The areas manager asks the manager through the lock pass it was given.
        const lockPass = fake.areasManager.setLockPass.mock.calls[0][0] as (areaId: string) => boolean;
        expect(lockPass("z")).toBe(true);
        expect(manager.getDoorLocks().hasPass("local", "z")).toBe(true);

        fake.areasManager.updateAreaCollision.mockClear();
        vi.advanceTimersByTime(KNOCK_PASS_MS);
        fake.tick();

        expect(manager.hasPass("local", "z")).toBe(false);
        expect(lockPass("z")).toBe(false);
        expect(fake.areasManager.updateAreaCollision).toHaveBeenCalledWith("z");
    });

    it("cancels the request when the visitor walks away from the area", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");

        // Just outside the cancel distance: nothing happens.
        fake.player.y = 100 - KNOCK_CANCEL_DISTANCE_PX;
        fake.tick();
        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.request"]);

        fake.player.y = 100 - KNOCK_CANCEL_DISTANCE_PX - 1;
        fake.tick();
        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.request", "infogene.knock.cancel"]);
        expect(fake.player.destroyText).toHaveBeenCalledWith("knock-z");
    });

    it("drops the requests of an area that is no longer locked", () => {
        const fake = makeScene();
        fake.insideAreas.add("z");
        manager = new KnockManager(fake.scene);
        fake.receive({ kind: "request", areaId: "z", visitorUuid: "v", visitorName: "Alice", at: 0 });

        fake.areasManager.getLockedAreas.mockReturnValue([]);
        fake.tick();

        expect(get(knockRequestsStore)).toEqual([]);
    });

    it("exposes the locked areas as door zones", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);

        expect(manager.getDoorLocks().zones).toEqual([{ areaId: "z", x: 100, y: 100, width: 100, height: 100 }]);
    });

    it("cleans up on destroy", () => {
        const fake = makeScene();
        fake.insideAreas.add("z");
        manager = new KnockManager(fake.scene);
        fake.receive({ kind: "request", areaId: "z", visitorUuid: "v", visitorName: "Alice", at: 0 });

        manager.destroy();
        manager = undefined;

        expect(fake.timerRemove).toHaveBeenCalled();
        expect(linkDestroy).toHaveBeenCalled();
        expect(get(knockRequestsStore)).toEqual([]);
        expect(fake.stream.observed).toBe(false);
        const lastLockPass = fake.areasManager.setLockPass.mock.calls.at(-1)?.[0] as (areaId: string) => boolean;
        expect(lastLockPass("z")).toBe(false);
    });
    /** The blocked message of Area.displayBlockedWarningMessage for a locked area: Space knocks. */
    function showPrompt(fake: ReturnType<typeof makeScene>, knockManager: KnockManager): void {
        fake.player.playText("area-blocked-z", "prompt", 5000, () => {
            fake.player.destroyText("area-blocked-z");
            knockManager.knock("z");
        });
    }

    it("keeps the waiting text after the Space press that knocked", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        showPrompt(fake, manager);

        fake.pressSpace();

        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.request"]);
        expect(fake.player.texts.get("knock-z")?.text).toBe("waiting");
        expect(fake.player.texts.has("area-blocked-z")).toBe(false);

        // A second press closes it.
        fake.pressSpace();
        expect(fake.player.texts.has("knock-z")).toBe(false);
    });

    it("makes an admin knock and wait like everyone, with no way to force the door open", () => {
        const fake = makeScene({ admin: true });
        manager = new KnockManager(fake.scene);
        showPrompt(fake, manager);

        fake.pressSpace();

        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.request"]);
        expect(fake.player.texts.get("knock-z")?.text).toBe("waiting");

        // A second press only closes the waiting text.
        fake.pressSpace();

        expect(fake.player.texts.has("knock-z")).toBe(false);
        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });

    it("shows nothing new to an admin whose knock is refused by the cooldown", () => {
        const fake = makeScene({ admin: true });
        manager = new KnockManager(fake.scene);
        manager.knock("z");
        fake.player.playText.mockClear();

        manager.knock("z");

        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(fake.player.playText).not.toHaveBeenCalled();
        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });

    it("shows nothing new to a non-admin whose knock is refused by the cooldown", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");
        fake.player.playText.mockClear();

        manager.knock("z");

        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(fake.player.playText).not.toHaveBeenCalled();
    });
    it("does not knock again when the prompt precedes the waiting text (one press)", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");
        // The bubble stack can reorder the texts (by length): here the prompt comes first.
        const waiting = fake.player.texts.get("knock-z");
        fake.player.texts.delete("knock-z");
        showPrompt(fake, manager);
        if (waiting) fake.player.texts.set("knock-z", waiting);
        expect([...fake.player.texts.keys()]).toEqual(["area-blocked-z", "knock-z"]);

        fake.pressSpace();

        // No second knock: the prompt's knock is refused by the anti-spam delay.
        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(setAreaPropertyVariable).not.toHaveBeenCalled();
    });

    it("shows no waiting text when the knock was not sent (own request still pending after the cooldown)", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");
        vi.advanceTimersByTime(KNOCK_COOLDOWN_MS);
        fake.player.playText.mockClear();

        manager.knock("z");

        expect(fake.emitScriptableEvent).toHaveBeenCalledTimes(1);
        expect(fake.player.playText).not.toHaveBeenCalled();
    });

    it("drops the echo of its own request", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);

        fake.receive({ kind: "request", areaId: "z", visitorUuid: "local", visitorName: "Local", at: 0 });
        manager.knock("z");

        expect(emittedKinds(fake.emitScriptableEvent)).toEqual(["infogene.knock.request"]);
    });

    it("waits a clock margin longer than the occupants before telling the visitor nobody answers", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");

        vi.advanceTimersByTime(KNOCK_REPLY_TIMEOUT_MS);
        fake.tick();
        expect(fake.player.texts.get("knock-z")?.text).toBe("waiting");

        vi.advanceTimersByTime(KNOCK_CLOCK_MARGIN_MS);
        fake.tick();
        expect(fake.player.texts.get("knock-z")?.text).toBe("noAnswer");
    });

    it("removes the card of an occupant after the reply timeout", () => {
        const fake = makeScene();
        fake.insideAreas.add("z");
        manager = new KnockManager(fake.scene);
        fake.receive({ kind: "request", areaId: "z", visitorUuid: "v", visitorName: "Alice", at: 0 });

        vi.advanceTimersByTime(KNOCK_REPLY_TIMEOUT_MS);
        fake.tick();

        expect(get(knockRequestsStore)).toEqual([]);
    });

    it("escapes the Markdown of the name in the visitor's bubble", () => {
        const fake = makeScene();
        manager = new KnockManager(fake.scene);
        manager.knock("z");

        fake.receive({
            kind: "answer",
            areaId: "z",
            visitorUuid: "local",
            answer: "enter",
            answeredBy: "a_b*c[x](y)",
            at: 0,
        });

        const text = fake.player.texts.get("knock-z")?.text ?? "";
        expect(text).toBe("opened a\\_b\\*c\\[x\\]\\(y\\)");
        // Rendered as the bubble does: the name comes out literally, no emphasis nor link.
        expect(marked.parse(text, { async: false })).toBe("<p>opened a_b*c[x](y)</p>\n");
    });
});
