import { describe, expect, it } from "vitest";
import {
    KNOCK_CLOCK_MARGIN_MS,
    KNOCK_COOLDOWN_MS,
    KNOCK_REPLY_TIMEOUT_MS,
    KnockState,
} from "../../../../../src/front/Phaser/Game/Knock/KnockState";
import type { KnockMessage } from "../../../../../src/front/Phaser/Game/Knock/KnockProtocol";

const request = (areaId = "a", visitorUuid = "v"): KnockMessage => ({
    kind: "request",
    areaId,
    visitorUuid,
    visitorName: "Alice",
    at: 999_999,
});
const answer = (answerValue: "enter" | "later", areaId = "a", visitorUuid = "v"): KnockMessage => ({
    kind: "answer",
    areaId,
    visitorUuid,
    answer: answerValue,
    answeredBy: "Bob",
    at: 999_999,
});
const cancel = (areaId = "a", visitorUuid = "v"): KnockMessage => ({ kind: "cancel", areaId, visitorUuid, at: 0 });
const entered = (areaId = "a", visitorUuid = "v"): KnockMessage => ({ kind: "entered", areaId, visitorUuid, at: 0 });

describe("KnockState", () => {
    it("registers a request, lists it and applies the cooldown from reception", () => {
        const s = new KnockState();
        const effects = s.receive(request(), 0);
        expect(effects).toEqual([
            { kind: "requested", request: { areaId: "a", visitorUuid: "v", visitorName: "Alice", receivedAt: 0 } },
        ]);
        expect(s.pending()).toHaveLength(1);
        expect(s.canKnock("v", "a", 29_999)).toBe(false);
        expect(s.canKnock("v", "a", 30_000)).toBe(true);
        expect(s.canKnock("v", "other", 0)).toBe(true);
    });

    it("ignores the echo of a request without resetting the timeout", () => {
        const s = new KnockState();
        s.receive(request(), 0);
        expect(s.receive(request(), 10_000)).toEqual([]);
        expect(s.pending()).toHaveLength(1);
        expect(s.expire(30_000)).toEqual([{ kind: "noAnswer", areaId: "a", visitorUuid: "v" }]);
        expect(s.pending()).toHaveLength(0);
        expect(s.expire(30_001)).toEqual([]);
    });

    it("does not expire before the delay and keeps the cooldown after noAnswer", () => {
        const s = new KnockState();
        s.receive(request(), 0);
        expect(s.expire(29_999)).toEqual([]);
        expect(s.canKnock("v", "a", 29_999)).toBe(false);
    });

    it("grants a 60 s pass from the enter answer reception", () => {
        const s = new KnockState();
        s.receive(request(), 0);
        expect(s.receive(answer("enter"), 5_000)).toEqual([
            { kind: "answered", areaId: "a", visitorUuid: "v", answer: "enter", answeredBy: "Bob" },
        ]);
        expect(s.pending()).toHaveLength(0);
        expect(s.hasPass("v", "a", 64_999)).toBe(true);
        expect(s.hasPass("v", "a", 65_000)).toBe(false);
        expect(s.expire(65_000)).toEqual([{ kind: "passExpired", areaId: "a", visitorUuid: "v" }]);
        expect(s.expire(65_001)).toEqual([]);
    });

    it("keeps only the first answer", () => {
        const s = new KnockState();
        s.receive(request(), 0);
        expect(s.receive(answer("later"), 1_000)).toHaveLength(1);
        expect(s.receive(answer("enter"), 2_000)).toEqual([]);
        expect(s.hasPass("v", "a", 3_000)).toBe(false);
        expect(s.pending()).toHaveLength(0);
    });

    it("ignores an answer without a known request", () => {
        const s = new KnockState();
        expect(s.receive(answer("enter"), 0)).toEqual([]);
        expect(s.hasPass("v", "a", 1)).toBe(false);
    });

    it("withdraws a request on cancel", () => {
        const s = new KnockState();
        s.receive(request(), 0);
        expect(s.receive(cancel(), 1_000)).toEqual([{ kind: "withdrawn", areaId: "a", visitorUuid: "v" }]);
        expect(s.pending()).toHaveLength(0);
        expect(s.receive(cancel(), 1_001)).toEqual([]);
    });

    it("dropArea withdraws the requests of that area only", () => {
        const s = new KnockState();
        s.receive(request("a", "v1"), 0);
        s.receive(request("a", "v2"), 0);
        s.receive(request("b", "v1"), 0);
        const effects = s.dropArea("a");
        expect(effects).toEqual([
            { kind: "withdrawn", areaId: "a", visitorUuid: "v1" },
            { kind: "withdrawn", areaId: "a", visitorUuid: "v2" },
        ]);
        expect(s.pending().map((r) => r.areaId)).toEqual(["b"]);
    });
    it("accepts a new request a clock margin before the end of the cooldown, unlike canKnock", () => {
        expect(KNOCK_CLOCK_MARGIN_MS).toBe(2_000);
        const s = new KnockState();
        s.receive(request(), 0);
        s.receive(cancel(), 1_000);
        const accepted = KNOCK_COOLDOWN_MS - KNOCK_CLOCK_MARGIN_MS;
        // The sender keeps the full cooldown.
        expect(s.canKnock("v", "a", accepted)).toBe(false);
        expect(s.receive(request(), accepted - 1)).toEqual([]);
        expect(s.receive(request(), accepted)).toHaveLength(1);
    });

    it("lets the caller give a request a longer reply timeout", () => {
        const s = new KnockState();
        s.receive(request(), 0, KNOCK_REPLY_TIMEOUT_MS + KNOCK_CLOCK_MARGIN_MS);
        expect(s.expire(KNOCK_REPLY_TIMEOUT_MS)).toEqual([]);
        expect(s.pending()).toHaveLength(1);
        expect(s.expire(KNOCK_REPLY_TIMEOUT_MS + KNOCK_CLOCK_MARGIN_MS)).toEqual([
            { kind: "noAnswer", areaId: "a", visitorUuid: "v" },
        ]);
    });
    it("consumes the pass when the visitor enters, and lets them knock again right away", () => {
        const state = new KnockState();
        state.receive(request(), 0);
        state.receive(answer("enter"), 5_000);

        expect(state.receive(entered(), 8_000)).toEqual([{ kind: "passUsed", areaId: "a", visitorUuid: "v" }]);

        expect(state.hasPass("v", "a", 8_001)).toBe(false);
        // Once out again, the visitor knocks again without waiting for the anti-spam delay.
        expect(state.canKnock("v", "a", 8_001)).toBe(true);
        expect(state.receive(request(), 9_000)).toHaveLength(1);
        // The consumed pass does not expire a second time.
        expect(state.expire(65_000).filter((effect) => effect.kind === "passExpired")).toEqual([]);
    });

    it("ignores an entered message without a pass", () => {
        const state = new KnockState();
        state.receive(request(), 0);

        expect(state.receive(entered(), 1_000)).toEqual([]);
        expect(state.canKnock("v", "a", 1_000)).toBe(false);
    });
});
