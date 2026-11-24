import { type Readable, writable } from "svelte/store";
import { createStreamSilenceMeter, type SilenceMeter } from "./StreamSilenceMeter";
import { getJamMusicPublisher, onJamMusicPublisherRegistered, type JamMusicPublisher } from "./JamMusicStore";

export type JamMusicCaptureError =
    /** The browser or the user refused the input. */
    | "denied"
    /** The chosen input is not there (anymore). */
    | "not-found"
    /** The input exists but cannot be opened (used by another app, hardware error). */
    | "unavailable"
    /** The chosen input is the one the user speaks into: it would carry their voice, not music. */
    | "microphone"
    /** The space of the Jam has no LiveKit connection to share the music through. */
    | "no-session"
    /** The source went away while sharing (device unplugged, app closed). */
    | "ended";

export type JamMusicCaptureState =
    | { status: "idle" }
    | { status: "requesting" }
    | { status: "active"; label: string }
    | { status: "error"; reason: JamMusicCaptureError };

interface JamMusicCaptureDependencies {
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    getPublisher: (spaceName: string) => JamMusicPublisher | undefined;
    /** Tells when the space gets a new publisher (its connection was replaced); returns what stops watching. */
    onPublisherRegistered?: (spaceName: string, callback: (publisher: JamMusicPublisher) => void) => () => void;
    /** Tells when an audio device is plugged or removed; returns what stops watching. */
    onDeviceChange?: (callback: () => void) => () => void;
    /** Measures the silence of a stream; without it a silent input is never noticed. */
    createSilenceMeter?: (stream: MediaStream) => SilenceMeter;
}

/** How often the shared music is checked for silence. */
export const SILENCE_CHECK_INTERVAL_MS = 1000;
/** Dead silence lasting that long makes the capture reopen its input, and then warn the host. */
export const SILENCE_LIMIT_MS = 8000;
/** Lets a device that just came back finish appearing before it is opened. */
export const REOPEN_DELAY_MS = 500;

/** The music being shared, and the space of the Jam it goes to. */
export interface SharedJamMusic {
    spaceName: string;
    stream: MediaStream;
}

export interface JamMusicCapture {
    readonly state: Readable<JamMusicCaptureState>;
    /**
     * The stream that is being shared, for whatever needs to look at the music the host plays (the lamps): the host
     * does not receive their own stream back from the Jam.
     */
    readonly sharedMusic: Readable<SharedJamMusic | undefined>;
    /** True while the shared input delivers nothing (a reopening did not help) or is gone and not back yet. */
    readonly silent: Readable<boolean>;
    /** Opens the input and shares it as the music of the Jam whose space is named. Replaces a running capture. */
    start(spaceName: string, deviceId: string, options?: { forbiddenDeviceIds?: readonly string[] }): Promise<void>;
    /** Stops sharing the music and releases the input: the microphone and the screens are not touched. */
    stop(): Promise<void>;
}

function errorReason(error: unknown): JamMusicCaptureError {
    const name = error instanceof Error ? error.name : "";
    switch (name) {
        case "NotAllowedError":
        case "SecurityError":
            return "denied";
        case "NotFoundError":
        case "OverconstrainedError":
            return "not-found";
        default:
            return "unavailable";
    }
}

function musicConstraints(deviceId: string): MediaStreamConstraints {
    return {
        audio: {
            deviceId: { exact: deviceId },
            // Music, not a voice: the browser must not clean it up.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
        },
    };
}

type Flag = "reopening" | "waitingForDevice";

interface RunningCapture {
    spaceName: string;
    deviceId: string;
    stream: MediaStream;
    publisher: JamMusicPublisher;
    unwatch?: () => void;
    meter?: SilenceMeter;
    /** A reopening is under way: nothing else may start one. */
    reopening: boolean;
    /** The input is gone or could not be reopened: the next device change is worth one attempt. */
    waitingForDevice: boolean;
    silentTicks: number;
    /** The input was already reopened for the silence going on. */
    reopenedForSilence: boolean;
}

