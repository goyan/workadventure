import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

type TestRoom = { cameraBackgrounds?: { url: string; thumbnailUrl: string }[] } | undefined;

// Only the camera backgrounds of the room matter here: the test sets the room through this setter.
const room = vi.hoisted(() => ({ set: undefined as ((value: TestRoom) => void) | undefined }));
vi.mock("@wa/front/Administration/AnalyticsClient", () => ({ analyticsClient: { trackAdminEvent: vi.fn() } }));
vi.mock("@wa/front/Stores/CurrentRoomStore", async () => {
    const { writable } = await import("svelte/store");
    const store = writable<TestRoom>(undefined);
    room.set = store.set;
    return { currentRoomStore: store };
});

describe("camera background kept across reloads", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it("turns a background that failed to apply off for this page only, keeping the choice for the next load", async () => {
        localStorage.setItem("backgroundMode", "blur");
        const { backgroundConfigStore } = await import("@wa/front/Stores/BackgroundTransformStore");
        expect(get(backgroundConfigStore).mode).toBe("blur");

        backgroundConfigStore.disableForSession();

        expect(get(backgroundConfigStore).mode).toBe("none");
        expect(localStorage.getItem("backgroundMode")).toBe("blur");
    });

    it("still forgets the background when the user chooses none", async () => {
        localStorage.setItem("backgroundMode", "blur");
        const { backgroundConfigStore } = await import("@wa/front/Stores/BackgroundTransformStore");

        backgroundConfigStore.reset();

        expect(localStorage.getItem("backgroundMode")).toBe("none");
    });

    it("keeps the saved image when the world does not offer it on this load", async () => {
        localStorage.setItem("backgroundMode", "image");
        localStorage.setItem("backgroundImage", "./static/images/background/office.jpg");
        const { backgroundConfigStore } = await import("@wa/front/Stores/BackgroundTransformStore");
        room.set?.({ cameraBackgrounds: [{ url: "https://example.test/other.jpg", thumbnailUrl: "" }] });

        expect(get(backgroundConfigStore).mode).toBe("none");
        expect(localStorage.getItem("backgroundMode")).toBe("image");
        expect(localStorage.getItem("backgroundImage")).toBe("./static/images/background/office.jpg");
    });
});
