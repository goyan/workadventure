import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchForBuildUpdate } from "../../../src/front/Network/BuildUpdate";

describe("build update notification", () => {
    const loadedVersion = "a".repeat(64);
    const deployedVersion = "b".repeat(64);
    const fetchMock = vi.fn<typeof fetch>();
    const onUpdate = vi.fn();
    let stop: (() => void) | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", fetchMock);
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: loadedVersion })));
    });

    afterEach(() => {
        stop?.();
        stop = undefined;
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        fetchMock.mockReset();
        onUpdate.mockReset();
    });

    async function settle(): Promise<void> {
        await vi.advanceTimersByTimeAsync(0);
    }

    it("keeps the current page when its build is still deployed", async () => {
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it("detects a deployment that already happened before the first check", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: deployedVersion })));
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();

        expect(onUpdate).toHaveBeenCalledOnce();
        window.dispatchEvent(new Event("focus"));
        await vi.runOnlyPendingTimersAsync();
        expect(onUpdate).toHaveBeenCalledOnce();
    });

    it("detects a deployment on a periodic check without reloading the page", async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: loadedVersion })));
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: deployedVersion })));
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();
        expect(onUpdate).not.toHaveBeenCalled();

        await vi.runOnlyPendingTimersAsync();

        expect(onUpdate).toHaveBeenCalledOnce();
    });

    it("retries after deployment downtime instead of displaying a false update", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();
        expect(onUpdate).not.toHaveBeenCalled();

        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: deployedVersion })));
        window.dispatchEvent(new Event("focus"));
        await settle();

        expect(onUpdate).toHaveBeenCalledOnce();
    });

    it.each([
        new Response(JSON.stringify({ version: deployedVersion }), { status: 503 }),
        new Response("<html>Authentication required</html>"),
        new Response(JSON.stringify({ version: "" })),
        new Response(JSON.stringify({ version: "1.0.0" })),
        new Response(JSON.stringify({ error: "Unavailable" })),
    ])("ignores unavailable or invalid version responses %#", async (response) => {
        fetchMock.mockResolvedValue(response);
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it("checks an inactive tab when it becomes visible again", async () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();
        expect(fetchMock).not.toHaveBeenCalled();

        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: deployedVersion })));
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
        await settle();

        expect(onUpdate).toHaveBeenCalledOnce();
    });

    it("cancels the request and ignores late responses after unmount", async () => {
        let resolveFetch: ((response: Response) => void) | undefined;
        fetchMock.mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();
        const signal = fetchMock.mock.calls[0]?.[1]?.signal;

        stop();
        expect(signal?.aborted).toBe(true);
        resolveFetch?.(new Response(JSON.stringify({ version: deployedVersion })));
        await settle();
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.runOnlyPendingTimersAsync();

        expect(onUpdate).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});
