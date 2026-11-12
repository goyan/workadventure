import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";

describe("saved camera zoom", () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it("has no saved zoom by default, then reads back the zoom saved last", () => {
        expect(localUserStore.getCameraZoomModifier()).toBeUndefined();
        localUserStore.setCameraZoomModifier(1.25);
        localUserStore.setCameraZoomModifier(0.6);
        expect(localUserStore.getCameraZoomModifier()).toBe(0.6);
    });

    it("ignores a corrupted saved zoom and never saves an invalid one", () => {
        localStorage.setItem("cameraZoomModifier", "not a number");
        expect(localUserStore.getCameraZoomModifier()).toBeUndefined();

        localUserStore.setCameraZoomModifier(1.5);
        localUserStore.setCameraZoomModifier(Number.NaN);
        expect(localUserStore.getCameraZoomModifier()).toBe(1.5);
    });

    it("keeps working when the browser refuses the storage (private mode, quota)", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        expect(() => localUserStore.setCameraZoomModifier(1.5)).not.toThrow();
        expect(localUserStore.getCameraZoomModifier()).toBeUndefined();
    });
});
