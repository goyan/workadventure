import { type Readable, writable } from "svelte/store";
import { getJamMusicPublisher, type JamMusicPublisher } from "./JamMusicStore";

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
}

export interface JamMusicCapture {
    readonly state: Readable<JamMusicCaptureState>;
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

export function createJamMusicCapture({ getUserMedia, getPublisher }: JamMusicCaptureDependencies): JamMusicCapture {
    const state = writable<JamMusicCaptureState>({ status: "idle" });
    // Every start and stop takes a number: what comes back from a slower one is dropped, so an old capture never
    // comes back to life over a newer decision.
    let generation = 0;
    let current: { stream: MediaStream; publisher: JamMusicPublisher } | undefined;

    function stopTracks(stream: MediaStream): void {
        for (const track of stream.getTracks()) {
            track.stop();
        }
    }

    async function release(): Promise<void> {
        const running = current;
        current = undefined;
        if (!running) {
            return;
        }
        stopTracks(running.stream);
        try {
            await running.publisher.publishJamMusic(undefined);
        } catch (error) {
            console.error("Could not stop publishing the Jam music", error);
        }
    }

    return {
        state,

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

            current = { stream, publisher };
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
});
