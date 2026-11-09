import { type Readable, writable } from "svelte/store";
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
}

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

export function createJamMusicCapture({
    getUserMedia,
    getPublisher,
    onPublisherRegistered,
}: JamMusicCaptureDependencies): JamMusicCapture {
    const state = writable<JamMusicCaptureState>({ status: "idle" });
    const sharedMusic = writable<SharedJamMusic | undefined>(undefined);
    // Every start and stop takes a number: what comes back from a slower one is dropped, so an old capture never
    // comes back to life over a newer decision.
    let generation = 0;
    let current: { stream: MediaStream; publisher: JamMusicPublisher; unwatch?: () => void } | undefined;

    function stopTracks(stream: MediaStream): void {
        for (const track of stream.getTracks()) {
            track.stop();
        }
    }

    async function release(): Promise<void> {
        const running = current;
        current = undefined;
        sharedMusic.set(undefined);
        if (!running) {
            return;
        }
        running.unwatch?.();
        stopTracks(running.stream);
        try {
            await running.publisher.publishJamMusic(undefined);
        } catch (error) {
            console.error("Could not stop publishing the Jam music", error);
        }
    }

    return {
        state,
        sharedMusic,

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
                stream = await getUserMedia({
                    audio: {
                        deviceId: { exact: deviceId },
                        // Music, not a voice: the browser must not clean it up.
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        channelCount: 2,
                    },
                });
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

            const running = { stream, publisher, unwatch: undefined as (() => void) | undefined };
            current = running;
            // The space reconnects with a new connection after a server restart: the music follows it.
            running.unwatch = onPublisherRegistered?.(spaceName, (replacement) => {
                if (current !== running || replacement === running.publisher) {
                    return;
                }
                running.publisher = replacement;
                replacement.publishJamMusic(stream).catch((error) => {
                    console.error("Could not publish the Jam music again", error);
                    if (current === running) {
                        release()
                            .then(() => state.set({ status: "error", reason: "unavailable" }))
                            .catch(console.error);
                    }
                });
            });
            const [track] = stream.getAudioTracks();
            track.addEventListener(
                "ended",
                () => {
                    if (current?.stream !== stream) {
                        return;
                    }
                    release()
                        .then(() => state.set({ status: "error", reason: "ended" }))
                        .catch(console.error);
                },
                { once: true },
            );

            try {
                await publisher.publishJamMusic(stream);
            } catch (error) {
                console.error("Could not publish the Jam music", error);
                if (current?.stream === stream) {
                    await release();
                }
                if (mine === generation) {
                    state.set({ status: "error", reason: "unavailable" });
                }
                return;
            }
            if (mine !== generation) {
                if (current?.stream === stream) {
                    await release();
                }
                return;
            }
            sharedMusic.set({ spaceName, stream });
            state.set({ status: "active", label: track.label });
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
});
