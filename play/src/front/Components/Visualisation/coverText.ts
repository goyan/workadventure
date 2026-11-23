import { ICE_BEARS_MM, ICE_CURRENT_OPEN_MS, ICE_SHACK_MM } from "@workadventure/map-editor";
import type { KeptIce, KeptSnow } from "@wa/front/Phaser/Game/Weather/KeptCover";
import type { TranslationFunctions } from "../../../i18n/i18n-types";

/**
 * The ice and the snow the server keeps, said in sentences: the state first, then where it goes. Shared by the
 * weather board (the thickest of the map) and the pipette (the cell under the pointer). Only words: every figure
 * comes from KeptCover.
 */

type Words = TranslationFunctions["actionbar"]["visualisation"]["weather"];

/** Figures as the board writes them, in the language of the player. */
export interface CoverFigures {
    degrees(celsius: number | undefined): string;
    /** A thickness: millimetres under 10 cm, centimetres from there. */
    thickness(mm: number): string;
    /** Millimetres, to the tenth under 10. */
    mm(mm: number): string;
    /** A lapse of time, from seconds to days. */
    duration(seconds: number | undefined): string;
    speed(metresPerSecond: number): string;
    percent(share: number): string;
}

export function coverFigures(t: Words, locale: string): CoverFigures {
    const tenths = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const mm = (value: number): string => t.kept.mm({ value: (value < 10 ? tenths : whole).format(value) });
    return {
        degrees: (celsius) => (celsius === undefined ? t.airs.unknown() : `${tenths.format(celsius)} °C`),
        thickness: (value) => (value < 100 ? mm(value) : t.kept.cm({ value: tenths.format(value / 10) })),
        mm,
        duration: (seconds) => {
            if (seconds === undefined || !Number.isFinite(seconds)) return t.airs.unknown();
            if (seconds < 90) return t.snow.seconds({ value: whole.format(Math.max(1, Math.round(seconds))) });
            if (seconds < 90 * 60) return t.snow.minutes({ value: whole.format(Math.round(seconds / 60)) });
            if (seconds < 48 * 3600) return t.snow.hours({ value: whole.format(Math.round(seconds / 3600)) });
            return t.kept.days({ value: whole.format(Math.round(seconds / 86400)) });
        },
        speed: (value) => t.kept.speed({ value: tenths.format(value) }),
        percent: (share) => whole.format(Math.round(share * 100)),
    };
}

/** Where an ice is going, in one sentence; `peak`: the ice is the thickest of the map, not the one of a cell. */
export function iceTrendLine(t: Words, f: CoverFigures, ice: KeptIce, peak = false): string {
    const temperature = f.degrees(ice.temperature);
    switch (ice.trend) {
        case "thawing": {
            const values = { temperature, rate: f.mm(ice.mmPerHour), duration: f.duration(ice.goneIn) };
            return peak ? t.kept.iceThawingPeak(values) : t.kept.iceThawing(values);
        }
        case "growing":
            return ice.mm > 0
                ? t.kept.iceGrowing({ temperature, rate: f.mm(ice.mmPerHour) })
                : t.kept.iceTaking({ temperature });
        case "holding":
            return t.kept.iceHolding({ temperature });
        case "unknown":
            return t.kept.iceUnknownAir();
        case "none":
            // No ice and none coming: too warm, or (said by the caller) a water running too fast.
            return ice.temperature !== undefined && ice.temperature < 0
                ? t.kept.iceTaking({ temperature })
                : t.kept.iceWarm({ temperature });
    }
}

/** What an ice bears and when that changes; `deep`: one swims there, so a thin ice gives way. */
export function iceBearingLines(t: Words, f: CoverFigures, ice: KeptIce, deep: boolean): string[] {
    const bears = f.thickness(ICE_BEARS_MM);
    const lines: string[] = [];
    if (ice.mm > 0) {
        lines.push(!deep ? t.kept.bearsShallow() : ice.bears ? t.kept.bearsYes({ bears }) : t.kept.bearsNo({ bears }));
    }
    if (deep && ice.givesWayIn !== undefined) lines.push(t.kept.givesWayIn({ duration: f.duration(ice.givesWayIn) }));
    if (deep && ice.trend === "growing" && !ice.bears) {
        lines.push(
            ice.bearsIn === undefined
                ? t.kept.neverBears({ bears })
                : t.kept.bearsIn({ duration: f.duration(ice.bearsIn) }),
        );
    }
    if (ice.mm > 0) {
        const shack = f.thickness(ICE_SHACK_MM);
        lines.push(ice.shack ? t.kept.shackYes({ shack }) : t.kept.shackNo({ shack }));
    }
    return lines;
}

/** What the current under an ice does to its growth, in the frost; nothing to say on water slow enough. */
export function iceCurrentLine(t: Words, f: CoverFigures, ice: KeptIce, speed: number | undefined): string | undefined {
    if (speed === undefined || ice.currentShare >= 1 || !(ice.temperature !== undefined && ice.temperature < 0)) {
        return undefined;
    }
    const values = { speed: f.speed(speed), open: f.speed(ICE_CURRENT_OPEN_MS) };
    return ice.currentShare <= 0
        ? t.kept.current(values)
        : t.kept.slush({ ...values, percent: f.percent(1 - ice.currentShare) });
}

/** Where a snow is going, in one sentence; nothing without snow. `peak`: the thickest of the map. */
export function snowTrendLine(t: Words, f: CoverFigures, snow: KeptSnow, peak = false): string | undefined {
    const temperature = f.degrees(snow.temperature);
    switch (snow.trend) {
        case "none":
            return undefined;
        case "growing":
            return t.kept.snowBuilding();
        case "holding":
            return t.kept.snowHolding({ temperature });
        case "unknown":
            return t.kept.snowUnknownAir();
        case "thawing": {
            const values = { temperature, rate: f.mm(snow.mmPerHour), duration: f.duration(snow.goneIn) };
            if (snow.meltMmPerHour <= 0) return t.kept.snowWind(values);
            return peak ? t.kept.snowThawingPeak(values) : t.kept.snowThawing(values);
        }
    }
}

/** The clock of the snow and of the ice of a map: real time, or as many times faster as its water. */
export function coverClockLine(t: Words, locale: string, times: number): string {
    return times === 1
        ? t.kept.real()
        : t.kept.fast({ times: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(times) });
}
