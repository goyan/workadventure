import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DebouncedZoomSaver,
    ZOOM_SAVE_DELAY_MS,
    parseStoredZoomModifier,
    serializeZoomModifier,
} from "../../../../src/front/Phaser/Game/ZoomPersistence";

describe("parseStoredZoomModifier", () => {
    it("reads a zoom modifier saved earlier", () => {
        expect(parseStoredZoomModifier("1.5")).toBe(1.5);
        expect(parseStoredZoomModifier("0.42")).toBe(0.42);
        expect(parseStoredZoomModifier(serializeZoomModifier(0.875))).toBe(0.875);
    });

    it("keeps the current behaviour (no saved zoom) for a missing or corrupted value", () => {
        for (const raw of [null, undefined, "", "  ", "abc", "1.5x", "NaN", "Infinity", "-Infinity", "{}", "[1]"]) {
            expect(parseStoredZoomModifier(raw), String(raw)).toBeUndefined();
        }
    });

    it("rejects zoom modifiers no user could have reached", () => {
        for (const raw of ["0", "-1", "0.001", "1000", "1e9"]) {
            expect(parseStoredZoomModifier(raw), raw).toBeUndefined();
        }
    });
});

describe("serializeZoomModifier", () => {
    it("writes nothing for a value that could not be read back", () => {
        expect(serializeZoomModifier(Number.NaN)).toBeUndefined();
        expect(serializeZoomModifier(Number.POSITIVE_INFINITY)).toBeUndefined();
        expect(serializeZoomModifier(0)).toBeUndefined();
        expect(serializeZoomModifier(-2)).toBeUndefined();
    });
});

describe("DebouncedZoomSaver", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("writes only the last zoom, once the zoom has settled", () => {
        const write = vi.fn();
        const saver = new DebouncedZoomSaver(write);

        // A wheel gesture or a zoom tween changes the zoom on every frame.
        saver.schedule(1.1);
        vi.advanceTimersByTime(100);
        saver.schedule(1.2);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS - 1);
        saver.schedule(1.3);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS - 1);
        expect(write).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith(1.3);
    });

    it("writes the pending zoom at once when flushed (page reload, scene change), and only once", () => {
        const write = vi.fn();
        const saver = new DebouncedZoomSaver(write);

        saver.flush();
        expect(write).not.toHaveBeenCalled();

        saver.schedule(0.8);
        saver.flush();
        expect(write).toHaveBeenCalledWith(0.8);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it("drops the pending zoom when cancelled", () => {
        const write = vi.fn();
        const saver = new DebouncedZoomSaver(write);

        saver.schedule(2);
        saver.cancel();
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        saver.flush();
        expect(write).not.toHaveBeenCalled();
    });
});
