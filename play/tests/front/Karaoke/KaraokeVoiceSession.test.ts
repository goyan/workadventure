import { afterEach, expect, it, vi } from "vitest";
import type { SpaceInterface } from "../../../src/front/Space/SpaceInterface";
import { createKaraokeVoiceSession } from "../../../src/front/Karaoke/KaraokeVoiceSession";
import { registerJamMusicPublisher } from "../../../src/front/ListeningZone/JamMusicStore";

let dispose: (() => void) | undefined;
afterEach(() => {
    dispose?.();
    dispose = undefined;
});
function setup() {
    const space = {} as unknown as SpaceInterface;
    const registry = { joinSpace: vi.fn().mockResolvedValue(space), leaveSpace: vi.fn().mockResolvedValue(undefined) };
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const publisher = { publishJamMusic: vi.fn().mockResolvedValue(undefined) };
    dispose = registerJamMusicPublisher("stage", publisher);
    return { registry, track, stream, publisher, space };
}
it("requests the mic only on singing and releases it when leaving", async () => {
    const { registry, track, stream, publisher, space } = setup();
    const capture = vi.fn().mockResolvedValue(stream);
    const session = createKaraokeVoiceSession(registry, capture);
    await session.join("stage");
    expect(capture).not.toHaveBeenCalled();
    await session.sing("headset");
    expect(capture).toHaveBeenCalledWith({
        audio: {
            deviceId: { exact: "headset" },
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    });
    expect(publisher.publishJamMusic).toHaveBeenCalledWith(stream);
    await session.leave();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(publisher.publishJamMusic).toHaveBeenLastCalledWith(undefined);
    expect(registry.leaveSpace).toHaveBeenCalledWith(space);
});
it("stops a late permission result after the singer's turn ends", async () => {
    const { registry, track, stream, publisher } = setup();
    let resolve: ((stream: MediaStream) => void) | undefined;
    const session = createKaraokeVoiceSession(
        registry,
        () =>
            new Promise<MediaStream>((r) => {
                resolve = r;
            }),
    );
    await session.join("stage");
    const singing = session.sing();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    await session.leave();
    resolve?.(stream);
    await singing;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(publisher.publishJamMusic).not.toHaveBeenCalledWith(stream);
});
it("cleans the captured mic when publication fails", async () => {
    const { registry, track, stream, publisher } = setup();
    publisher.publishJamMusic.mockImplementation((value) => {
        return value ? Promise.reject(new Error("Disconnected")) : Promise.resolve();
    });
    const session = createKaraokeVoiceSession(registry, () => Promise.resolve(stream));
    await session.join("stage");
    await expect(session.sing()).rejects.toThrow("Disconnected");
    expect(track.stop).toHaveBeenCalledOnce();
    await session.leave();
});

it("unpublishes a late mic publication after the turn ends", async () => {
    const { registry, track, stream, publisher } = setup();
    let finishPublication: (() => void) | undefined;
    publisher.publishJamMusic.mockImplementation((value) =>
        value
            ? new Promise<void>((resolve) => {
                  finishPublication = resolve;
              })
            : Promise.resolve(),
    );
    const session = createKaraokeVoiceSession(registry, () => Promise.resolve(stream));
    await session.join("stage");
    const singing = session.sing();
    await vi.waitFor(() => expect(finishPublication).toBeDefined());
    await session.leave();
    finishPublication?.();
    await singing;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(publisher.publishJamMusic).toHaveBeenLastCalledWith(undefined);
});
