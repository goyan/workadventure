import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RainTimelineService } from "../src/Model/Services/RainTimelineService";

// Part of a real Open-Meteo answer (Jakarta, 2026-11-18): code 53 with 0.2 mm, then showers (80) with 0.4 mm.
const START = 1794987900;
const answer = (): Response =>
    new Response(
        JSON.stringify({
            minutely_15: {
                time: [START, START + 900],
                weather_code: [53, 80],
                temperature_2m: [27, 27],
                precipitation: [0.2, 0.4],
            },
        }),
    );
const MINUTE = 60_000;
const jakarta = { latitude: -6.2, longitude: 106.85 };
const settle = (): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
const urlOf = (input: string | URL | Request): URL => (input instanceof Request ? new URL(input.url) : new URL(input));

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe("RainTimelineService", () => {
    it("answers at once with what it knows, and asks Open-Meteo in the background", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(answer());
        const service = new RainTimelineService(fetchFn, () => START * 1000);
        expect(service.slotsFor(jakarta)).toBeUndefined();
        await settle();
        const slots = service.slotsFor(jakarta);
        expect(slots?.map((slot) => slot.rainRate)).toEqual([0.8, 1.6]);
        expect(fetchFn).toHaveBeenCalledOnce();
        const url = urlOf(fetchFn.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
        expect(url.searchParams.get("minutely_15")).toContain("precipitation");
        expect(Number(url.searchParams.get("latitude"))).toBeCloseTo(-6.2);
    });

    it("asks again after half an hour only, and Paris for a map without a place", async () => {
        let now = START * 1000;
        const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(answer()));
        const service = new RainTimelineService(fetchFn, () => now);
        service.slotsFor(undefined);
        await settle();
        now += 29 * MINUTE;
        service.slotsFor(undefined);
        await settle();
        expect(fetchFn).toHaveBeenCalledOnce();
        expect(Number(urlOf(fetchFn.mock.calls[0][0]).searchParams.get("latitude"))).toBeCloseTo(48.86);
        now += 2 * MINUTE;
        service.slotsFor(undefined);
        await settle();
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("keeps what it knew through a failure, and tries again two minutes later", async () => {
        let now = START * 1000;
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(new Error("down"))
            .mockResolvedValueOnce(new Response("nope", { status: 500 }))
            .mockImplementation(() => Promise.resolve(answer()));
        const service = new RainTimelineService(fetchFn, () => now);
        service.slotsFor(jakarta);
        await settle();
        expect(service.slotsFor(jakarta)).toBeUndefined();
        expect(fetchFn).toHaveBeenCalledOnce();
        now += 2 * MINUTE;
        service.slotsFor(jakarta);
        await settle();
        now += 2 * MINUTE;
        service.slotsFor(jakarta);
        await settle();
        expect(service.slotsFor(jakarta)).toHaveLength(2);
        expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("never waits for an answer that does not come, and follows a bounded number of places", () => {
        const fetchFn = vi.fn<typeof fetch>().mockReturnValue(
            new Promise<Response>(() => {
                // Never answers.
            }),
        );
        const service = new RainTimelineService(fetchFn, () => START * 1000);
        for (let place = 0; place < 80; place++) {
            expect(service.slotsFor({ latitude: place / 2, longitude: 0 })).toBeUndefined();
        }
        // One request under way for a place at a time, and no more places than the bound at once.
        expect(service.slotsFor({ latitude: 39.5, longitude: 0 })).toBeUndefined();
        expect(fetchFn).toHaveBeenCalledTimes(80);
        expect(service.followed()).toBeLessThanOrEqual(50);
    });
});
