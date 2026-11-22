import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import { WORLD_WEATHER_PLACES, openMeteoWorldUrl, worldWeatherFromOpenMeteo } from "../../common/WorldWeather";
import type { WorldWeatherReport } from "../../common/WorldWeather";

/**
 * The weather now of the places of the world is asked once every ten minutes at most, for the whole pusher: Open-Meteo
 * gives it by quarter hours, and each place of the request counts as a call of its free quota.
 */
const REFRESH_MS = 10 * 60 * 1000;
/** After a failure, the next try comes this much later at the soonest, whatever the clicks. */
const RETRY_MS = 60 * 1000;
/** A weather known longer ago than this is no longer that of now: none rather than an old rain. */
const KEPT_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 8000;

function reportFailure(error: unknown): void {
    const cause = asError(error);
    console.error("Open-Meteo weather of the world failed", cause);
    Sentry.captureException(cause);
}

/**
 * The weather now at the places of the world (WORLD_WEATHER_PLACES), in one request of Open-Meteo, shared by every
 * player of this pusher. Asked only when a player looks for a place where it rains or snows, never in the background.
 */
export class WorldWeatherService {
    private report: { value: WorldWeatherReport; at: number } | undefined;
    private lastAttemptAt = -Infinity;
    private pending: Promise<void> | undefined;

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
        private readonly onFailure: (error: unknown) => void = reportFailure,
    ) {}

    public async get(): Promise<WorldWeatherReport | undefined> {
        const now = this.now();
        const fresh = this.report !== undefined && now - this.report.at < REFRESH_MS;
        if (!fresh && now - this.lastAttemptAt >= RETRY_MS) {
            this.lastAttemptAt = now;
            this.pending ??= this.refresh().finally(() => {
                this.pending = undefined;
            });
        }
        if (this.pending) await this.pending;
        return this.report && this.now() - this.report.at < KEPT_MS ? this.report.value : undefined;
    }

    private async refresh(): Promise<void> {
        try {
            const response = await this.fetchFn(openMeteoWorldUrl(WORLD_WEATHER_PLACES), {
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const value = worldWeatherFromOpenMeteo(await response.json(), WORLD_WEATHER_PLACES);
            if (!value) throw new Error("no usable weather of the world in the answer");
            this.report = { value, at: this.now() };
        } catch (error) {
            this.onFailure(error);
        }
    }
}

export const worldWeatherService = new WorldWeatherService();
