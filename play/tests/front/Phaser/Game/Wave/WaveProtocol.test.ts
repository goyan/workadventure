import { describe, expect, it } from "vitest";
import { decodeWave, encodeWave, WAVE_EVENT_NAME } from "../../../../../src/front/Phaser/Game/Wave/WaveProtocol";

describe("WaveProtocol", () => {
    it("round-trips a wave", () => {
        const { name, data } = encodeWave({ targetUuid: "b", at: 12 });
        expect(name).toBe(WAVE_EVENT_NAME);
        expect(decodeWave(name, data)).toEqual({ targetUuid: "b", at: 12 });
    });

    it("ignores extra fields", () => {
        expect(decodeWave(WAVE_EVENT_NAME, { targetUuid: "b", at: 1, foo: true })).toEqual({ targetUuid: "b", at: 1 });
    });

    it("rejects a foreign event name", () => {
        expect(decodeWave("infogene.knock.request", { targetUuid: "b", at: 1 })).toBeUndefined();
    });

    it("rejects a missing or empty targetUuid", () => {
        expect(decodeWave(WAVE_EVENT_NAME, { at: 1 })).toBeUndefined();
        expect(decodeWave(WAVE_EVENT_NAME, { targetUuid: "", at: 1 })).toBeUndefined();
    });

    it("rejects a non-finite or missing at", () => {
        expect(decodeWave(WAVE_EVENT_NAME, { targetUuid: "b", at: Infinity })).toBeUndefined();
        expect(decodeWave(WAVE_EVENT_NAME, { targetUuid: "b", at: NaN })).toBeUndefined();
        expect(decodeWave(WAVE_EVENT_NAME, { targetUuid: "b" })).toBeUndefined();
    });

    it("rejects non-object data", () => {
        expect(decodeWave(WAVE_EVENT_NAME, null)).toBeUndefined();
        expect(decodeWave(WAVE_EVENT_NAME, "x")).toBeUndefined();
    });
});
