import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    IncomingCall,
    INVITATION_RING_MS,
    INVITATION_RING_REPEAT_MS,
    OutgoingCalls,
} from "../../../../src/front/Phaser/Game/InvitationCall";

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("OutgoingCalls", () => {
    it("tells the caller nobody answered when the ring ends", () => {
        const unanswered = vi.fn();
        const calls = new OutgoingCalls(unanswered);
        calls.start("Bob");
        vi.advanceTimersByTime(INVITATION_RING_MS - 1);
        expect(unanswered).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(unanswered).toHaveBeenCalledExactlyOnceWith("Bob");
        expect(calls.isRinging("Bob")).toBe(false);
    });

    it("says nothing more once the call is answered, accepted or declined", () => {
        const unanswered = vi.fn();
        const calls = new OutgoingCalls(unanswered);
        calls.start("Bob");
        calls.start("Carol");
        expect(calls.answered("Bob")).toBe(true);
        vi.advanceTimersByTime(INVITATION_RING_MS);
        expect(unanswered).toHaveBeenCalledExactlyOnceWith("Carol");
        // An answer after the ring ended was no longer ringing.
        expect(calls.answered("Carol")).toBe(false);
    });

    it("rings again from the start when the same person is called again", () => {
        const unanswered = vi.fn();
        const calls = new OutgoingCalls(unanswered);
        calls.start("Bob");
        vi.advanceTimersByTime(INVITATION_RING_MS - 1000);
        calls.start("Bob");
        vi.advanceTimersByTime(1000);
        expect(unanswered).not.toHaveBeenCalled();
        vi.advanceTimersByTime(INVITATION_RING_MS);
        expect(unanswered).toHaveBeenCalledOnce();
    });

    it("stops every ring when closed", () => {
        const unanswered = vi.fn();
        const calls = new OutgoingCalls(unanswered);
        calls.start("Bob");
        calls.close();
        vi.advanceTimersByTime(INVITATION_RING_MS);
        expect(unanswered).not.toHaveBeenCalled();
    });
});

describe("IncomingCall", () => {
    it("rings at once and again while nobody answers, then is missed", () => {
        const ring = vi.fn();
        const missed = vi.fn();
        const call = new IncomingCall(ring, missed);
        const end = call.start(1_000);
        expect(end).toBe(1_000 + INVITATION_RING_MS);
        expect(ring).toHaveBeenCalledExactlyOnceWith(true);
        vi.advanceTimersByTime(INVITATION_RING_REPEAT_MS);
        expect(ring).toHaveBeenCalledTimes(2);
        expect(ring).toHaveBeenLastCalledWith(false);
        vi.advanceTimersByTime(INVITATION_RING_MS);
        expect(missed).toHaveBeenCalledOnce();
        expect(call.isRinging()).toBe(false);
        // Missed: it rings no more.
        const rings = ring.mock.calls.length;
        vi.advanceTimersByTime(INVITATION_RING_MS);
        expect(ring).toHaveBeenCalledTimes(rings);
    });

    it("stops ringing and is never missed once answered", () => {
        const ring = vi.fn();
        const missed = vi.fn();
        const call = new IncomingCall(ring, missed);
        call.start();
        call.stop();
        vi.advanceTimersByTime(2 * INVITATION_RING_MS);
        expect(ring).toHaveBeenCalledOnce();
        expect(missed).not.toHaveBeenCalled();
    });

    it("rings from the start for a new invitation", () => {
        const missed = vi.fn();
        const call = new IncomingCall(vi.fn(), missed);
        call.start();
        vi.advanceTimersByTime(INVITATION_RING_MS - 1000);
        call.start();
        vi.advanceTimersByTime(1000);
        expect(missed).not.toHaveBeenCalled();
        vi.advanceTimersByTime(INVITATION_RING_MS);
        expect(missed).toHaveBeenCalledOnce();
    });
});
