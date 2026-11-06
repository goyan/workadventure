import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import { buildJamSpaceName } from "@workadventure/map-editor";
import {
    createJamAudioSession,
    type JamAudioSessionDependencies,
} from "../../../src/front/ListeningZone/JamAudioSession";
import type { JamMusicCapture, JamMusicCaptureState } from "../../../src/front/ListeningZone/JamMusicCapture";
import type { JamMusicPublisher } from "../../../src/front/ListeningZone/JamMusicStore";

const jam = { areaId: "area1", propertyId: "prop1", hostUuid: "host-uuid" };
const roomUrl = "https://play.example/_/global/map.json";
const spaceName = buildJamSpaceName({ roomUrl, ...jam });

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

function setup(overrides: Partial<JamAudioSessionDependencies> = {}) {
    const space = { getName: () => spaceName };
    const joinSpace = vi.fn().mockResolvedValue(space);
    const leaveSpace = vi.fn().mockResolvedValue(undefined);
    const captureState = writable<JamMusicCaptureState>({ status: "idle" });
    const captureStart = vi.fn().mockResolvedValue(undefined);
    const captureStop = vi.fn().mockResolvedValue(undefined);
    const capture: JamMusicCapture = { state: captureState, start: captureStart, stop: captureStop };
    const publisher: JamMusicPublisher = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };
    const listening = writable(false);
    const deps: JamAudioSessionDependencies = {
        getSpaceRegistry: () => ({ joinSpace, leaveSpace }),
        getRoomUrl: () => roomUrl,
        capture,
        getPublisher: vi.fn().mockReturnValue(publisher),
        listeningStore: listening,
        publisherTimeoutMs: 1000,
        ...overrides,
    };
    return { session: createJamAudioSession(deps), joinSpace, leaveSpace, captureStart, captureStop, listening, space };
}

