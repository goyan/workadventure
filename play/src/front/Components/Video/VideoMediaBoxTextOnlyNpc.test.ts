import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readable, writable } from "svelte/store";
import { Subject } from "rxjs";
import { SpaceUser } from "@workadventure/messages";
import { mock } from "vitest-mock-extended";
import type { SpaceUserExtended } from "../../Space/SpaceInterface";
import { VideoBox } from "../../Space/VideoBox";
import VideoMediaBox from "./VideoMediaBox.svelte";

vi.mock("../../Space/localSpaceUser", () => ({ localSpaceUser: vi.fn() }));
vi.mock("../../Phaser/Game/GameManager", () => ({ gameManager: { getCurrentGameScene: vi.fn() } }));
vi.mock("../../Administration/AnalyticsClient", () => ({ analyticsClient: { trackAdminEvent: vi.fn() } }));
vi.mock("../../Administration/CurrentMeeting", () => ({ meetingOf: vi.fn() }));
vi.mock("../../Utils/screenBlocker", () => ({ blocker: () => undefined }));
vi.mock("../../Utils/svelte-floatingui-show", () => ({ showFloatingUi: vi.fn() }));
vi.mock("../../Stores/HighlightedEmbedScreenStore", () => ({ highlightedEmbedScreen: writable(undefined) }));
vi.mock("../../Stores/ActionsCamStore", () => ({ highlightFullScreen: writable(false) }));
vi.mock("../../Stores/DisplayVideoQualityStore", () => ({ displayVideoQualityStore: readable(false) }));
vi.mock("../../Stores/MegaphoneStore", () => ({ requestedMegaphoneStore: readable(false) }));
vi.mock("../../Stores/MediaStore", () => ({
    rawLocalVideoTrackStore: readable(undefined),
    requestedCameraState: readable(false),
    requestedMicrophoneState: readable(false),
}));
vi.mock("../../Stores/ScreenSharingStore", () => ({ requestedScreenSharingState: readable(false) }));
vi.mock("../../Stores/PeerStore", () => ({ activePictureInPictureStore: readable(false) }));
vi.mock("../../Stores/RaisedHandsStore", () => ({
    raisedHandsOrderStore: readable(new Map()),
    findHandPosition: () => undefined,
}));
vi.mock("../../WebRtc/BlackListManager", () => ({
    blackListManager: {
        onBlockStream: new Subject(),
        onUnBlockStream: new Subject(),
        isBlackListed: () => false,
    },
}));
vi.mock("../../../i18n/i18n-svelte", () => ({
    LL: readable({ video: { connecting: () => "Connecting", reconnecting: () => "Reconnecting" } }),
}));
vi.mock("./ActionMediaBox.svelte", () => ({ default: () => undefined }));
vi.mock("./WebRtcStatsBox.svelte", () => ({ default: () => undefined }));
vi.mock("./EncoderStatsBox.svelte", () => ({ default: () => undefined }));
vi.mock("./CenteredVideo.svelte", () => ({ default: () => undefined }));

describe("VideoMediaBox text-only NPC", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("renders the name and avatar without a media stream and keeps them visible after 30 seconds", async () => {
        vi.useFakeTimers();
        const user = mock<SpaceUserExtended>({
            ...SpaceUser.fromPartial({ uuid: "npc:bob", spaceUserId: "bob", name: "NPC · Bob" }),
            pictureStore: readable("https://example.test/bob.png"),
            reactiveUser: {
                uuid: readable("npc:bob"),
                microphoneState: readable(false),
                megaphoneState: readable(false),
            },
            space: mock({ getName: () => "bubble" }),
        });
        const box = VideoBox.fromRemoteSpaceUser(user, false, false);
        const target = document.createElement("div");
        document.body.appendChild(target);
        const component = mount(VideoMediaBox, { target, props: { videoBox: box } });
        try {
            flushSync();
            expect(target.textContent).toContain("NPC · Bob");
            expect(target.querySelector("img")?.getAttribute("src")).toBe("https://example.test/bob.png");
            expect(target.querySelector("video")).toBeNull();
            expect(target.querySelector(".connecting-spinner")).toBeNull();
            await vi.advanceTimersByTimeAsync(30_000);
            flushSync();
            expect(target.textContent).toContain("NPC · Bob");
            expect(target.textContent).not.toContain("Reconnecting");
            expect(target.querySelector("img")?.getAttribute("src")).toBe("https://example.test/bob.png");
        } finally {
            await unmount(component);
            box.destroy();
            target.remove();
        }
    });
});