export function createJamMusicCapture({
    getUserMedia,
    getPublisher,
    onPublisherRegistered,
    onDeviceChange,
    createSilenceMeter,
}: JamMusicCaptureDependencies): JamMusicCapture {
    const state = writable<JamMusicCaptureState>({ status: "idle" });
    const sharedMusic = writable<SharedJamMusic | undefined>(undefined);
    const silent = writable(false);
    // Every start and stop takes a number: what comes back from a slower one is dropped, so an old capture never
    // comes back to life over a newer decision.
    let generation = 0;
    let current: RunningCapture | undefined;
    let silenceTimer: ReturnType<typeof setInterval> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let unwatchDevices: (() => void) | undefined;

    function stopTracks(stream: MediaStream): void {
        for (const track of stream.getTracks()) {
            track.stop();
        }
    }

    function stopWatching(): void {
        if (silenceTimer !== undefined) {
            clearInterval(silenceTimer);
            silenceTimer = undefined;
        }
        if (reopenTimer !== undefined) {
            clearTimeout(reopenTimer);
            reopenTimer = undefined;
        }
        unwatchDevices?.();
        unwatchDevices = undefined;
    }

    async function release(): Promise<void> {
        const running = current;
        current = undefined;
        stopWatching();
        sharedMusic.set(undefined);
        silent.set(false);
        if (!running) {
            return;
        }
        running.unwatch?.();
        running.meter?.destroy();
        stopTracks(running.stream);
        try {
            await running.publisher.publishJamMusic(undefined);
        } catch (error) {
            console.error("Could not stop publishing the Jam music", error);
        }
    }

    function fail(running: RunningCapture, reason: JamMusicCaptureError): void {
        if (current !== running) {
            return;
        }
        release()
            .then(() => state.set({ status: "error", reason }))
            .catch(console.error);
    }

    /** Watches the track of the stream being shared: when it ends, the input is reopened as soon as it is back. */
    function watch(running: RunningCapture): void {
        const stream = running.stream;
        running.meter?.destroy();
        running.meter = createSilenceMeter?.(stream);
        const [track] = stream.getAudioTracks();
        track.addEventListener(
            "ended",
            () => {
                if (current !== running || running.stream !== stream) {
                    return;
                }
                running.waitingForDevice = true;
                silent.set(true);
                scheduleReopen(running);
            },
            { once: true },
        );
    }

    function scheduleReopen(running: RunningCapture): void {
        if (reopenTimer !== undefined) {
            clearTimeout(reopenTimer);
        }
        reopenTimer = setTimeout(() => {
            reopenTimer = undefined;
            reopen(running).catch(console.error);
        }, REOPEN_DELAY_MS);
    }

    // Flags are set through here: they are read by timers, so a write after an await is intended.
    function mark(running: RunningCapture, flags: Partial<Pick<RunningCapture, Flag>>): void {
        Object.assign(running, flags);
    }

    /**
     * Opens the input again and hands the new stream to the Jam in place of the old one, which is stopped: one
     * publication and one live track at any time. Returns whether the new stream is the one being shared.
     */
    async function reopen(running: RunningCapture): Promise<boolean> {
        if (current !== running || running.reopening) {
            return false;
        }
        mark(running, { reopening: true });
        const mine = generation;
        try {
            let stream: MediaStream;
            try {
                stream = await getUserMedia(musicConstraints(running.deviceId));
            } catch (error) {
                // Not back yet: the next device change gets its turn.
                console.warn("Could not reopen the input of the Jam music", error);
                mark(running, { waitingForDevice: true });
                return false;
            }
            if (current !== running || mine !== generation) {
                stopTracks(stream);
                return false;
            }
            const previous = running.stream;
            running.stream = stream;
            watch(running);
            try {
                await running.publisher.publishJamMusic(stream);
            } catch (error) {
                console.error("Could not publish the Jam music again", error);
                stopTracks(previous);
                fail(running, "unavailable");
                return false;
            }
            stopTracks(previous);
            if (current !== running || mine !== generation) {
                // Stopped meanwhile: release() let go of the stream it knew, not of this one.
                running.meter?.destroy();
                stopTracks(stream);
                return false;
            }
            mark(running, { waitingForDevice: false });
            running.silentTicks = 0;
            silent.set(false);
            sharedMusic.set({ spaceName: running.spaceName, stream });
            state.set({ status: "active", label: stream.getAudioTracks()[0]?.label ?? "" });
            return true;
        } finally {
            mark(running, { reopening: false });
        }
    }

    function checkSilence(running: RunningCapture): void {
        if (current !== running || running.reopening || running.waitingForDevice) {
            return;
        }
        if (!running.meter?.isSilent()) {
            running.silentTicks = 0;
            running.reopenedForSilence = false;
            silent.set(false);
            return;
        }
        running.silentTicks++;
        if (running.silentTicks * SILENCE_CHECK_INTERVAL_MS < SILENCE_LIMIT_MS) {
            return;
        }
        running.silentTicks = 0;
        if (running.reopenedForSilence) {
            // Reopening did not bring the music back: the source itself is quiet or stopped. Tell the host.
            silent.set(true);
            return;
        }
        running.reopenedForSilence = true;
        reopen(running).catch(console.error);
    }

    return {
        state,
        sharedMusic,
        silent,

        async start(spaceName, deviceId, options = {}) {
            const mine = ++generation;
            state.set({ status: "requesting" });
            await release();
            if (mine !== generation) {
                return;
            }
            if (options.forbiddenDeviceIds?.includes(deviceId)) {
                state.set({ status: "error", reason: "microphone" });
                return;
            }

            let stream: MediaStream;
            try {
                stream = await getUserMedia(musicConstraints(deviceId));
            } catch (error) {
                if (mine === generation) {
                    state.set({ status: "error", reason: errorReason(error) });
                }
                return;
            }
            if (mine !== generation) {
                stopTracks(stream);
                return;
            }

            const publisher = getPublisher(spaceName);
            if (!publisher) {
                stopTracks(stream);
                state.set({ status: "error", reason: "no-session" });
                return;
            }

            const running: RunningCapture = {
                spaceName,
                deviceId,
                stream,
                publisher,
                reopening: false,
                waitingForDevice: false,
                silentTicks: 0,
                reopenedForSilence: false,
            };
            current = running;
            // The space reconnects with a new connection after a server restart: the music follows it.
            running.unwatch = onPublisherRegistered?.(spaceName, (replacement) => {
                if (current !== running || replacement === running.publisher) {
                    return;
                }
                running.publisher = replacement;
                replacement.publishJamMusic(running.stream).catch((error) => {
                    console.error("Could not publish the Jam music again", error);
                    fail(running, "unavailable");
                });
            });
            watch(running);
            unwatchDevices = onDeviceChange?.(() => {
                // One attempt per change, and only for an input that is gone or failed to come back.
                if (current === running && running.waitingForDevice) {
                    scheduleReopen(running);
                }
            });
            if (createSilenceMeter) {
                silenceTimer = setInterval(() => checkSilence(running), SILENCE_CHECK_INTERVAL_MS);
            }

            try {
                await publisher.publishJamMusic(stream);
            } catch (error) {
                console.error("Could not publish the Jam music", error);
                if (current === running) {
                    await release();
                }
                if (mine === generation) {
                    state.set({ status: "error", reason: "unavailable" });
                }
                return;
            }
            if (mine !== generation) {
                if (current === running) {
                    await release();
                }
                return;
            }
            sharedMusic.set({ spaceName, stream: running.stream });
            state.set({ status: "active", label: running.stream.getAudioTracks()[0]?.label ?? "" });
        },

        async stop() {
            generation++;
            await release();
            state.set({ status: "idle" });
        },
    };
}

export const jamMusicCapture = createJamMusicCapture({
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    getPublisher: getJamMusicPublisher,
    onPublisherRegistered: onJamMusicPublisherRegistered,
    onDeviceChange: (callback) => {
        const devices = navigator.mediaDevices;
        devices?.addEventListener("devicechange", callback);
        return () => devices?.removeEventListener("devicechange", callback);
    },
    createSilenceMeter: createStreamSilenceMeter,
});
