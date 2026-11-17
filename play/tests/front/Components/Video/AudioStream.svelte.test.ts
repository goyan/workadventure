import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable, writable } from "svelte/store";
import { enterKaraokeGame } from "../../../../src/front/Karaoke/KaraokeGameStore";
import AudioStream from "../../../../src/front/Components/Video/PictureInPicture/AudioStream.svelte";

function deferred() {
    let resolve: () => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("AudioStream", () => {
    const stream = {} as MediaStream;
    let setSinkId: ReturnType<typeof vi.fn>;
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        setSinkId = vi.fn();
        Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { value: setSinkId, configurable: true });
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        target = document.createElement("div");
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) {
            await unmount(mounted);
        }
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function render(props: { outputDeviceId?: string }, onselectoutputaudiodeviceerror?: () => void) {
        component = mount(AudioStream, {
            target,
            props: {
                streamStore: readable<MediaStream | undefined>(stream),
                isBlocked: readable(false),
                volume: readable(1),
                get outputDeviceId() {
                    return props.outputDeviceId;
                },
                onselectoutputaudiodeviceerror,
            },
        });
        flushSync();
        return target.querySelector("audio") as HTMLAudioElement;
    }

    it("silences conversations during Game and restores the latest volume afterward", () => {
        const volume = writable(0.7);
        component = mount(AudioStream, {
            target,
            props: { streamStore: readable<MediaStream | undefined>(stream), isBlocked: readable(false), volume },
        });
        flushSync();
        const audio = target.querySelector("audio");
        const leave = enterKaraokeGame();
        try {
            flushSync();
            expect(audio?.volume).toBe(0);
            volume.set(0.4);
            flushSync();
            expect(audio?.volume).toBe(0);
            expect(get(volume)).toBe(0.4);
        } finally {
            leave();
        }
        flushSync();
        expect(audio?.volume).toBe(0.4);
    });

    it("keeps the singer and backing music audible during Game", () => {
        const leave = enterKaraokeGame();
        try {
            component = mount(AudioStream, {
                target,
                props: {
                    conversation: false,
                    streamStore: readable<MediaStream | undefined>(stream),
                    isBlocked: readable(false),
                    volume: readable(0.6),
                },
            });
            flushSync();
            expect(target.querySelector("audio")?.volume).toBe(0.6);
        } finally {
            leave();
        }
    });

    // Chrome keeps playing on the default output when srcObject is assigned before setSinkId() resolves.
    it("attaches the stream only once the output device is applied", async () => {
        const sink = deferred();
        setSinkId.mockReturnValue(sink.promise);
        const audio = render({ outputDeviceId: "headset" });

        await vi.advanceTimersByTimeAsync(0);
        expect(setSinkId).toHaveBeenCalledWith("headset");
        expect(audio.srcObject).toBeFalsy();

        sink.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(audio.srcObject).toBe(stream);
    });

    it("starts on the current output when setSinkId() hangs, then follows the sink", async () => {
        const sink = deferred();
        setSinkId.mockReturnValue(sink.promise);
        const audio = render({ outputDeviceId: "headset" });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(audio.srcObject).toBe(stream);

        const assignments: unknown[] = [];
        let current: unknown = stream;
        Object.defineProperty(audio, "srcObject", {
            set: (value: unknown) => {
                current = value;
                assignments.push(value);
            },
            get: () => current,
            configurable: true,
        });
        sink.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(assignments).toEqual([null, stream]);
    });

    it("does not reset to the default output when a newer device choice took over", async () => {
        const first = deferred();
        setSinkId.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const props = $state<{ outputDeviceId?: string }>({ outputDeviceId: "headset-a" });
        render(props);

        props.outputDeviceId = "headset-b";
        flushSync();
        await vi.advanceTimersByTimeAsync(0);

        first.reject(new DOMException("aborted", "AbortError"));
        await vi.advanceTimersByTimeAsync(0);

        expect(setSinkId.mock.calls.map((call) => call[0])).toEqual(["headset-a", "headset-b"]);
    });

    // The parent then selects another device; the element itself already plays on the system default
    it("reports a device it could not switch to, once", async () => {
        setSinkId.mockRejectedValueOnce(new DOMException("aborted", "AbortError")).mockResolvedValue(undefined);
        const onError = vi.fn();
        const audio = render({ outputDeviceId: "headset" }, onError);
        await vi.advanceTimersByTimeAsync(0);

        expect(setSinkId.mock.calls.map((call) => call[0])).toEqual(["headset", ""]);
        expect(onError).toHaveBeenCalledOnce();
        expect(audio.srcObject).toBe(stream);
    });
});
