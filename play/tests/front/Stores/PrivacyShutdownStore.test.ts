import { describe, expect, it, vi } from "vitest";

describe("privacyShutdownStore", () => {
    it("cuts the camera when the window loses the focus out of a discussion, and gives it back when a discussion starts", async () => {
        vi.resetModules();
        const { writable, get } = await import("svelte/store");
        const focus = writable(false);
        const peers = writable<unknown[]>([]);
        vi.doMock("../../../src/front/Stores/FocusStore", () => ({ focusStore: focus }));
        vi.doMock("../../../src/front/Stores/PeerStore", () => ({ videoStreamElementsStore: peers }));
        vi.doMock("../../../src/front/Stores/IsStreamingStore", () => ({ isLiveStreamingStore: writable(false) }));
        const { privacyShutdownStore } = await import("../../../src/front/Stores/PrivacyShutdownStore");

        // Out of a discussion, without the focus: the camera is cut.
        expect(get(privacyShutdownStore)).toBe(true);
        // Someone comes into the bubble while the window still has no focus: the camera comes back.
        peers.set([{}]);
        expect(get(privacyShutdownStore)).toBe(false);
        // The discussion ends, still without the focus: cut again.
        peers.set([]);
        expect(get(privacyShutdownStore)).toBe(true);
        // The focus comes back: on.
        focus.set(true);
        expect(get(privacyShutdownStore)).toBe(false);
    });
});
