import { metresOf } from "@workadventure/map-editor";
import type { CellExplained } from "@wa/front/Phaser/Game/Weather/CellExplained";
import type { AirOwner, Audience } from "@wa/front/Phaser/Game/Weather/WeatherExplained";
import { metresLabel } from "@wa/front/Phaser/Game/Floors/AvatarAltitude";
import { compassPointOf } from "@wa/front/Phaser/Game/Weather/WindDirection";
import type { TranslationFunctions } from "../../../i18n/i18n-types";
import {
    coverClockLine,
    coverFigures,
    iceBearingLines,
    iceCurrentLine,
    iceTrendLine,
    snowTrendLine,
} from "./coverText";

/**
 * What the weather pipette says of the cell under the pointer, in short sentences: the state first, then its cause,
 * then where it goes. Only words: every figure comes from CellExplained.
 */
export interface PipetteSection {
    id: "relief" | "water" | "ice" | "snow" | "frost" | "meadow" | "sun";
    title: string;
    lines: string[];
    /** Whose air decides and who sees the same, where it is worth saying. */
    owner?: AirOwner;
    audience?: Audience;
}

/** From this much the ground reads as frosted, the grass as dry: under it the eye tells nothing. */
const TOLD_SHARE = 0.03;

export function pipetteSections(ll: TranslationFunctions, locale: string, cell: CellExplained): PipetteSection[] {
    const t = ll.actionbar.visualisation.weather;
    const p = t.pipette;
    const f = coverFigures(t, locale);
    const { reading, water, ice, snow } = cell;

    const soil =
        reading.soil === "pool" ? ll.mapEditor.terrain.pool() : ll.mapEditor.terrain.soils[reading.soil ?? "earth"]();
    const relief: string[] = [
        p.ground({ altitude: metresLabel(reading.ground, locale), soil }),
        cell.outdoor ? p.outdoor() : p.indoor(),
        // What is drawn over the cell: the pipette reads the ground, not the floor over it.
        ...cell.floorsOver.map((elevation) => p.floorOver({ altitude: metresLabel(metresOf(elevation), locale) })),
    ];

    const wet: string[] = [];
    if (!water || reading.depth === undefined || reading.surface === undefined) {
        wet.push(p.waterNone());
    } else {
        wet.push(
            p.waterDepth({
                depth: metresLabel(reading.depth, locale, false),
                surface: metresLabel(reading.surface, locale),
            }),
            water.deep ? p.deep() : p.shallow(),
        );
        if (cell.hotPool) wet.push(p.hotPool());
        if (water.run === "unknown" || water.speed === undefined) wet.push(p.runUnknown());
        else if (water.run === "still") wet.push(p.still());
        else {
            const point = water.heading === undefined ? undefined : compassPointOf(water.heading);
            wet.push(
                p.runs({
                    speed: f.speed(water.speed),
                    heading: point ? ll.actionbar.weatherBanner.windPoint[point]() : "?",
                }),
            );
        }
    }

    const frozen: string[] = [];
    if (ice.why === "noWater") frozen.push(p.iceNoWater());
    else if (ice.why === "indoor") frozen.push(p.iceIndoor());
    else if (ice.why === "hotPool") frozen.push(p.iceHotPool());
    else if (ice.kept) {
        const kept = ice.kept;
        frozen.push(kept.mm > 0 ? t.kept.iceHere({ thickness: f.thickness(kept.mm) }) : t.kept.iceNone());
        // A water running too fast to freeze over says so in place of "the ice begins to take".
        if (cell.catchingUp && kept.mm > 0) {
            // The thickness is true; where it goes is not known while the server lives the time the room missed.
            frozen.push(t.kept.catchingUp());
            frozen.push(
                ...iceBearingLines(t, f, { ...kept, givesWayIn: undefined, trend: "unknown" }, water?.deep ?? false),
            );
        } else {
            const current = iceCurrentLine(t, f, kept, water?.speed);
            if (!(ice.why === "current" && current)) frozen.push(iceTrendLine(t, f, kept));
            if (current) frozen.push(current);
            if (kept.trend === "growing" && snow.kept.mm > 0) frozen.push(t.kept.underSnow());
            frozen.push(...iceBearingLines(t, f, kept, water?.deep ?? false));
        }
    } else {
        // A ground of their own without ice kept tile by tile: the ice of the cold of their city.
        if (ice.hold === "none") frozen.push(t.kept.iceNone());
        else frozen.push(ice.hold === "solid" ? p.holdSolid() : p.holdThin());
        frozen.push(p.iceOwn());
    }

    const white: string[] = [
        snow.kept.mm > 0
            ? t.kept.snowHere({ mm: f.mm(snow.kept.mm), percent: f.percent(snow.cover) })
            : t.kept.snowNone(),
    ];
    const snowTrend = cell.catchingUp && snow.kept.mm > 0 ? t.kept.catchingUp() : snowTrendLine(t, f, snow.kept);
    if (snowTrend) white.push(snowTrend);

    const cold: string[] = [
        cell.frost >= TOLD_SHARE ? p.frost({ percent: f.percent(cell.frost) }) : p.frostNone(),
        p.frostWho(),
        cell.soilFrost > 0 ? p.soilFrozen({ percent: f.percent(cell.soilFrost) }) : p.soilThawed(),
        p.soilWho(),
    ];

    const grass: string[] = [];
    // Under water there is no grass to tell; a ground not kept tile by tile says so.
    if (!cell.meadow) {
        if (!water) grass.push(p.meadowNone());
    } else {
        grass.push(p.grass({ grass: f.percent(cell.meadow.grass), moisture: f.percent(cell.meadow.moisture) }));
        if (cell.meadow.dryness >= TOLD_SHARE) grass.push(p.dry({ percent: f.percent(cell.meadow.dryness) }));
        if (cell.meadow.fire > 0) grass.push(p.fire());
        if (cell.meadow.ash > 0) grass.push(p.ash());
    }

    const sky: string[] = [
        cell.sunElevation === undefined
            ? p.sunUnknown()
            : cell.sunElevation > 0
              ? p.sunUp({ degrees: f.percent(cell.sunElevation / 100) })
              : p.sunDown(),
    ];
    if (cell.shaded !== undefined && (cell.sunElevation ?? 0) > 0) sky.push(cell.shaded ? p.shaded() : p.sunlit());
    // Where something thaws, what the thaw goes by: the air alone, at the clock of the water of the map.
    if ((ice.kept?.mm ?? 0) > 0 || snow.kept.mm > 0) sky.push(t.kept.onlyAir(), coverClockLine(t, locale, cell.times));

    return [
        { id: "relief", title: p.relief(), lines: relief },
        { id: "water", title: p.water(), lines: wet },
        { id: "ice", title: p.ice(), lines: frozen, owner: cell.ground, audience: cell.audience },
        { id: "snow", title: p.snow(), lines: white, owner: cell.ground, audience: cell.audience },
        { id: "frost", title: p.frostSoil(), lines: cold },
        ...(grass.length > 0
            ? [{ id: "meadow" as const, title: p.meadow(), lines: grass, owner: cell.ground, audience: cell.audience }]
            : []),
        { id: "sun", title: p.sun(), lines: sky },
    ];
}
