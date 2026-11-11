import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    findNewerBuild,
    rememberUpdateForReload,
    takeUpdateAfterReload,
    watchForBuildUpdate,
} from "../../../src/front/Network/BuildUpdate";
import { getNewReleaseNotes } from "../../../src/common/ReleaseNotes";
import type { ReleaseNote } from "../../../src/common/ReleaseNotes";

describe("build update notification", () => {
    const loadedVersion = "a".repeat(64);
    const deployedVersion = "b".repeat(64);
    const fetchMock = vi.fn<typeof fetch>();
    const onUpdate = vi.fn();
    let stop: (() => void) | undefined;
    const note: ReleaseNote = {
        id: "c".repeat(40),
        date: "2026-10-30T16:34:39+01:00",
        author: "Hervé Meunier",
        type: "feat",
        description: "Historique des nouveautés dans Outils",
    };

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

    it("keeps the changes it found for the next reload, automatic or by the Refresh button", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: deployedVersion, releaseNotes: [note] })));
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();

        expect(takeUpdateAfterReload()).toEqual([note]);
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

    it("provides the deployed descriptions and excludes changes already loaded", async () => {
        const previousNote: ReleaseNote = { ...note, id: "d".repeat(40), description: "Notification de version" };
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ version: deployedVersion, releaseNotes: [note, previousNote] })),
        );
        stop = watchForBuildUpdate(loadedVersion, onUpdate);
        await settle();

        expect(onUpdate).toHaveBeenCalledWith([note, previousNote]);
        expect(getNewReleaseNotes([note, previousNote], [previousNote])).toEqual([note]);
        expect(getNewReleaseNotes([note, previousNote], [note, previousNote])).toEqual([]);
    });

    it.each([undefined, [{ ...note, type: "docs" }], [{ ...note, date: "invalid" }]])(
        "still offers a refresh when release descriptions are absent or invalid %#",
        async (releaseNotes) => {
            fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: deployedVersion, releaseNotes })));
            stop = watchForBuildUpdate(loadedVersion, onUpdate);
            await settle();

            expect(onUpdate).toHaveBeenCalledWith([]);
        },
    );

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

describe("check after a lost connection", () => {
    const loadedVersion = "a".repeat(64);
    const fetchMock = vi.fn<typeof fetch>();
    const note: ReleaseNote = {
        id: "d".repeat(40),
        date: "2026-11-11T14:53:00+01:00",
        author: "Hervé Meunier",
        type: "feat",
        description: "réglages des agendas Outlook repliés une fois configurés",
    };

    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
        sessionStorage.clear();
    });

    it("gives the release notes of the build the server now serves", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: "b".repeat(64), releaseNotes: [note] })));

        await expect(findNewerBuild(loadedVersion)).resolves.toEqual([note]);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.objectContaining({ pathname: "/build-version" }),
            expect.objectContaining({ cache: "no-store" }),
        );
    });

    it("keeps the page when the server still serves its build", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ version: loadedVersion, releaseNotes: [note] })));

        await expect(findNewerBuild(loadedVersion)).resolves.toBeUndefined();
    });

    it("keeps the page when the version cannot be read", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        await expect(findNewerBuild(loadedVersion)).resolves.toBeUndefined();

        fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
        await expect(findNewerBuild(loadedVersion)).resolves.toBeUndefined();

        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: "not-a-build" })));
        await expect(findNewerBuild(loadedVersion)).resolves.toBeUndefined();
    });

    it("hands the changes over to the reloaded page, once", () => {
        rememberUpdateForReload([note]);

        expect(takeUpdateAfterReload()).toEqual([note]);
        expect(takeUpdateAfterReload()).toBeUndefined();
    });

    it("shows nothing after an ordinary page load", () => {
        expect(takeUpdateAfterReload()).toBeUndefined();

        sessionStorage.setItem("wa-build-update-notes", "{not json");
        expect(takeUpdateAfterReload()).toBeUndefined();
    });
});
