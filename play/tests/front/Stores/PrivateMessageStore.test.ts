import { get } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";
import {
    clearPrivateMessages,
    privateMessageHistoryStore,
    privateMessageNotificationStore,
    receivePrivateMessage,
    recordPrivateMessage,
} from "../../../src/front/Stores/PrivateMessageStore";
import { blackListManager } from "../../../src/front/WebRtc/BlackListManager";

const message = {
    recipientUuid: "human",
    text: "Bonjour <b>Hervé</b>",
    sender: { uuid: "npc:ada", name: "NPC · Ada" },
};

describe("private message history", () => {
    afterEach(() => {
        clearPrivateMessages();
        blackListManager.cancelBlackList("npc:ada");
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
});
