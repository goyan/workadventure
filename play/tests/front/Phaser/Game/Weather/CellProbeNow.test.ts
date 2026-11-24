import { coldGoneInMinutes, WeatherType } from "@workadventure/map-editor";
import type { ColdMass } from "@workadventure/map-editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealForecastState } from "../../../../../src/front/Phaser/Game/Weather/RealWeather";

const chosen = vi.hoisted(
    (): {
        now: { place: { name: string; latitude: number; longitude: number } | undefined; state: RealForecastState };
    } => ({
        now: { place: undefined, state: { status: "pending" } },
    }),
);
const map = vi.hoisted((): { timeline: RealForecastState } => ({ timeline: { status: "pending" } }));

vi.mock("../../../../../src/front/Phaser/Game/Weather/ChosenPlaceWeather", () => ({
    chosenWeatherNow: () => chosen.now,
}));
vi.mock("../../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({
    shownPlaceTimeline: () => map.timeline,
    shownMapPlace: () => undefined,
    showsChosenPlaceWeather: () => chosen.now.place !== undefined,
    shownWeatherSettings: () => ({ weather: "clear" }),
    mapWeatherSettings: () => ({ weather: "clear" }),
}));

const { nightDateStore } = await import("../../../../../src/front/Stores/NightStore");
const { fireConditionsStore } = await import("../../../../../src/front/Stores/FireConditionsStore");
const { coldLyingStore } = await import("../../../../../src/front/Stores/CatastropheStore");
const { cellProbeNow } = await import("../../../../../src/front/Phaser/Game/Weather/CellProbeNow");
type ProbedScene = Parameters<typeof cellProbeNow>[0];

const NOW = Date.UTC(2026, 0, 10, 6);
const timeline = (temperature: number, humidity: number, windSpeed: number): RealForecastState => ({
    status: "known",
    slots: [{ at: NOW, weather: WeatherType.Clear, temperature, humidity, windSpeed }],
});
const conditions = (windSpeed: number) => ({
    manual: false,
    temperature: 20,
    humidity: 60,
    windSpeed,
    windFrom: 0,
    thresholdTemperature: 30,
    thresholdHumidity: 30,
    thresholdWindSpeed: 30,
});

let second = 0;
function now(): Date {
    const date = new Date(NOW + 1000 * ++second);
    nightDateStore.set(date);
    return date;
}

/** A lake two tiles deep over the whole map, 33 mm of ice on it, as the server told. */
function scene(changes: Partial<ProbedScene> = {}): ProbedScene {
    return {
        terrain: undefined,
        settings: { weather: WeatherType.Clear },
        water: {
            settledDepthAt: () => 58,
            speedAt: () => ({ x: 0, y: 0 }),
            basin: () => undefined,
        } as unknown as ProbedScene["water"],
        meadow: {
            version: () => 1,
            iceAt: () => 33,
            snowAt: () => 0,
            grassAt: () => 0,
            moistureAt: () => 1,
            drynessAt: () => 0,
            fireAt: () => 0,
            ashAt: () => 0,
            catchingUp: () => false,
        } as unknown as ProbedScene["meadow"],
        outdoorAt: () => true,
        iceUnderfoot: () => "thin",
        sunElevation: 20,
        poolAt: () => undefined,
        floorsOver: () => [],
        shadedAt: () => undefined,
        coldMasses: () => [],
        imagePoolAt: () => false,
        ...changes,
    };
}

const POINT = { x: 1000, y: 1000 };
const mass = (temperature: number): ColdMass => ({ id: 1, x: POINT.x, y: POINT.y, radiusTiles: 6, temperature });

beforeEach(() => {
    chosen.now = { place: undefined, state: { status: "pending" } };
    map.timeline = timeline(17.8, 50, 5);
    fireConditionsStore.set(conditions(5));
    coldLyingStore.set(undefined);
});

describe("cellProbeNow", () => {
    it("says the ice of a cell thaws under the mild air of the map", () => {
        const cell = cellProbeNow(scene(), POINT, now());
        expect(cell).toMatchObject({ ground: "map", temperature: 17.8, cold: undefined });
        expect(cell.ice.kept).toMatchObject({ mm: 33, trend: "thawing" });
    });

    it("says the ice of a cell takes under the cold air of a cold snap, though the map is mild", () => {
        // What was seen in the game: a mass held at -80 °C, the pipette saying "thaws" by the 17.8 °C of the map.
        coldLyingStore.set({ celsius: -80, secondsLeft: undefined });
        const cell = cellProbeNow(scene({ coldMasses: () => [mass(-80)] }), POINT, now());
        expect(cell.temperature).toBe(-80);
        expect(cell.cold).toEqual({ mapTemperature: 17.8, goneIn: undefined });
        expect(cell.ice.kept).toMatchObject({ mm: 33, trend: "growing", temperature: -80 });
        expect(cell.ice.kept?.bearsIn).toBeGreaterThan(0);
        // Away from the mass, the air of the map again.
        const away = cellProbeNow(scene({ coldMasses: () => [mass(-80)] }), { x: 5000, y: 5000 }, now());
        expect(away).toMatchObject({ temperature: 17.8, cold: undefined });
        expect(away.ice.kept?.trend).toBe("thawing");
    });

    it("says how long a mass let go still lies there, at the clock of the freeze and the thaw of the map", () => {
        coldLyingStore.set({ celsius: -20, secondsLeft: 120 });
        const probe = (water: { speed?: number; freezeThawSpeed?: number } | undefined) =>
            cellProbeNow(
                scene({ coldMasses: () => [mass(-20)], settings: { weather: WeatherType.Clear, water } }),
                POINT,
                now(),
            ).cold?.goneIn ?? Number.NaN;
        const real = probe(undefined);
        expect(real).toBeCloseTo(coldGoneInMinutes(-20, 17.8, 5) * 60, 6);
        expect(probe({ freezeThawSpeed: 60 })).toBeCloseTo(real / 60, 6);
    });

    it("reads the cold air over a player's own ground too", () => {
        chosen.now = { place: { name: "Oslo", latitude: 59.9, longitude: 10.7 }, state: timeline(5, 60, 0) };
        const cell = cellProbeNow(scene({ coldMasses: () => [mass(-40)] }), POINT, now());
        expect(cell).toMatchObject({ ground: "own", city: "Oslo", temperature: -40 });
        expect(cell.cold?.mapTemperature).toBe(5);
    });

    it("says a pool placed as an object lies over the cell, and the server living its missed time", () => {
        const cell = cellProbeNow(
            scene({
                imagePoolAt: () => true,
                meadow: { ...scene().meadow, catchingUp: () => true } as unknown as ProbedScene["meadow"],
            }),
            POINT,
            now(),
        );
        expect(cell).toMatchObject({ imagePool: true, catchingUp: true });
    });
});
