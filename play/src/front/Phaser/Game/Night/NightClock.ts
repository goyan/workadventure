/** Darkness of the night veil once night has fully fallen. */
export const NIGHT_MAX_OPACITY = 0.6;

// All thresholds are minutes since midnight, Paris time.
const DAWN_START = 7 * 60; // veil starts fading out
const DAWN_END = 7 * 60 + 30; // veil is gone
const DUSK_START = 18 * 60 + 30; // veil starts fading in
const DUSK_END = 19 * 60; // veil is at full darkness

const NIGHT_AT_PATTERN = /^(\d{1,2}):(\d{2})$/;

const parisFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

/** Minutes since midnight in Paris for this instant. */
export function parisMinutes(date: Date): number {
    const parts = parisFormatter.formatToParts(date);
    const hours = Number(parts.find((part) => part.type === "hour")?.value);
    const minutes = Number(parts.find((part) => part.type === "minute")?.value);
    return hours * 60 + minutes;
}

/** Darkness of the night veil for minutes since midnight (0 = day, NIGHT_MAX_OPACITY = night). */
export function nightOpacityAtMinutes(minutes: number): number {
    if (minutes >= DAWN_END && minutes <= DUSK_START) {
        return 0;
    }
    if (minutes > DUSK_START && minutes < DUSK_END) {
        return ((minutes - DUSK_START) / (DUSK_END - DUSK_START)) * NIGHT_MAX_OPACITY;
    }
    if (minutes > DAWN_START && minutes < DAWN_END) {
        return ((DAWN_END - minutes) / (DAWN_END - DAWN_START)) * NIGHT_MAX_OPACITY;
    }
    return NIGHT_MAX_OPACITY;
}

/** Darkness of the night veil at this instant, 0 (day) to NIGHT_MAX_OPACITY. */
export function nightOpacity(date: Date): number {
    return nightOpacityAtMinutes(parisMinutes(date));
}

/**
 * Development override: "HH:MM" from the `nightAt` URL parameter, as minutes since midnight,
 * or undefined (absent, invalid, or not in dev mode).
 */
export function parseNightAt(search: string, isDev: boolean): number | undefined {
    if (!isDev) {
        return undefined;
    }
    const value = new URLSearchParams(search).get("nightAt");
    const match = value === null ? null : NIGHT_AT_PATTERN.exec(value);
    if (!match) {
        return undefined;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return undefined;
    }
    return hours * 60 + minutes;
}
