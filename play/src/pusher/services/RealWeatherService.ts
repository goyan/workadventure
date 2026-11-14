import Debug from "debug";
import { z } from "zod";
import { PARIS_LATITUDE, PARIS_LONGITUDE, weatherFromWmoCode } from "../../common/RealWeather";
import type { ObservedWeather, RealWeatherReport } from "../../common/RealWeather";

const debug = Debug("pusher:real-weather");

/** One call to Open-Meteo every ten minutes at most, whatever the number of players (their data refresh every 15). */
const REFRESH_MS = 10 * 60 * 1000;
/** Past this age, the last weather is no longer shown: the players fall back to the seasonal draw. */
const MAX_AGE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

const OpenMeteoCurrent = z.object({ current: z.object({ weather_code: z.number() }) });

/** The current weather in Paris, shared by every player of this pusher. */
export class RealWeatherService {
    private current: { weather: ObservedWeather; since: number; observedAt: number } | undefined;
    private lastAttemptAt = -Infinity;
    private pending: Promise<void> | undefined;

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    public async get(): Promise<RealWeatherReport> {
        if (this.now() - this.lastAttemptAt >= REFRESH_MS) {
            this.lastAttemptAt = this.now();
            this.pending ??= this.refresh().finally(() => {
                this.pending = undefined;
            });
        }
        if (this.pending) await this.pending;
        const current = this.current;
        if (!current || this.now() - current.observedAt > MAX_AGE_MS) return { weather: null, since: null };
        return { weather: current.weather, since: current.since };
    }

    private async refresh(): Promise<void> {
        try {
            const url = new URL("https://api.open-meteo.com/v1/forecast");
            url.searchParams.set("latitude", String(PARIS_LATITUDE));
            url.searchParams.set("longitude", String(PARIS_LONGITUDE));
            url.searchParams.set("current", "weather_code");
            const response = await this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!response.ok) {
                debug("Open-Meteo answered %d", response.status);
                return;
            }
            const parsed = OpenMeteoCurrent.safeParse(await response.json());
            const weather = parsed.success ? weatherFromWmoCode(parsed.data.current.weather_code) : undefined;
            if (!weather) {
                debug("Open-Meteo gave no usable weather code");
                return;
            }
            const observedAt = this.now();
            const since = this.current?.weather === weather ? this.current.since : observedAt;
            this.current = { weather, since, observedAt };
        } catch (error) {
            debug("Open-Meteo request failed: %O", error);
        }
    }
}

export const realWeatherService = new RealWeatherService();
