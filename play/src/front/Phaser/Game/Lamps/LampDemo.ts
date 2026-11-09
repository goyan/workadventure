const DEFAULT_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 240;
const OFF_VALUES = new Set(["0", "off", "false"]);

/**
 * `?lampDemo` puts a lamp of each kind near the player, lit by a made-up beat, to try the visuals out without a Jam.
 * The value is the tempo (40 to 240); anything else means 120 BPM; `0`, `off` or `false` turn it off.
 */
export function parseLampDemo(search: string): { bpm: number } | undefined {
    const value = new URLSearchParams(search).get("lampDemo");
    if (value === null || OFF_VALUES.has(value.toLowerCase())) {
        return undefined;
    }
    const bpm = Number(value);
    return { bpm: value !== "" && Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : DEFAULT_BPM };
}

/** The demo to show: the tempo of the address when it has one, else the setting of the user (120 BPM), else none. */
export function resolveLampDemo(
    fromAddress: { bpm: number } | undefined,
    enabled: boolean,
): { bpm: number } | undefined {
    return fromAddress ?? (enabled ? { bpm: DEFAULT_BPM } : undefined);
}