describe("JamAudioSession", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    describe("listen", () => {
        it("joins the Jam space named after the room and the Jam, then turns the music download on", async () => {
            const { session, joinSpace, listening } = setup();
            await session.listen(jam);
            expect(joinSpace).toHaveBeenCalledTimes(1);
            expect(joinSpace.mock.calls[0][0]).toBe(spaceName);
            expect(get(listening)).toBe(true);
        });

        it("leaves the space and turns the download off when listening stops", async () => {
            const { session, leaveSpace, listening, space } = setup();
            await session.listen(jam);
            await session.stopListening();
            expect(leaveSpace).toHaveBeenCalledWith(space);
            expect(get(listening)).toBe(false);
        });

        it("does nothing when stopping while not listening", async () => {
            const { session, leaveSpace } = setup();
            await session.stopListening();
            expect(leaveSpace).not.toHaveBeenCalled();
        });

        it("listening twice does not join twice nor needs two stops", async () => {
            const { session, joinSpace, leaveSpace } = setup();
            await session.listen(jam);
            await session.listen(jam);
            expect(joinSpace).toHaveBeenCalledTimes(1);
            await session.stopListening();
            expect(leaveSpace).toHaveBeenCalledTimes(1);
        });

        it("moving to another Jam leaves the first one", async () => {
            const { session, joinSpace, leaveSpace } = setup();
            await session.listen(jam);
            await session.listen({ ...jam, hostUuid: "other-host" });
            expect(joinSpace).toHaveBeenCalledTimes(2);
            expect(leaveSpace).toHaveBeenCalledTimes(1);
        });

        it("leaves the space joined by a listen that was stopped before the join came back", async () => {
            const joined = deferred<{ getName: () => string }>();
            const { session, joinSpace, leaveSpace, listening, space } = setup();
            joinSpace.mockReturnValueOnce(joined.promise);
            const listening1 = session.listen(jam);
            const stopping = session.stopListening();
            joined.resolve(space);
            await listening1;
            await stopping;
            expect(leaveSpace).toHaveBeenCalledWith(space);
            expect(get(listening)).toBe(false);
        });

        it("forgets the listening when the join fails", async () => {
            const { session, joinSpace, listening } = setup();
            joinSpace.mockRejectedValueOnce(new Error("boom"));
            await expect(session.listen(jam)).rejects.toThrow("boom");
            expect(get(listening)).toBe(false);
        });
    });

    describe("state for the UI", () => {
        it("names the Jam listened to once joined and forgets it when listening stops", async () => {
            const { session } = setup();
            expect(get(session.listeningSpaceName)).toBeUndefined();
            await session.listen(jam);
            expect(get(session.listeningSpaceName)).toBe(spaceName);
            await session.stopListening();
            expect(get(session.listeningSpaceName)).toBeUndefined();
        });

        it("names the Jam shared once the capture started and forgets it when it stops", async () => {
            const { session } = setup();
            await session.shareMusic(jam, "blackhole");
            expect(get(session.sharingSpaceName)).toBe(spaceName);
            await session.stopSharingMusic();
            expect(get(session.sharingSpaceName)).toBeUndefined();
        });

        it("forgets the Jam shared when the capture ends by itself", async () => {
            const captureState = writable<JamMusicCaptureState>({ status: "idle" });
            const capture: JamMusicCapture = {
                state: captureState,
                start: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            const { session } = setup({ capture });
            await session.shareMusic(jam, "blackhole");
            captureState.set({ status: "error", reason: "ended" });
            await vi.advanceTimersByTimeAsync(0);
            expect(get(session.sharingSpaceName)).toBeUndefined();
        });

        it("gives the space name of a Jam in the current room", () => {
            const { session } = setup();
            expect(session.spaceNameOf(jam)).toBe(spaceName);
        });
    });

    describe("shareMusic", () => {
        it("joins the space, then starts the capture with the microphone forbidden", async () => {
            const { session, joinSpace, captureStart } = setup();
            await session.shareMusic(jam, "blackhole", { forbiddenDeviceIds: ["mic"] });
            expect(joinSpace).toHaveBeenCalledTimes(1);
            expect(captureStart).toHaveBeenCalledWith(spaceName, "blackhole", { forbiddenDeviceIds: ["mic"] });
        });

        it("waits for the LiveKit publisher of the space before starting the capture", async () => {
            const publisher: JamMusicPublisher = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };
            const getPublisher = vi
                .fn()
                .mockReturnValueOnce(undefined)
                .mockReturnValueOnce(undefined)
                .mockReturnValue(publisher);
            const { session, captureStart } = setup({ getPublisher });
            const sharing = session.shareMusic(jam, "blackhole");
            await vi.advanceTimersByTimeAsync(0);
            expect(captureStart).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(500);
            await sharing;
            expect(captureStart).toHaveBeenCalledTimes(1);
        });

        it("starts the capture anyway after the timeout so that it reports no-session", async () => {
            const { session, captureStart } = setup({ getPublisher: vi.fn().mockReturnValue(undefined) });
            const sharing = session.shareMusic(jam, "blackhole");
            await vi.advanceTimersByTimeAsync(1500);
            await sharing;
            expect(captureStart).toHaveBeenCalledTimes(1);
        });

        it("stops the capture and leaves the space when sharing stops", async () => {
            const { session, captureStop, leaveSpace, space } = setup();
            await session.shareMusic(jam, "blackhole");
            await session.stopSharingMusic();
            expect(captureStop).toHaveBeenCalledTimes(1);
            expect(leaveSpace).toHaveBeenCalledWith(space);
        });

        it("keeps the space while the host also listens, and leaves when the last use ends", async () => {
            const { session, leaveSpace } = setup();
            await session.listen(jam);
            await session.shareMusic(jam, "blackhole");
            await session.stopSharingMusic();
            expect(leaveSpace).not.toHaveBeenCalled();
            await session.stopListening();
            expect(leaveSpace).toHaveBeenCalledTimes(1);
        });

        it("releases the space when the capture ends by itself", async () => {
            const captureState = writable<JamMusicCaptureState>({ status: "idle" });
            const capture: JamMusicCapture = {
                state: captureState,
                start: vi.fn().mockImplementation(() => {
                    captureState.set({ status: "active", label: "BlackHole" });
                    return Promise.resolve();
                }),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            const { session, leaveSpace } = setup({ capture });
            await session.shareMusic(jam, "blackhole");
            captureState.set({ status: "error", reason: "ended" });
            await vi.advanceTimersByTimeAsync(0);
            expect(leaveSpace).toHaveBeenCalledTimes(1);
        });
    });
});
