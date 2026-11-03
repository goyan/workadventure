import { writable } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
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
