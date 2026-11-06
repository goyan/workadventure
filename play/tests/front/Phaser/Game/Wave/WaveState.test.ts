import { describe, expect, it } from "vitest";
import { WAVE_COOLDOWN_MS, WaveState } from "../../../../../src/front/Phaser/Game/Wave/WaveState";

describe("WaveState", () => {
    it("applies a per-target cooldown", () => {
        const state = new WaveState();
        expect(state.canWave("b", 0)).toBe(true);
        state.recordSent("b", 0);
        expect(state.canWave("b", WAVE_COOLDOWN_MS - 1)).toBe(false);
        expect(state.canWave("b", WAVE_COOLDOWN_MS)).toBe(true);
        expect(state.canWave("c", 1)).toBe(true);
    });

    it("keeps one card per sender, upserted", () => {
        const state = new WaveState();
        state.receive("a", "Alice", 1);
        const card = state.receive("a", "Alice", 5);
        expect(card).toEqual({ senderUuid: "a", senderName: "Alice", receivedAt: 5 });
        expect(state.cards()).toEqual([card]);
    });

    it("lists the most recent card first, in a fresh array", () => {
        const state = new WaveState();
        state.receive("a", "Alice", 1);
        state.receive("b", "Bob", 2);
        const list = state.cards();
        expect(list.map((c) => c.senderUuid)).toEqual(["b", "a"]);
        expect(state.cards()).not.toBe(list);
    });

    it("re-ordering follows a newer wave", () => {
        const state = new WaveState();
        state.receive("a", "Alice", 1);
        state.receive("b", "Bob", 2);
        state.receive("a", "Alice", 3);
        expect(state.cards().map((c) => c.senderUuid)).toEqual(["a", "b"]);
    });

    it("dismiss removes the card", () => {
        const state = new WaveState();
        state.receive("a", "Alice", 1);
        state.receive("b", "Bob", 2);
        state.dismiss("b");
        state.dismiss("zzz");
        expect(state.cards().map((c) => c.senderUuid)).toEqual(["a"]);
    });
});
