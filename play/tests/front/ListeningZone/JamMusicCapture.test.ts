import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createJamMusicCapture, type JamMusicCapture } from "../../../src/front/ListeningZone/JamMusicCapture";
import type { JamMusicPublisher } from "../../../src/front/ListeningZone/JamMusicStore";

const SPACE = "world.jam-space";

function fakeTrack() {
    const target = new EventTarget();
    return Object.assign(target, { stop: vi.fn(), label: "BlackHole 2ch", kind: "audio" });
}

function fakeStream(track = fakeTrack()) {
    return { track, getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream & {
        track: ReturnType<typeof fakeTrack>;
    };
}

function domError(name: string) {
    return Object.assign(new Error(name), { name });
}

describe("JamMusicCapture", () => {
    let publisher: JamMusicPublisher & { publishJamMusic: ReturnType<typeof vi.fn> };
    let getUserMedia: Mock<(constraints: MediaStreamConstraints) => Promise<MediaStream>>;
    let capture: JamMusicCapture;

    beforeEach(() => {
        publisher = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };
        getUserMedia = vi
            .fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>()
            .mockResolvedValue(fakeStream());
        capture = createJamMusicCapture({
            getUserMedia,
            getPublisher: (name) => (name === SPACE ? publisher : undefined),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("asks for the chosen input without any voice processing, in stereo", async () => {
        await capture.start(SPACE, "blackhole-id");

        expect(getUserMedia).toHaveBeenCalledWith({
            audio: {
                deviceId: { exact: "blackhole-id" },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2,
            },
        });
    });

    it("is active only once the music is handed to the publisher", async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);

        const starting = capture.start(SPACE, "blackhole-id");
        expect(get(capture.state)).toEqual({ status: "requesting" });
        await starting;

        expect(publisher.publishJamMusic).toHaveBeenCalledWith(stream);
        expect(get(capture.state)).toEqual({ status: "active", label: "BlackHole 2ch" });
    });

    it("stops publishing and releases the input when asked to stop", async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);
        await capture.start(SPACE, "blackhole-id");

        await capture.stop();

        expect(publisher.publishJamMusic).toHaveBeenLastCalledWith(undefined);
        expect(stream.track.stop).toHaveBeenCalled();
        expect(get(capture.state)).toEqual({ status: "idle" });
    });

    it.each([
        ["NotAllowedError", "denied"],
        ["NotFoundError", "not-found"],
        ["OverconstrainedError", "not-found"],
        ["NotReadableError", "unavailable"],
    ])("reports %s as %s and publishes nothing", async (name, reason) => {
        getUserMedia.mockRejectedValue(domError(name));

        await capture.start(SPACE, "blackhole-id");

        expect(get(capture.state)).toEqual({ status: "error", reason });
        expect(publisher.publishJamMusic).not.toHaveBeenCalled();
    });

    it("refuses an input the user also speaks into", async () => {
        await capture.start(SPACE, "mic-id", { forbiddenDeviceIds: ["mic-id"] });

        expect(getUserMedia).not.toHaveBeenCalled();
        expect(get(capture.state)).toEqual({ status: "error", reason: "microphone" });
    });

    it("refuses to start without a session for the Jam, and releases what it opened", async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);

        await capture.start("world.another-space", "blackhole-id");

        expect(stream.track.stop).toHaveBeenCalled();
        expect(get(capture.state)).toEqual({ status: "error", reason: "no-session" });
    });

    it("stops by itself when the source ends, leaving the other flows alone", async () => {
        const stream = fakeStream();
        getUserMedia.mockResolvedValue(stream);
        await capture.start(SPACE, "blackhole-id");

        stream.track.dispatchEvent(new Event("ended"));
        await vi.waitFor(() => expect(get(capture.state)).toEqual({ status: "error", reason: "ended" }));

        expect(publisher.publishJamMusic).toHaveBeenLastCalledWith(undefined);
    });

    it("does not resurrect a capture that was stopped while the browser was still asking", async () => {
        const stream = fakeStream();
        let resolveMedia: (stream: MediaStream) => void = () => {};
        getUserMedia.mockReturnValue(
            new Promise<MediaStream>((resolve) => {
                resolveMedia = resolve;
            }),
        );

        const starting = capture.start(SPACE, "blackhole-id");
        await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
        await capture.stop();
        resolveMedia(stream);
        await starting;

        expect(stream.track.stop).toHaveBeenCalled();
        expect(publisher.publishJamMusic).not.toHaveBeenCalledWith(stream);
        expect(get(capture.state)).toEqual({ status: "idle" });
    });

    it("opens nothing when it is stopped before the input was asked for", async () => {
        const starting = capture.start(SPACE, "blackhole-id");
        await capture.stop();
        await starting;

        expect(getUserMedia).not.toHaveBeenCalled();
        expect(get(capture.state)).toEqual({ status: "idle" });
    });

    it("replaces a running capture with the new one, and releases the old input", async () => {
        const first = fakeStream();
        const second = fakeStream();
        getUserMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

        await capture.start(SPACE, "one");
        await capture.start(SPACE, "two");

        expect(first.track.stop).toHaveBeenCalled();
        expect(publisher.publishJamMusic).toHaveBeenLastCalledWith(second);
        expect(second.track.stop).not.toHaveBeenCalled();
    });
});
