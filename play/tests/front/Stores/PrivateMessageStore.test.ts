import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearPrivateMessages,
    getPrivateMessageRecorder,
    privateMessageHistoryStore,
    privateMessageNotificationStore,
    receivePrivateMessage,
    recordPrivateMessage,
    restorePrivateMessages,
} from "../../../src/front/Stores/PrivateMessageStore";
import { blackListManager } from "../../../src/front/WebRtc/BlackListManager";

const message = {
    recipientUuid: "human",
    text: "Bonjour <b>Hervé</b>",
    sender: { uuid: "npc:ada", name: "NPC · Ada" },
};

describe("private message history", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        clearPrivateMessages();
        blackListManager.cancelBlackList("npc:ada");
        localStorage.clear();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("keeps private text with its author and filters blocked users and malformed payloads", () => {
        receivePrivateMessage(message);
        expect(get(privateMessageNotificationStore)).toMatchObject({
            peerUuid: "npc:ada",
            peerName: "NPC · Ada",
            text: message.text,
            incoming: true,
        });
        blackListManager.blackList("npc:ada");
        receivePrivateMessage(message);
        receivePrivateMessage({ text: "Invalid" });
        expect(get(privateMessageHistoryStore)).toHaveLength(1);
    });

    it("bounds history, does not notify for your own reply, and clears on room close", () => {
        for (let i = 0; i < 105; i++)
            recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: String(i), incoming: false });
        expect(get(privateMessageHistoryStore)).toHaveLength(100);
        expect(get(privateMessageHistoryStore)[0].text).toBe("5");
        expect(get(privateMessageNotificationStore)).toBeUndefined();
        clearPrivateMessages();
        expect(get(privateMessageHistoryStore)).toEqual([]);
    });

    it("restores sent and received text, author, direction, order and time after a page reload", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
        restorePrivateMessages("human", "https://play.test/~/office.wam");
        receivePrivateMessage(message);
        vi.advanceTimersByTime(1000);
        recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: "My reply", incoming: false });
        const savedMessages = get(privateMessageHistoryStore);
        clearPrivateMessages();
        vi.resetModules();
        const reloaded = await import("../../../src/front/Stores/PrivateMessageStore");

        const close = reloaded.restorePrivateMessages("human", "https://play.test/~/office.wam");

        expect(get(reloaded.privateMessageHistoryStore)).toEqual(savedMessages);
        expect(savedMessages.map((entry) => entry.timestamp)).toEqual([
            Date.parse("2026-11-05T12:00:00Z"),
            Date.parse("2026-11-05T12:00:01Z"),
        ]);
        expect(get(reloaded.privateMessageNotificationStore)).toBeUndefined();
        reloaded.recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: "Next", incoming: false });
        const entries = get(reloaded.privateMessageHistoryStore);
        expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
        close();
    });

    it("isolates accounts and rooms, and restores each when returning", () => {
        restorePrivateMessages("human", "room-one");
        receivePrivateMessage(message);
        restorePrivateMessages("other-user", "room-one");
        expect(get(privateMessageHistoryStore)).toEqual([]);
        recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: "Other account", incoming: false });
        restorePrivateMessages("human", "room-two");
        expect(get(privateMessageHistoryStore)).toEqual([]);
        recordPrivateMessage({ peerUuid: "peer-bob", peerName: "Bob", text: "Other room", incoming: false });

        restorePrivateMessages("human", "room-one");
        expect(get(privateMessageHistoryStore).map((entry) => entry.text)).toEqual([message.text]);
        restorePrivateMessages("other-user", "room-one");
        expect(get(privateMessageHistoryStore).map((entry) => entry.text)).toEqual(["Other account"]);
        restorePrivateMessages("human", "room-two");
        expect(get(privateMessageHistoryStore).map((entry) => entry.text)).toEqual(["Other room"]);
    });

    it("bounds saved history across rooms and accounts as well as the active history", () => {
        restorePrivateMessages("human", "room-one");
        for (let i = 0; i < 105; i++)
            recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: String(i), incoming: false });
        clearPrivateMessages();
        restorePrivateMessages("human", "room-one");
        expect(get(privateMessageHistoryStore)).toHaveLength(100);
        expect(get(privateMessageHistoryStore)[0].text).toBe("5");
        restorePrivateMessages("other-user", "room-two");
        for (let i = 0; i < 100; i++)
            recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: String(i), incoming: false });
        restorePrivateMessages("human", "room-one");
        expect(get(privateMessageHistoryStore)).toEqual([]);
    });

    it("does not let a closing old connection or its late ACK clear or enter another session", () => {
        const closeOldConnection = restorePrivateMessages("human", "room-one");
        const recordOldAck = getPrivateMessageRecorder();
        restorePrivateMessages("other-user", "room-two");
        recordPrivateMessage({ peerUuid: "npc:ada", peerName: "Ada", text: "Current", incoming: false });

        closeOldConnection();
        recordOldAck({ peerUuid: "npc:ada", peerName: "Ada", text: "Late", incoming: false });
        receivePrivateMessage(message, "room-one", "human");
        receivePrivateMessage(message);

        expect(get(privateMessageHistoryStore).map((entry) => entry.text)).toEqual(["Current"]);
        clearPrivateMessages();
        restorePrivateMessages("human", "room-one");
        expect(get(privateMessageHistoryStore)).toEqual([]);
    });

    it("keeps messaging working when browser storage is inaccessible or full", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("denied", "SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError");
        });
        expect(() => {
            restorePrivateMessages("human", "room-one");
            receivePrivateMessage(message);
        }).not.toThrow();
        expect(get(privateMessageHistoryStore)).toHaveLength(1);
        expect(get(privateMessageNotificationStore)?.text).toBe(message.text);
    });

    it("ignores malformed saved history and does not persist an unidentified connection", () => {
        restorePrivateMessages("human", "room-one");
        receivePrivateMessage(message);
        const savedKey = localStorage.key(0);
        if (!savedKey) throw new Error("Private message history was not saved");
        localStorage.setItem(savedKey, '{"unexpected":true}');
        restorePrivateMessages("human", "room-one");
        expect(get(privateMessageHistoryStore)).toEqual([]);
        localStorage.setItem(savedKey, "{broken");
        restorePrivateMessages("human", "room-one");
        expect(get(privateMessageHistoryStore)).toEqual([]);
        localStorage.clear();
        restorePrivateMessages(undefined, "room-one");
        receivePrivateMessage(message);
        expect(get(privateMessageHistoryStore)).toHaveLength(1);
        expect(localStorage.length).toBe(0);
    });
});
