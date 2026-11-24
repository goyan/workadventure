import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
    createJamMusicCapture,
    REOPEN_DELAY_MS,
    SILENCE_CHECK_INTERVAL_MS,
    SILENCE_LIMIT_MS,
    type JamMusicCapture,
} from "../../../src/front/ListeningZone/JamMusicCapture";
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

    describe("when the connection of the Jam space is replaced", () => {
        // The server restarts: the space reconnects with a new LiveKit connection, which registers a new publisher.
        let announce: (spaceName: string, next: JamMusicPublisher) => void;
        let unwatch: Mock<() => void>;

        beforeEach(() => {
            const watchers = new Set<{ spaceName: string; callback: (next: JamMusicPublisher) => void }>();
            unwatch = vi.fn();
            announce = (spaceName, next) => {
                for (const watcher of [...watchers]) {
                    if (watcher.spaceName === spaceName) watcher.callback(next);
                }
            };
            capture = createJamMusicCapture({
                getUserMedia,
                getPublisher: (name) => (name === SPACE ? publisher : undefined),
                onPublisherRegistered: (spaceName, callback) => {
                    const watcher = { spaceName, callback };
                    watchers.add(watcher);
                    return () => {
                        unwatch();
                        watchers.delete(watcher);
                    };
                },
            });
        });

        it("hands the running music to the new publisher", async () => {
            const stream = fakeStream();
            getUserMedia.mockResolvedValue(stream);
            await capture.start(SPACE, "blackhole-id");
            const replacement = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };

            announce(SPACE, replacement);

            expect(replacement.publishJamMusic).toHaveBeenCalledWith(stream);
            expect(get(capture.state)).toEqual({ status: "active", label: "BlackHole 2ch" });
        });

        it("stops publishing through the new publisher, not the old one, afterwards", async () => {
            await capture.start(SPACE, "blackhole-id");
            const replacement = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };
            announce(SPACE, replacement);

            await capture.stop();

            expect(replacement.publishJamMusic).toHaveBeenLastCalledWith(undefined);
            expect(publisher.publishJamMusic).toHaveBeenCalledTimes(1);
        });

        it("ignores the publisher of another space", async () => {
            await capture.start(SPACE, "blackhole-id");
            const other = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };

            announce("world.another-space", other);

            expect(other.publishJamMusic).not.toHaveBeenCalled();
        });

        it("stops watching once the music is stopped", async () => {
            await capture.start(SPACE, "blackhole-id");
            await capture.stop();
            expect(unwatch).toHaveBeenCalledTimes(1);
        });

        it("tells when the new publisher cannot carry the music", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            await capture.start(SPACE, "blackhole-id");
            const broken = { publishJamMusic: vi.fn().mockRejectedValue(new Error("room closed")) };

            announce(SPACE, broken);
            await vi.waitFor(() => expect(get(capture.state)).toEqual({ status: "error", reason: "unavailable" }));
        });
    });

    describe("the music being shared", () => {
        it("offers the stream that is shared, with the space of its Jam, once the music is out", async () => {
            const stream = fakeStream();
            getUserMedia.mockResolvedValue(stream);
            expect(get(capture.sharedMusic)).toBeUndefined();

            await capture.start(SPACE, "blackhole-id");

            expect(get(capture.sharedMusic)).toEqual({ spaceName: SPACE, stream });
        });

        it("takes it back when the music stops", async () => {
            await capture.start(SPACE, "blackhole-id");
            await capture.stop();
            expect(get(capture.sharedMusic)).toBeUndefined();
        });

        it("never offers a stream that could not be shared", async () => {
            getUserMedia.mockRejectedValue(domError("NotAllowedError"));
            await capture.start(SPACE, "blackhole-id");
            expect(get(capture.sharedMusic)).toBeUndefined();
        });

        it("never offers the stream of a microphone that was refused", async () => {
            await capture.start(SPACE, "mic-id", { forbiddenDeviceIds: ["mic-id"] });
            expect(get(capture.sharedMusic)).toBeUndefined();
        });
    });

    describe("when the source goes away or goes quiet", () => {
        let deviceChange: () => void;
        let silentNow: boolean;
        let meterDestroy: Mock<() => void>;
        let streams: ReturnType<typeof fakeStream>[];

        beforeEach(() => {
            vi.useFakeTimers();
            deviceChange = () => undefined;
            silentNow = false;
            meterDestroy = vi.fn();
            streams = [];
            getUserMedia.mockImplementation(() => {
                const stream = fakeStream();
                streams.push(stream);
                return Promise.resolve(stream);
            });
            capture = createJamMusicCapture({
                getUserMedia,
                getPublisher: (name) => (name === SPACE ? publisher : undefined),
                onDeviceChange: (callback) => {
                    deviceChange = callback;
                    return () => undefined;
                },
                createSilenceMeter: () => ({ isSilent: () => silentNow, destroy: meterDestroy }),
            });
        });

        afterEach(async () => {
            await capture.stop();
            vi.useRealTimers();
        });

        it("reopens the same input once it is back and replaces the track, without stopping the Jam", async () => {
            await capture.start(SPACE, "blackhole-id");
            // The input is gone: the first attempt fails, the device coming back gets one more.
            getUserMedia.mockRejectedValueOnce(domError("NotFoundError"));
            streams[0].track.dispatchEvent(new Event("ended"));
            await vi.advanceTimersByTimeAsync(REOPEN_DELAY_MS);
            expect(get(capture.state)).toMatchObject({ status: "active" });

            deviceChange();
            await vi.advanceTimersByTimeAsync(REOPEN_DELAY_MS);

            expect(getUserMedia).toHaveBeenLastCalledWith(
                expect.objectContaining({ audio: expect.objectContaining({ deviceId: { exact: "blackhole-id" } }) }),
            );
            expect(publisher.publishJamMusic).toHaveBeenLastCalledWith(streams[1]);
            expect(publisher.publishJamMusic).not.toHaveBeenCalledWith(undefined);
            expect(get(capture.sharedMusic)).toEqual({ spaceName: SPACE, stream: streams[1] });
            expect(get(capture.state)).toMatchObject({ status: "active" });
            expect(get(capture.silent)).toBe(false);
        });

        it("tries once per device change, not in a loop", async () => {
            await capture.start(SPACE, "blackhole-id");
            getUserMedia.mockRejectedValue(domError("NotFoundError"));
            streams[0].track.dispatchEvent(new Event("ended"));
            await vi.advanceTimersByTimeAsync(REOPEN_DELAY_MS * 10);
            expect(getUserMedia).toHaveBeenCalledTimes(2);

            deviceChange();
            await vi.advanceTimersByTimeAsync(REOPEN_DELAY_MS * 10);
            expect(getUserMedia).toHaveBeenCalledTimes(3);
            expect(get(capture.silent)).toBe(true);
        });

        it("keeps a single live track and a single publication after two reopenings", async () => {
            await capture.start(SPACE, "blackhole-id");
            streams[0].track.dispatchEvent(new Event("ended"));
            await vi.advanceTimersByTimeAsync(REOPEN_DELAY_MS);
            streams[1].track.dispatchEvent(new Event("ended"));
            await vi.advanceTimersByTimeAsync(REOPEN_DELAY_MS);

            expect(streams).toHaveLength(3);
            expect(streams[0].track.stop).toHaveBeenCalled();
            expect(streams[1].track.stop).toHaveBeenCalled();
            expect(streams[2].track.stop).not.toHaveBeenCalled();
            expect(publisher.publishJamMusic.mock.calls.map(([stream]) => stream)).toEqual([
                streams[0],
                streams[1],
                streams[2],
            ]);
        });

        it("reopens the input once after a long dead silence, then warns if it stays silent", async () => {
            await capture.start(SPACE, "blackhole-id");
            silentNow = true;

            await vi.advanceTimersByTimeAsync(SILENCE_LIMIT_MS - SILENCE_CHECK_INTERVAL_MS);
            expect(streams).toHaveLength(1);
            expect(get(capture.silent)).toBe(false);

            await vi.advanceTimersByTimeAsync(SILENCE_CHECK_INTERVAL_MS);
            expect(streams).toHaveLength(2);
            expect(streams[0].track.stop).toHaveBeenCalled();
            expect(get(capture.silent)).toBe(false);

            await vi.advanceTimersByTimeAsync(SILENCE_LIMIT_MS * 3);
            expect(streams).toHaveLength(2);
            expect(get(capture.silent)).toBe(true);

            silentNow = false;
            await vi.advanceTimersByTimeAsync(SILENCE_CHECK_INTERVAL_MS);
            expect(get(capture.silent)).toBe(false);
        });

        it("does not touch the input while the music is only quiet", async () => {
            await capture.start(SPACE, "blackhole-id");
            await vi.advanceTimersByTimeAsync(SILENCE_LIMIT_MS * 3);
            expect(streams).toHaveLength(1);
            expect(get(capture.silent)).toBe(false);
        });

        it("lets go of the meters and the timers when it stops", async () => {
            await capture.start(SPACE, "blackhole-id");
            silentNow = true;
            await vi.advanceTimersByTimeAsync(SILENCE_LIMIT_MS);
            expect(meterDestroy).toHaveBeenCalledTimes(1);

            await capture.stop();
            expect(meterDestroy).toHaveBeenCalledTimes(2);
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(SILENCE_LIMIT_MS * 3);
            expect(streams).toHaveLength(2);
        });
    });
});
