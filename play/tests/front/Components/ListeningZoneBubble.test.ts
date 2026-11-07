import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readable, writable } from "svelte/store";

const available = writable(false);
const startHomeJam = vi.fn();
vi.mock("../../../src/front/ListeningZone/ListeningZoneController", () => ({
    allJamRoomsStore: readable([]),
    canOpenJamStore: readable(true),
    ownJamRoomStore: readable(undefined),
    shareJam: vi.fn(),
    startHomeJam,
}));
vi.mock("../../../src/front/ListeningZone/ListeningZoneStore", () => ({
    currentListeningZoneStore: readable({ areaId: "a", propertyId: "p", areaName: "Lounge" }),
}));
vi.mock("../../../src/front/Spotify/ListeningFollower", () => ({ listenAlongAvailableStore: available }));
vi.mock("../../../src/front/Spotify/SpotifyAccount", () => ({ spotifyAccount: { linked: readable(false) } }));
vi.mock("../../../src/front/Spotify/LocalSpotifyPlayer", () => ({ desktopSpotifyPlayer: () => undefined }));
vi.mock("../../../src/front/Stores/MenuStore", () => ({
    handleOpenMenuEvent: vi.fn(),
    settingsSubMenuTargetStore: writable(undefined),
    SubMenusInterface: { settings: "settings" },
}));
vi.mock("../../../src/front/Components/ListeningZone/JamRoomsList.svelte", () => ({ default: vi.fn() }));
vi.mock("../../../src/i18n/i18n-svelte", () => ({
    LL: readable({
        spotify: {
            listeningZone: Object.fromEntries(
                [
                    "defaultName",
                    "rooms",
                    "noJam",
                    "titlePlaceholder",
                    "chooseKind",
                    "kindSpotifyTitle",
                    "kindSpotifyDescription",
                    "kindHomeTitle",
                    "kindHomeDescription",
                    "cancel",
                    "createRoom",
                    "linkInvite",
                    "sharePlaceholder",
                    "submit",
                ].map((key) => [key, () => key]),
            ),
        },
    }),
}));
const { default: ListeningZoneBubble } =
    await import("../../../src/front/Components/ListeningZone/ListeningZoneBubble.svelte");

describe("Jukebox creation", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;
    beforeEach(() => {
        available.set(false);
        startHomeJam.mockClear();
        target = document.createElement("div");
        document.body.appendChild(target);
    });
    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target.remove();
    });
    function createRoom(): void {
        component = mount(ListeningZoneBubble, { target });
        flushSync();
        target.querySelector<HTMLButtonElement>('[data-testid="listening-zone-create"]')?.click();
        flushSync();
    }
    function homeButton(): HTMLButtonElement | null {
        return target.querySelector('[data-testid="listening-zone-create-home"]');
    }
    it("keeps Jukebox visible while detection is pending and enables it without reopening", () => {
        createRoom();
        expect(homeButton()).not.toBeNull();
        expect(homeButton()?.disabled).toBe(true);
        available.set(true);
        flushSync();
        expect(homeButton()?.disabled).toBe(false);
        homeButton()?.click();
        expect(startHomeJam).toHaveBeenCalledWith("");
    });
    it("prevents creating a Jukebox when the extension disconnects while the menu is open", () => {
        available.set(true);
        createRoom();
        available.set(false);
        flushSync();
        expect(homeButton()?.disabled).toBe(true);
        homeButton()?.click();
        expect(startHomeJam).not.toHaveBeenCalled();
    });
});
