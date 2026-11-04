import { get, writable } from "svelte/store";
import { AvailabilityStatus, type SpotifyListening } from "@workadventure/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopStatusRequest, WorkAdventureDesktopApi } from "../../Interfaces/DesktopAppInterfaces";

const availabilityStatusStore = writable(AvailabilityStatus.ONLINE);
const resetAllStatusStoreExcept = vi.fn();

vi.mock("../../Stores/MediaStore", () => ({
    availabilityStatusStore,
    requestedCameraState: writable(false),
    requestedMicrophoneState: writable(false),
    silentStore: writable(false),
}));
vi.mock("../../Rules/StatusRules/statusChangerFunctions", () => ({ resetAllStatusStoreExcept }));
vi.mock("../../Utils/AvailabilityStatus", () => ({
    getStatusLabel: (status: AvailabilityStatus) => `label of ${AvailabilityStatus[status]}`,
}));

const { desktopApi } = await import("./index");
const { listenAlongAvailableStore } = await import("../../Spotify/ListeningFollower");

function installDesktopApp(extra: Partial<WorkAdventureDesktopApi>): void {
    window.WAD = {
        desktop: true,
        onMuteToggle: vi.fn(),
        onCameraToggle: vi.fn(),
        ...extra,
    } as unknown as WorkAdventureDesktopApi;
}

describe("DesktopApi status", () => {
    afterEach(() => {
        delete window.WAD;
        resetAllStatusStoreExcept.mockClear();
        availabilityStatusStore.set(AvailabilityStatus.ONLINE);
    });

    it("applies the statuses a desktop app requests, like the status menu does", () => {
        let request: ((status: DesktopStatusRequest) => void) | undefined;
        installDesktopApp({ onStatusRequest: (callback) => (request = callback) });

        desktopApi.init();
        request?.("busy");
        request?.("online");

        expect(resetAllStatusStoreExcept.mock.calls).toEqual([[AvailabilityStatus.BUSY], [null]]);
    });

    it("ignores a status that is not one of the requestable ones", () => {
        let request: ((status: DesktopStatusRequest) => void) | undefined;
        installDesktopApp({ onStatusRequest: (callback) => (request = callback) });

        desktopApi.init();
        request?.("toString" as DesktopStatusRequest);

        expect(resetAllStatusStoreExcept).not.toHaveBeenCalled();
    });

    it("reports the effective status with its label, now and on every change", () => {
        const reportStatus = vi.fn();
        installDesktopApp({ reportStatus });

        desktopApi.init();
        availabilityStatusStore.set(AvailabilityStatus.JITSI);

        expect(reportStatus.mock.calls).toEqual([
            ["ONLINE", "label of ONLINE"],
            ["JITSI", "label of JITSI"],
        ]);
    });

    it("works with a desktop app that provides neither status member", () => {
        installDesktopApp({});

        expect(() => desktopApi.init()).not.toThrow();
    });
});

describe("DesktopApi listening", () => {
    const listening: SpotifyListening = {
        trackTitle: "Song",
        artistName: "Artist",
        trackUrl: "https://open.spotify.com/track/abc",
        jamAreaId: "",
        jamAreaName: "",
        albumName: "Album",
        artworkUrl: "https://i.scdn.co/image/abc",
        source: "",
        positionMs: 0,
        positionAt: 0,
        contextUri: "",
        contextName: "",
        jamHostUuid: "",
        listeningAlongUuid: "",
    };

    afterEach(() => {
        delete window.WAD;
    });

    it("reports the shared track and the joined Jam to the desktop app", () => {
        const reportListening = vi.fn();
        installDesktopApp({ reportListening });

        desktopApi.reportListening({ ...listening, jamAreaId: "lounge", jamAreaName: "Lounge" });

        expect(reportListening).toHaveBeenCalledWith({
            title: "Song",
            artist: "Artist",
            album: "Album",
            url: "https://open.spotify.com/track/abc",
            artworkUrl: "https://i.scdn.co/image/abc",
            source: "spotify",
            jamAreaName: "Lounge",
        });
    });

    it("reports no source when nothing plays", () => {
        const reportListening = vi.fn();
        installDesktopApp({ reportListening });

        desktopApi.reportListening({ ...listening, trackTitle: "", artistName: "", trackUrl: "" });

        expect(reportListening).toHaveBeenCalledWith(expect.objectContaining({ title: "", source: "" }));
    });

    it("does nothing in a browser or an older desktop app", () => {
        expect(() => desktopApi.reportListening(listening)).not.toThrow();
        installDesktopApp({});
        expect(() => desktopApi.reportListening(listening)).not.toThrow();
    });
});

describe("DesktopApi listening along", () => {
    afterEach(() => {
        delete window.WAD;
        listenAlongAvailableStore.set(false);
    });

    it("offers listening along only while the desktop app reports the Spicetify extension connected", () => {
        let report: ((available: boolean) => void) | undefined;
        installDesktopApp({ onListenAlongAvailable: (callback) => (report = callback) });

        desktopApi.init();
        expect(get(listenAlongAvailableStore)).toBe(false);
        report?.(true);
        expect(get(listenAlongAvailableStore)).toBe(true);
        report?.(false);
        expect(get(listenAlongAvailableStore)).toBe(false);
    });
});
