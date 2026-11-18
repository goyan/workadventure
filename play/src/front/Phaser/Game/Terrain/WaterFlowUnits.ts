import { MAX_WATER_FLOW } from "@workadventure/map-editor";

/**
 * The units a flow of water is set in. A flow is stored in litres a minute; `litresAMinute` is what one of the unit
 * is worth, `first` the first step up from nothing.
 */
export const WATER_FLOW_UNITS = [
    { id: "m3h", label: "m³/h", litresAMinute: 1000 / 60, first: 1 },
    { id: "ls", label: "L/s", litresAMinute: 60, first: 1 },
    { id: "lmin", label: "L/min", litresAMinute: 1, first: 1 },
    { id: "m3s", label: "m³/s", litresAMinute: 60_000, first: 0.01 },
] as const;
export type WaterFlowUnitId = (typeof WATER_FLOW_UNITS)[number]["id"];
/** The unit of the dashboard of the water. */
export const DEFAULT_WATER_FLOW_UNIT: WaterFlowUnitId = "m3h";

export function waterFlowUnit(id: string | null | undefined): (typeof WATER_FLOW_UNITS)[number] {
    return WATER_FLOW_UNITS.find((unit) => unit.id === id) ?? WATER_FLOW_UNITS[0];
}

/** A flow stored in litres a minute, as shown in a unit: three decimals at most. */
export function flowInUnit(litresAMinute: number, unit: WaterFlowUnitId): number {
    return Math.round((litresAMinute / waterFlowUnit(unit).litresAMinute) * 1000) / 1000;
}

/** A value typed in a unit, in litres a minute, within the bounds of a flow (nothing for what is not a number). */
export function flowFromUnit(value: number, unit: WaterFlowUnitId): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(MAX_WATER_FLOW, value * waterFlowUnit(unit).litresAMinute);
}

/**
 * The value one press of + (direction 1) or − (direction -1) gives: a step of the size of the value (units under 10,
 * tens under 100, hundreds under 1000…), landing on round values, so that a few presses go from a tap to a river.
 * From nothing, + gives `first`; down to `first`, − gives nothing.
 */
export function steppedFlow(value: number, direction: 1 | -1, first = 1): number {
    if (!Number.isFinite(value) || value <= 0) return direction > 0 ? first : 0;
    const tidy = (result: number): number => Math.max(0, Number(result.toPrecision(6)));
    const size = 10 ** Math.floor(Math.log10(value) + 1e-9);
    const steps = value / size;
    const whole = Math.abs(steps - Math.round(steps)) < 1e-6;
    if (direction > 0) return tidy((whole ? Math.round(steps) + 1 : Math.ceil(steps)) * size);
    if (!whole) return tidy(Math.floor(steps) * size);
    if (Math.abs(value - first) < first * 1e-6) return 0;
    // From 100 down: 90, a step of the size below.
    return tidy(Math.round(steps) === 1 ? value - size / 10 : (Math.round(steps) - 1) * size);
}

/** The positions of the slider of a flow: 0 is nothing, the last one the largest flow. */
export const WATER_FLOW_SLIDER_STEPS = 200;
const SLIDER_DECADES = Math.log10(MAX_WATER_FLOW + 1);

/**
 * The flow (litres a minute) at a position of the slider. The slider is not linear: flows go from a tap to a river,
 * so each step multiplies the flow (by 7.5 %), fine near nothing and coarse near the largest flow.
 */
export function flowAtSlider(position: number): number {
    if (!Number.isFinite(position) || position <= 0) return 0;
    if (position >= WATER_FLOW_SLIDER_STEPS) return MAX_WATER_FLOW;
    return Number((10 ** ((position / WATER_FLOW_SLIDER_STEPS) * SLIDER_DECADES) - 1).toPrecision(3));
}

/** The position of the slider nearest to a flow (litres a minute). */
export function sliderOfFlow(litresAMinute: number): number {
    if (!Number.isFinite(litresAMinute) || litresAMinute <= 0) return 0;
    const position = Math.round((Math.log10(litresAMinute + 1) / SLIDER_DECADES) * WATER_FLOW_SLIDER_STEPS);
    return Math.max(0, Math.min(WATER_FLOW_SLIDER_STEPS, position));
}
