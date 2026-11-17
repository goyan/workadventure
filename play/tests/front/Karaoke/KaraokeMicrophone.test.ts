import { describe, expect, it, vi } from "vitest";
import { openKaraokeMicrophone } from "../../../src/front/Karaoke/KaraokeMicrophone";

const stream = {} as MediaStream;
const voice = { echoCancellation: true, noiseSuppression: false, autoGainControl: false };

describe("openKaraokeMicrophone", () => {
    it("opens exactly the microphone chosen in WorkAdventure, not the system default", async () => {
        const getUserMedia = vi.fn().mockResolvedValue(stream);
        expect(await openKaraokeMicrophone(getUserMedia, "built-in")).toBe(stream);
        expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
            audio: { ...voice, deviceId: { exact: "built-in" } },
            video: false,
        });
    });
    it.each(["OverconstrainedError", "NotFoundError"])("falls back to the default input on %s", async (name) => {
        const getUserMedia = vi
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error("gone"), { name }))
            .mockResolvedValue(stream);
        expect(await openKaraokeMicrophone(getUserMedia, "unplugged-headset")).toBe(stream);
        expect(getUserMedia).toHaveBeenLastCalledWith({ audio: voice, video: false });
    });
    it("does not hide a refused permission behind another microphone", async () => {
        const refused = Object.assign(new Error("denied"), { name: "NotAllowedError" });
        const getUserMedia = vi.fn().mockRejectedValue(refused);
        await expect(openKaraokeMicrophone(getUserMedia, "built-in")).rejects.toBe(refused);
        expect(getUserMedia).toHaveBeenCalledOnce();
    });
    it("uses the default input when no microphone was chosen", async () => {
        const getUserMedia = vi.fn().mockResolvedValue(stream);
        await openKaraokeMicrophone(getUserMedia);
        expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: voice, video: false });
    });
});
