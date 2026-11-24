/** A duration slider has this many positions, from the shortest duration to the longest. */
export const LIFE_SLIDER_STEPS = 100;

/**
 * The duration, in seconds, at a position of its slider: the steps grow with the duration (ten seconds apart near
 * the shortest, minutes apart near the longest), so that one slider covers seconds to hours.
 */
export function durationAtSlider(position: number, min: number, max: number): number {
    const share = Math.min(1, Math.max(0, position / LIFE_SLIDER_STEPS));
    const seconds = min * Math.pow(max / min, share);
    // Round numbers: to 5 s under two minutes, to 30 s under a quarter of an hour, to 5 min beyond.
    const grain = seconds < 120 ? 5 : seconds < 900 ? 30 : 300;
    return Math.min(max, Math.max(min, Math.round(seconds / grain) * grain));
}

/** The position of the slider closest to a duration. */
export function sliderOfDuration(seconds: number, min: number, max: number): number {
    const bounded = Math.min(max, Math.max(min, seconds));
    return Math.round((Math.log(bounded / min) / Math.log(max / min)) * LIFE_SLIDER_STEPS);
}

/** A duration as one reads it: "45 s", "1 min 30 s", "2 h". */
export function formatDuration(seconds: number): string {
    const whole = Math.round(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const rest = whole % 60;
    if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    if (minutes > 0) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
    return `${rest} s`;
}
