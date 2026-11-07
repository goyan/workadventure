import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerNightClock } from "../../../../../src/front/Phaser/Game/Night/ServerNightClock";

const epoch = Date.parse("2026-01-15T20:00:00Z");
let monotonic = 0;
let clock: ServerNightClock | undefined;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.useFakeTimers();
    monotonic = 0;
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ now: epoch }))));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    clock?.destroy();
    clock = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("ServerNightClock", () => {
    it("advances from server time without depending on the computer clock", async () => {
        vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
        clock = new ServerNightClock();
        expect(clock.now()).toBeUndefined();
        await vi.advanceTimersByTimeAsync(0);
        expect(clock.now()?.getTime()).toBe(epoch);
        vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
        monotonic = 60000;
        expect(clock.now()?.getTime()).toBe(epoch + 60000);
        expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ cache: "no-store" }));
    });

    it("keeps the last server sample during a network failure and resyncs on focus", async () => {
        clock = new ServerNightClock();
        await vi.advanceTimersByTimeAsync(0);
        fetchMock.mockRejectedValueOnce(new Error("Offline"));
        monotonic = 300000;
        await vi.advanceTimersByTimeAsync(300000);
        expect(clock.now()?.getTime()).toBe(epoch + 300000);
        window.dispatchEvent(new Event("focus"));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(clock.now()?.getTime()).toBe(epoch);
    });

    it("ignores invalid timestamps", async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ now: "wrong" })));
        clock = new ServerNightClock();
        await vi.advanceTimersByTimeAsync(0);
        expect(clock.now()).toBeUndefined();
    });

    it("cleans up polling and ignores a response arriving after destruction", async () => {
        let resolveResponse: ((response: Response) => void) | undefined;
        fetchMock.mockReturnValueOnce(
            new Promise<Response>((resolve) => {
                resolveResponse = resolve;
            }),
        );
        clock = new ServerNightClock();
        clock.destroy();
        resolveResponse?.(new Response(JSON.stringify({ now: epoch })));
        await vi.advanceTimersByTimeAsync(300000);
        window.dispatchEvent(new Event("focus"));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(clock.now()).toBeUndefined();
    });
});
