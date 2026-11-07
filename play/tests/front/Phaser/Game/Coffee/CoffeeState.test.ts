import { describe, expect, it } from "vitest";
import {
    COFFEE_CARD_TTL_MS,
    COFFEE_INVITE_COOLDOWN_MS,
    CoffeeState,
} from "../../../../../src/front/Phaser/Game/Coffee/CoffeeState";

describe("CoffeeState", () => {
    it("invites at most once per cooldown", () => {
        const state = new CoffeeState();
        expect(state.canInvite(0)).toBe(true);
        state.recordInvite(0);
        expect(state.canInvite(COFFEE_INVITE_COOLDOWN_MS - 1)).toBe(false);
        expect(state.canInvite(COFFEE_INVITE_COOLDOWN_MS)).toBe(true);
    });

    it("shows one card per colleague, removed when their coffee ends", () => {
        const state = new CoffeeState();
        expect(state.receiveStart("sam", "Sam", 0)).toEqual({ senderUuid: "sam", senderName: "Sam", receivedAt: 0 });
        expect(state.cards(1)).toHaveLength(1);
        state.receiveEnd("sam");
        expect(state.cards(2)).toEqual([]);
    });

    it("ignores a new invitation of the same colleague before the cooldown, even after a reload of theirs", () => {
        const state = new CoffeeState();
        state.receiveStart("sam", "Sam", 0);
        state.receiveEnd("sam");
        expect(state.receiveStart("sam", "Sam", COFFEE_INVITE_COOLDOWN_MS - 1)).toBeUndefined();
        expect(state.cards(COFFEE_INVITE_COOLDOWN_MS - 1)).toEqual([]);
        expect(state.receiveStart("sam", "Sam", COFFEE_INVITE_COOLDOWN_MS)).toBeDefined();
    });

    it("drops a card after its lifetime, in case the end never comes", () => {
        const state = new CoffeeState();
        state.receiveStart("sam", "Sam", 0);
        expect(state.cards(COFFEE_CARD_TTL_MS - 1)).toHaveLength(1);
        expect(state.cards(COFFEE_CARD_TTL_MS)).toEqual([]);
    });

    it("closes a card on dismiss, most recent first otherwise", () => {
        const state = new CoffeeState();
        state.receiveStart("sam", "Sam", 0);
        state.receiveStart("lea", "Léa", 10);
        expect(state.cards(20).map((card) => card.senderUuid)).toEqual(["lea", "sam"]);
        state.dismiss("lea");
        expect(state.cards(20).map((card) => card.senderUuid)).toEqual(["sam"]);
    });
});
