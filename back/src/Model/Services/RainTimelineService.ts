import {
    historySlotsFromOpenMeteo,
    openMeteoHistoryUrl,
    openMeteoTimelineUrl,
    PARIS_LATITUDE,
    PARIS_LONGITUDE,
    roundedCoordinate,
    slotsFromOpenMeteo,
} from "@workadventure/map-editor";
import type { MapPlace, RealWeatherSlot } from "@workadventure/map-editor";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";

/** One call to Open-Meteo every half hour at most for a place: its timeline runs six hours ahead. */
const REFRESH_MS = 30 * 60 * 1000;
/** After a failure the next try comes sooner. */
const RETRY_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 5000;
const HOUR_MS = 3600 * 1000;
/** Places followed at once (one for each map in real weather with a relief): the one asked least recently goes. */
const MAX_PLACES = 50;

interface PlaceTimeline {
    slots: RealWeatherSlot[] | undefined;
    nextAttemptAt: number;
    pending: boolean;
}

/**
 * The real weather timeline at the places of the maps, for the back: how hard it rains there fills the hollows of
 * their relief. The pusher has its own, for the players; this one never makes a room wait: it answers with what it
 * has in memory and asks Open-Meteo in the background.
 */
export class RainTimelineService {
    private readonly places = new Map<string, PlaceTimeline>();

    public constructor(
        private readonly fetchFn: typeof fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    /** The timeline at a place (Paris without one), or undefined while it is not known. */
    public slotsFor(place: MapPlace | undefined): RealWeatherSlot[] | undefined {
        const latitude = roundedCoordinate(place?.latitude ?? PARIS_LATITUDE);
        const longitude = roundedCoordinate(place?.longitude ?? PARIS_LONGITUDE);
        const key = `${latitude},${longitude}`;
        let entry = this.places.get(key);
        // Asked again: it becomes the most recent place, the last to be forgotten.
        this.places.delete(key);
        if (!entry) {
            if (this.places.size >= MAX_PLACES) {
                const leastRecent = this.places.keys().next().value;
                if (leastRecent !== undefined) this.places.delete(leastRecent);
            }
            entry = { slots: undefined, nextAttemptAt: -Infinity, pending: false };
        }
        this.places.set(key, entry);
        if (!entry.pending && this.now() >= entry.nextAttemptAt) {
            entry.pending = true;
            this.refresh(entry, latitude, longitude);
        }
        return entry.slots;
    }

    /**
     * The weather of the past at a place, hour by hour as quarter hours, from `since` (epoch ms) on: what a room left
     * empty lived through (MeadowManager catches up with it). Undefined when Open-Meteo does not answer.
     */
    public async history(place: MapPlace | undefined, since: number): Promise<RealWeatherSlot[] | undefined> {
        const latitude = roundedCoordinate(place?.latitude ?? PARIS_LATITUDE);
        const longitude = roundedCoordinate(place?.longitude ?? PARIS_LONGITUDE);
        const days = (this.now() - since) / (24 * 3600 * 1000) + 1;
        try {
            const response = await this.fetchFn(openMeteoHistoryUrl(latitude, longitude, days), {
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return historySlotsFromOpenMeteo(await response.json())?.filter((slot) => slot.at + HOUR_MS > since);
        } catch (error) {
            console.error("Open-Meteo history failed (the meadow catches up without it)", asError(error));
            return undefined;
        }
    }

    /** How many places are followed (bounded). */
    public followed(): number {
        return this.places.size;
    }

    private refresh(entry: PlaceTimeline, latitude: number, longitude: number): void {
        this.fetchFn(openMeteoTimelineUrl(latitude, longitude), { signal: AbortSignal.timeout(TIMEOUT_MS) })
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const slots = slotsFromOpenMeteo(await response.json());
                if (!slots) throw new Error("no usable timeline in the answer");
                entry.slots = slots;
                entry.nextAttemptAt = this.now() + REFRESH_MS;
            })
            .catch((error: unknown) => {
                const cause = asError(error);
                console.error("Open-Meteo forecast failed (rain of the relief)", cause);
                Sentry.captureException(cause);
                entry.nextAttemptAt = this.now() + RETRY_MS;
            })
            .finally(() => {
                entry.pending = false;
            });
    }
}

export const rainTimelineService = new RainTimelineService();
