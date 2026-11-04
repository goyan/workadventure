import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { SpaceUser } from "@workadventure/messages";
import { get, writable } from "svelte/store";
import type { SpaceUserExtended } from "../SpaceInterface";
import type { Streamable } from "../Streamable";
import type { PeerStatus } from "../../WebRtc/RemotePeer";
import { VideoBox } from "../VideoBox";

vi.mock("../localSpaceUser", () => ({ localSpaceUser: vi.fn() }));

describe("VideoBox text-only NPC", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("shows the avatar as ready without a media connection or a reconnection timeout", async () => {
        vi.useFakeTimers();
        const user = mock<SpaceUserExtended>(SpaceUser.fromPartial({ uuid: "npc:bob", spaceUserId: "bob" }));
        const box = VideoBox.fromRemoteSpaceUser(user, false, false);
        try {
            expect(get(box.statusStore)).toBe("connected");
            expect(get(box.streamable)).toBeUndefined();
            await vi.advanceTimersByTimeAsync(30_000);
            expect(get(box.statusStore)).toBe("connected");
            expect(box.spaceUser).toBe(user);
        } finally {
            box.destroy();
        }
    });

    it.each([
        { uuid: "uuid-muted-human", microphoneState: false },
        { uuid: "npc:audio-bob", microphoneState: true },
    ])("preserves media connection states for $uuid", ({ uuid, microphoneState }) => {
        vi.useFakeTimers();
        const user = mock<SpaceUserExtended>(SpaceUser.fromPartial({ uuid, microphoneState }));
        const statusStore = writable<PeerStatus>("connected");
        const streamable = mock<Streamable>({ statusStore });
        const box = VideoBox.fromRemoteSpaceUser(user, false, false);
        try {
            expect(get(box.statusStore)).toBe("connecting");
            box.setNewStreamable(streamable);
            expect(get(box.statusStore)).toBe("connected");
            statusStore.set("connecting");
            expect(get(box.statusStore)).toBe("reconnecting");
            vi.advanceTimersByTime(10_000);
            expect(get(box.statusStore)).toBe("error");
        } finally {
            box.destroy();
        }
    });
});
