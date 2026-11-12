import { afterEach, describe, expect, it, vi } from "vitest";
import { asError } from "catch-unknown";

vi.mock("../../../src/front/Enum/ComputedConst", () => ({ ABSOLUTE_PUSHER_URL: "https://wa.example/" }));
vi.mock("../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getAuthToken: () => "jwt-token" },
}));

import {
    PusherUnreachableError,
    pusherFetch,
} from "../../../src/front/external-modules/infogene-calendar/pusherRequest";

/** A fetch that only ends when its signal is aborted, like a pusher that never answers. */
function hangingFetch() {
    return vi.fn(
        (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                if (!signal) return;
                function onAbort(): void {
                    signal?.removeEventListener("abort", onAbort);
                    reject(asError(signal?.reason));
                }
                signal.addEventListener("abort", onAbort);
            }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("pusherFetch", () => {
    it("calls the pusher with the user's token, a path with or without its leading slash", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
        vi.stubGlobal("fetch", fetchMock);

        await pusherFetch("calendar/sources", { method: "GET" });
        await pusherFetch("/companion/tokens", { method: "POST", body: { label: "Mac" } });

        expect(fetchMock.mock.calls[0][0]).toBe("https://wa.example/calendar/sources");
        expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "jwt-token" });
        expect(fetchMock.mock.calls[1][0]).toBe("https://wa.example/companion/tokens");
        expect(fetchMock.mock.calls[1][1].headers).toEqual({
            Authorization: "jwt-token",
            "Content-Type": "application/json",
        });
        expect(fetchMock.mock.calls[1][1].body).toBe('{"label":"Mac"}');
    });

    it("gives up on a pusher that does not answer in time", async () => {
        vi.stubGlobal("fetch", hangingFetch());

        await expect(pusherFetch("calendar/events", { method: "GET", timeoutMs: 20 })).rejects.toBeInstanceOf(
            PusherUnreachableError,
        );
    });

    it("reports a network failure as unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        await expect(pusherFetch("calendar/events", { method: "GET" })).rejects.toBeInstanceOf(PusherUnreachableError);
    });

    it("lets a request cancelled by its caller end as an abort, not as a failure", async () => {
        vi.stubGlobal("fetch", hangingFetch());
        const controller = new AbortController();

        const request = pusherFetch("calendar/events", { method: "GET", signal: controller.signal, timeoutMs: 10_000 });
        controller.abort();

        const error: unknown = await request.catch((e: unknown) => e);
        expect(error).not.toBeInstanceOf(PusherUnreachableError);
        expect(error).toHaveProperty("name", "AbortError");
    });
});
