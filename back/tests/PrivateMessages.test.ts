import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { privateMessageEventName } from "@workadventure/shared-utils";
import type { User } from "../src/Model/User";
import { PrivateMessages } from "../src/Model/PrivateMessages";

describe("PrivateMessages", () => {
    afterEach(() => vi.useRealTimers());

    it("delivers only to the recipient's sessions and supplies the real sender", () => {
        const firstDelivery = vi.fn<User["emitInBatch"]>();
        const secondDelivery = vi.fn<User["emitInBatch"]>();
        const senderDelivery = vi.fn<User["emitInBatch"]>();
        const bystanderDelivery = vi.fn<User["emitInBatch"]>();
        const sender = mock<User>({ id: 1, uuid: "human", name: "Hervé", emitInBatch: senderDelivery });
        const first = mock<User>({ id: 2, uuid: "npc:ada", emitInBatch: firstDelivery });
        const second = mock<User>({ id: 3, uuid: "npc:ada", emitInBatch: secondDelivery });
        const bystander = mock<User>({ id: 4, uuid: "other-human", emitInBatch: bystanderDelivery });
        const users = [sender, first, second, bystander];
        const messages = new PrivateMessages((uuid) => users.filter((user) => user.uuid === uuid));

        messages.send(sender, { recipientUuid: "npc:ada", text: " Bonjour Ada. " });

        const expected = {
            message: {
                $case: "receivedEventMessage",
                receivedEventMessage: {
                    name: privateMessageEventName,
                    senderId: 1,
                    data: {
                        recipientUuid: "npc:ada",
                        text: "Bonjour Ada.",
                        sender: { uuid: "human", name: "Hervé" },
                    },
                },
            },
        };
        expect(firstDelivery).toHaveBeenCalledExactlyOnceWith(expected);
        expect(secondDelivery).toHaveBeenCalledExactlyOnceWith(expected);
        expect(senderDelivery).not.toHaveBeenCalled();
        expect(bystanderDelivery).not.toHaveBeenCalled();
    });

    it("rejects impersonation, blank/oversized text, yourself and an absent recipient", () => {
        const sender = mock<User>({ id: 1, uuid: "human", name: "Hervé" });
        const delivery = vi.fn<User["emitInBatch"]>();
        const recipient = mock<User>({ uuid: "npc:ada", emitInBatch: delivery });
        const messages = new PrivateMessages((uuid) => (uuid === recipient.uuid ? [recipient] : []));
        for (const request of [
            { recipientUuid: "npc:ada", text: "Bonjour", sender: { uuid: "forged", name: "Admin" } },
            { recipientUuid: "npc:ada", text: " " },
            { recipientUuid: "npc:ada", text: "a".repeat(501) },
            { recipientUuid: "human", text: "Bonjour" },
            { recipientUuid: "absent", text: "Bonjour" },
        ])
            expect(() => messages.send(sender, request)).toThrow();
        expect(delivery).not.toHaveBeenCalled();
    });

    it("allows thirty messages per minute then permits sending in the next window", () => {
        vi.useFakeTimers();
        const sender = mock<User>({ uuid: "human", name: "Hervé" });
        const delivery = vi.fn<User["emitInBatch"]>();
        const recipient = mock<User>({ uuid: "npc:ada", emitInBatch: delivery });
        const messages = new PrivateMessages(() => [recipient]);
        const request = { recipientUuid: "npc:ada", text: "Bonjour" };
        for (let i = 0; i < 30; i++) messages.send(sender, request);
        expect(() => messages.send(sender, request)).toThrow(/Too many/);
        expect(delivery).toHaveBeenCalledTimes(30);
        vi.advanceTimersByTime(60000);
        messages.send(sender, request);
        expect(delivery).toHaveBeenCalledTimes(31);
    });
});
