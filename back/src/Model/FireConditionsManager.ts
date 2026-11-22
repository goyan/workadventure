import {
    boundedFireConditions,
    boundedFireThresholds,
    DEFAULT_FIRE_THRESHOLDS,
    FAST_WATER_TIMES,
    NEUTRAL_FIRE_CONDITIONS,
    REAL_WEATHER_SLOT_MS,
    WeatherType,
} from "@workadventure/map-editor";
import type { FireConditions, FireThresholds, PrecipitationAir, RealWeatherSlot } from "@workadventure/map-editor";
import type { FireConditionsMessage, SetFireConditionsMessage } from "@workadventure/messages";
import type { GameRoom } from "./GameRoom";
import type { RainTimelineService } from "./Services/RainTimelineService";

/** The real conditions are looked at this often: the room is told when they changed. */
const TICK_MS = 1000;
/** A player may change the conditions this many times a second (a slider being dragged), no more. */
const CHANGES_PER_SECOND = 5;

/**
 * Keeps the conditions the fire of a room goes by: the heat, the humidity of the air and the wind, and from where
 * they light a fire. Any player sets them by hand, for the whole room; otherwise they are the real ones at the place
 * of a map in real weather, and mild ones elsewhere. Nothing is saved: a room that restarts is back to the real ones.
 */
export class FireConditionsManager {
    private manual: FireConditions | undefined;
    /** The fast water of the room while a player turned it on (FAST_WATER_TIMES): never saved. */
    private fast: number | undefined;
    private limits: FireThresholds = DEFAULT_FIRE_THRESHOLDS;
    private told: string | undefined;
    private timer: ReturnType<typeof setInterval> | undefined;
    /** When each player last changed the conditions, within the last second. */
    private readonly changes = new Map<number, number[]>();

    constructor(
        private readonly room: Pick<GameRoom, "getWam" | "sendSubMessageToRoom">,
        private readonly rain: Pick<RainTimelineService, "slotsFor">,
        private readonly now: () => number = Date.now,
    ) {}

    public start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => {
            // An error there would take the whole server down, with every room.
            try {
                this.tick();
            } catch (error) {
                console.error("The fire conditions of the room could not be read", error);
            }
        }, TICK_MS);
        this.timer.unref?.();
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    /**
     * A player sets the conditions by hand (kept within their bounds) or goes back to the real ones, and sets the
     * thresholds either way. The room is told. False when refused: too many changes within a second.
     */
    public set(userId: number, sent: SetFireConditionsMessage): boolean {
        if (!this.allowed(userId)) return false;
        this.manual = sent.manual ? boundedFireConditions(sent, this.conditions()) : undefined;
        this.limits = boundedFireThresholds(
            {
                temperature: sent.thresholdTemperature,
                humidity: sent.thresholdHumidity,
                windSpeed: sent.thresholdWindSpeed,
            },
            this.limits,
        );
        this.tell();
        return true;
    }

    /** The conditions now: set by hand, else the real ones of a map in real weather, else mild ones. */
    /**
     * A player turns the fast water of the room on or off: for everyone in it, the water, the snow and the ice of the
     * room go FAST_WATER_TIMES times faster than reality, until it is turned off or the room empties.
     */
    public setFastWater(userId: number, on: boolean): boolean {
        if (!this.allowed(userId)) return false;
        this.fast = on ? FAST_WATER_TIMES : undefined;
        this.tell();
        return true;
    }

    /** How many times faster than reality the fast water goes while it is on; undefined when it is off. */
    public fastWater(): number | undefined {
        return this.fast;
    }

    /** Whether this player may change something now: no more than CHANGES_PER_SECOND a second. */
    private allowed(userId: number): boolean {
        const now = this.now();
        const recent = (this.changes.get(userId) ?? []).filter((at) => now - at < 1000);
        if (recent.length >= CHANGES_PER_SECOND) {
            this.changes.set(userId, recent);
            return false;
        }
        recent.push(now);
        this.changes.set(userId, recent);
        return true;
    }

    public conditions(): FireConditions {
        return this.manual ?? this.real();
    }

    public thresholds(): FireThresholds {
        return this.limits;
    }

    public snapshot(): FireConditionsMessage {
        return {
            manual: this.manual !== undefined,
            ...this.conditions(),
            thresholdTemperature: this.limits.temperature,
            thresholdHumidity: this.limits.humidity,
            thresholdWindSpeed: this.limits.windSpeed,
            ...(this.fast ? { fastWater: this.fast } : {}),
        };
    }

    /** Tells the room the conditions when they are not what it was last told (the real weather moved on). */
    public tick(): void {
        if (JSON.stringify(this.snapshot()) !== this.told) this.tell();
        // Players who left, or stopped changing anything, are forgotten.
        const now = this.now();
        for (const [userId, at] of this.changes)
            if (at.every((time) => now - time >= 1000)) this.changes.delete(userId);
    }

    private tell(): void {
        const fireConditionsMessage = this.snapshot();
        this.told = JSON.stringify(fireConditionsMessage);
        this.room.sendSubMessageToRoom({ message: { $case: "fireConditionsMessage", fireConditionsMessage } });
    }

    /**
     * The air the precipitation of the map falls through, which says whether it is rain or snow (snowShare): the heat
     * and the humidity set by hand, else the real ones at the place of the map (Paris without one) whatever weather
     * the map shows, as the players see it fall (precipitationAirNow in the front). Undefined while not known: it
     * then rains. The fire itself keeps its mild conditions on a map that is not in real weather.
     */
    public air(): PrecipitationAir | undefined {
        if (this.manual) return this.manual;
        const slot = this.slotNow();
        const temperature = slot?.temperature;
        const humidity = slot?.humidity;
        if (temperature === null || temperature === undefined || humidity === undefined) return undefined;
        return { temperature, humidity };
    }

    /** The quarter hour under way at the place of the map, once its timeline is known. */
    private slotNow(): RealWeatherSlot | undefined {
        const now = this.now();
        return this.rain
            .slotsFor(this.room.getWam()?.settings?.weatherLocation)
            ?.find((candidate) => candidate.at <= now && now < candidate.at + REAL_WEATHER_SLOT_MS);
    }

    /** The quarter hour under way at the place of a map in real weather; what it does not give is mild. */
    private real(): FireConditions {
        const settings = this.room.getWam()?.settings;
        if (settings?.weather !== WeatherType.Real) return NEUTRAL_FIRE_CONDITIONS;
        const slot = this.slotNow();
        if (!slot) return NEUTRAL_FIRE_CONDITIONS;
        return boundedFireConditions(
            {
                temperature: slot.temperature ?? undefined,
                humidity: slot.humidity,
                windSpeed: slot.windSpeed,
                windFrom: slot.windFrom,
            },
            NEUTRAL_FIRE_CONDITIONS,
        );
    }
}
