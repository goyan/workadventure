import {
    hoarFrost,
    RAIN_FROM_WET_BULB,
    SNOW_UNDER_WET_BULB,
    snowMeltMmPerHour,
    snowShare,
    snowShareOf,
    soilFrostOf,
    surfaceTemperature,
    wetBulbTemperature,
} from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    DEEP_ICE_PX,
    frostOf,
    iceAt,
    iceOf,
    isFrozen,
    POOL_ICE_DEPTH_PX,
} from "../../../../../src/front/Phaser/Game/Weather/Frost";
import { explainWeather } from "../../../../../src/front/Phaser/Game/Weather/WeatherExplained";
import type { WeatherBoardInput } from "../../../../../src/front/Phaser/Game/Weather/WeatherExplained";

/** A player who follows the server, under a mild and known air of the map; each test changes what it is about. */
function input(changes: Partial<WeatherBoardInput> = {}): WeatherBoardInput {
    const air = { temperature: 12, humidity: 70, windSpeed: 10 };
    return {
        city: undefined,
        drawsOwnWeather: false,
        mapAir: { ...air, byHand: false, place: "Paris" },
        ownAir: undefined,
        precipitationAir: air,
        roomAir: air,
        frostAir: air,
        mapFrostAir: air,
        falling: false,
        mapFalling: false,
        drawn: undefined,
        snow: undefined,
        roomWind: 10,
        ...changes,
    };
}

/** The same player once they follow a city of their own, with its air. */
function followingCity(
    own: { temperature: number; humidity: number | undefined; windSpeed: number | undefined },
    changes: Partial<WeatherBoardInput> = {},
): WeatherBoardInput {
    return input({
        city: "Auckland",
        drawsOwnWeather: true,
        ownAir: { ...own, byHand: false, place: "Auckland" },
        precipitationAir:
            own.humidity === undefined ? undefined : { temperature: own.temperature, humidity: own.humidity },
        frostAir: own,
        ...changes,
    });
}

describe("explainWeather: which air decides, and who sees the same", () => {
    it("gives everything to the air of the map for a player who follows the server", () => {
        const board = explainWeather(input());
        expect(board.follows).toBe("server");
        expect(board.ownAir).toBeUndefined();
        expect(board.precipitation).toMatchObject({ air: "map", audience: "serverFollowers" });
        expect(board.downpour).toMatchObject({ air: "map", audience: "everyone" });
        expect(board.frost).toMatchObject({ air: "map", audience: "serverFollowers" });
        expect(board.ice).toMatchObject({ air: "map", audience: "serverFollowers" });
        expect(board.soil).toMatchObject({ air: "map", audience: "everyone" });
        expect(board.snow).toMatchObject({ air: "map", audience: "serverFollowers", shown: true });
    });

    it("gives the sky and the frost to the player's own air once they follow a city, never the server's part", () => {
        const board = explainWeather(followingCity({ temperature: 3, humidity: 60, windSpeed: 5 }));
        expect(board.follows).toBe("city");
        expect(board.city).toBe("Auckland");
        expect(board.precipitation).toMatchObject({ air: "own", audience: "you" });
        expect(board.frost).toMatchObject({ air: "own", audience: "you" });
        expect(board.ice).toMatchObject({ air: "own", audience: "you" });
        // What the server lets fall and keeps goes by the air of the map, whatever this player follows.
        expect(board.downpour).toMatchObject({ air: "map", audience: "everyone" });
        expect(board.soil).toMatchObject({ air: "map", audience: "everyone" });
        expect(board.snow).toMatchObject({ air: "map", audience: "serverFollowers", shown: false });
    });

    it("keeps the precipitation on the air of the map while a weather is tried in the map settings", () => {
        const board = explainWeather(
            followingCity(
                { temperature: -5, humidity: 80, windSpeed: 0 },
                { drawsOwnWeather: false, precipitationAir: { temperature: 12, humidity: 70 } },
            ),
        );
        expect(board.follows).toBe("trial");
        expect(board.precipitation).toMatchObject({ air: "map", audience: "serverFollowers", form: "rain" });
        // The frost still goes by the city followed, as the ground drawn does.
        expect(board.frost.air).toBe("own");
    });
});

describe("explainWeather: rain or snow", () => {
    it("says rain, by a wet bulb over the threshold, and from which temperature it would snow", () => {
        const { precipitation } = explainWeather(input({ precipitationAir: { temperature: 5, humidity: 80 } }));
        expect(precipitation.form).toBe("rain");
        expect(precipitation.share).toBe(0);
        expect(precipitation.reason).toBe("wetBulbWarm");
        expect(precipitation.wetBulb).toBeCloseTo(wetBulbTemperature(5, 80), 10);
        expect(precipitation.wetBulb).toBeGreaterThan(RAIN_FROM_WET_BULB);
        // Just under the temperature told the real rule gives flakes, just over it none.
        const under = precipitation.snowUnder;
        expect(under).toBeDefined();
        if (under === undefined) return;
        expect(under).toBeLessThan(5);
        expect(snowShare(under - 0.05, 80)).toBeGreaterThan(0);
        expect(snowShare(under + 0.05, 80)).toBe(0);
    });

    it("tells the humidity under which a cold rain would turn to snow, when a drier air is enough", () => {
        const { precipitation } = explainWeather(input({ precipitationAir: { temperature: 3, humidity: 95 } }));
        expect(precipitation.form).toBe("rain");
        const dry = precipitation.snowUnderHumidity;
        expect(dry).toBeDefined();
        if (dry === undefined) return;
        expect(snowShare(3, dry - 1)).toBeGreaterThan(0);
        expect(snowShare(3, dry + 1)).toBe(0);
    });

    it("says snow by a wet bulb under the threshold, and from which temperature it would rain", () => {
        const { precipitation } = explainWeather(input({ precipitationAir: { temperature: -3, humidity: 80 } }));
        expect(precipitation.form).toBe("snow");
        expect(precipitation.share).toBe(1);
        expect(precipitation.reason).toBe("wetBulbCold");
        expect(precipitation.wetBulb).toBeLessThan(SNOW_UNDER_WET_BULB);
        const from = precipitation.rainFrom;
        expect(from).toBeDefined();
        if (from === undefined) return;
        expect(snowShare(from + 0.05, 80)).toBe(0);
        expect(snowShare(from - 0.05, 80)).toBeGreaterThan(0);
    });

    it("says a mix between the two thresholds, with its share of flakes", () => {
        const { precipitation } = explainWeather(input({ precipitationAir: { temperature: 1, humidity: 99 } }));
        expect(precipitation.form).toBe("mix");
        expect(precipitation.reason).toBe("mix");
        expect(precipitation.share).toBe(snowShare(1, 99));
        expect(precipitation.share).toBeGreaterThan(0);
        expect(precipitation.share).toBeLessThan(1);
        const all = precipitation.allSnowUnder;
        expect(all).toBeDefined();
        if (all === undefined) return;
        expect(snowShare(all - 0.05, 99)).toBe(1);
        expect(snowShare(all + 0.05, 99)).toBeLessThan(1);
        expect(precipitation.rainFrom).toBeDefined();
    });

    it("says a mix by an air nearly too mild when the wet bulb alone would give snow", () => {
        const { precipitation } = explainWeather(input({ precipitationAir: { temperature: 5, humidity: 5 } }));
        expect(precipitation).toMatchObject({ form: "mix", reason: "mildMix" });
    });

    it("says an air too mild when the wet bulb alone would give snow", () => {
        // A very dry air at 7 °C: its wet bulb is under the threshold, yet no snow falls on a mild day.
        expect(wetBulbTemperature(7, 5)).toBeLessThan(RAIN_FROM_WET_BULB);
        const { precipitation } = explainWeather(input({ precipitationAir: { temperature: 7, humidity: 5 } }));
        expect(precipitation.form).toBe("rain");
        expect(precipitation.reason).toBe("airMild");
    });

    it("says rain, and why, while the air is not known", () => {
        const { precipitation, downpour } = explainWeather(input({ precipitationAir: undefined, roomAir: undefined }));
        expect(precipitation).toMatchObject({ form: "rain", share: 0, reason: "unknown" });
        expect(precipitation.snowUnder).toBeUndefined();
        expect(downpour).toMatchObject({ form: "rain", share: 0, reason: "unknown" });
    });

    it("tells whether something falls now", () => {
        expect(explainWeather(input({ falling: true })).precipitation.falling).toBe(true);
        expect(explainWeather(input()).precipitation.falling).toBe(false);
    });
});

describe("explainWeather: hoar frost", () => {
    const frostAt = (air: { temperature: number; humidity: number | undefined; windSpeed: number | undefined }) =>
        explainWeather(input({ frostAir: air })).frost;

    it("says frost in a cold, damp and calm air", () => {
        const frost = frostAt({ temperature: -2, humidity: 95, windSpeed: 0 });
        expect(frost.reason).toBe("frost");
        expect(frost.frost).toBe(hoarFrost({ temperature: -2, humidity: 95, windSpeed: 0 }));
        expect(frost.frost).toBeGreaterThanOrEqual(0.5);
        expect(frost.level).toBe("white");
        expect(frost.ground).toBe(surfaceTemperature(-2, 0));
    });

    it("says an air too dry, and the humidity from which it would frost", () => {
        const frost = frostAt({ temperature: -2, humidity: 40, windSpeed: 0 });
        expect(frost).toMatchObject({ frost: 0, level: "none", reason: "dry" });
        expect(frost.frostPoint).toBeLessThan(frost.ground ?? Number.NaN);
        const needed = frost.needsHumidity;
        expect(needed).toBeDefined();
        if (needed === undefined) return;
        expect(needed).toBeGreaterThan(40);
        expect(hoarFrost({ temperature: -2, humidity: needed + 0.5, windSpeed: 0 })).toBeGreaterThan(0);
        expect(hoarFrost({ temperature: -2, humidity: needed - 0.5, windSpeed: 0 })).toBe(0);
        // A calmer air would not help: it is already calm.
        expect(frost.needsWindUnder).toBeUndefined();
    });

    it("says the wind when a calm alone would whiten the ground, and the wind under which it would", () => {
        const frost = frostAt({ temperature: -2, humidity: 95, windSpeed: 40 });
        expect(frost).toMatchObject({ frost: 0, reason: "wind" });
        const calmer = frost.needsWindUnder;
        expect(calmer).toBeDefined();
        if (calmer === undefined) return;
        expect(hoarFrost({ temperature: -2, humidity: 95, windSpeed: calmer - 0.2 })).toBeGreaterThan(0);
        expect(hoarFrost({ temperature: -2, humidity: 95, windSpeed: calmer + 0.2 })).toBe(0);
        // In this wind a damper air would do too.
        const damper = frost.needsHumidity;
        expect(damper).toBeDefined();
        if (damper === undefined) return;
        expect(hoarFrost({ temperature: -2, humidity: damper + 0.5, windSpeed: 40 })).toBeGreaterThan(0);
    });

    it("says a ground too warm over zero, and the air under which the ground would freeze", () => {
        const frost = frostAt({ temperature: 4, humidity: 100, windSpeed: 0 });
        expect(frost).toMatchObject({ frost: 0, reason: "groundWarm" });
        const colder = frost.needsAirUnder;
        expect(colder).toBeDefined();
        if (colder === undefined) return;
        expect(surfaceTemperature(colder - 0.05, 0)).toBeLessThan(0);
        expect(surfaceTemperature(colder + 0.05, 0)).toBeGreaterThanOrEqual(0);
        expect(frost.needsHumidity).toBeUndefined();
    });

    it("says the wind for a ground kept just over zero by it", () => {
        // +0.5 °C: the ground is at -0.3 °C in a calm, at +0.5 °C in a wind.
        expect(frostAt({ temperature: 0.5, humidity: 100, windSpeed: 30 }).reason).toBe("wind");
    });

    it("says colder is not whiter: a very cold air is too dry", () => {
        expect(frostAt({ temperature: -15, humidity: 70, windSpeed: 0 })).toMatchObject({ frost: 0, reason: "dry" });
    });

    it("makes no frost up while the humidity or the temperature is not known", () => {
        expect(frostAt({ temperature: -5, humidity: undefined, windSpeed: 0 })).toMatchObject({
            frost: 0,
            reason: "noHumidity",
        });
        expect(explainWeather(input({ frostAir: undefined })).frost).toMatchObject({ frost: 0, reason: "unknown" });
    });

    it("tells a light frost from a white ground", () => {
        // Just over the humidity from which the rule of the game gives any frost: a thin one.
        const from = frostAt({ temperature: -2, humidity: 40, windSpeed: 0 }).needsHumidity ?? Number.NaN;
        const light = frostAt({ temperature: -2, humidity: from + 0.2, windSpeed: 0 });
        expect(light.frost).toBe(hoarFrost({ temperature: -2, humidity: from + 0.2, windSpeed: 0 }));
        expect(light.frost).toBeGreaterThan(0);
        expect(light.frost).toBeLessThan(0.5);
        expect(light.level).toBe("light");
    });

    it("carries what is drawn now, which lags behind the air", () => {
        const board = explainWeather(
            input({ frostAir: { temperature: -2, humidity: 95, windSpeed: 0 }, drawn: { frost: 0.2, ice: 0 } }),
        );
        expect(board.frost.drawn).toBe(0.2);
        expect(board.ice.drawn).toBe(0);
    });
});

describe("explainWeather: ice on the water", () => {
    const iceUnder = (temperature: number) =>
        explainWeather(input({ frostAir: { temperature, humidity: 50, windSpeed: 0 } })).ice;

    it("says no ice over zero", () => {
        expect(iceUnder(3)).toMatchObject({ ice: 0, stage: "none", reason: "warm" });
    });

    it("says an ice that has not set yet just under zero", () => {
        expect(iceUnder(-0.5)).toMatchObject({ stage: "none", reason: "barely" });
    });

    it("says the shallows, then the pools, then all the water as it gets colder", () => {
        expect(iceUnder(-4)).toMatchObject({ stage: "shallows", reason: "freezing" });
        expect(iceUnder(-10)).toMatchObject({ stage: "pools", reason: "freezing" });
        expect(iceUnder(-15)).toMatchObject({ stage: "all", reason: "freezing" });
    });

    it("tells the temperatures of each stage from the rule of the game itself", () => {
        const { thresholds } = iceUnder(3);
        expect(isFrozen(1, iceAt(thresholds.shallows - 0.05))).toBe(true);
        expect(isFrozen(1, iceAt(thresholds.shallows + 0.05))).toBe(false);
        expect(isFrozen(POOL_ICE_DEPTH_PX, iceAt(thresholds.pools - 0.05))).toBe(true);
        expect(isFrozen(POOL_ICE_DEPTH_PX, iceAt(thresholds.pools + 0.05))).toBe(false);
        expect(isFrozen(DEEP_ICE_PX, iceAt(thresholds.all - 0.05))).toBe(true);
        expect(isFrozen(DEEP_ICE_PX, iceAt(thresholds.all + 0.05))).toBe(false);
        expect(thresholds.shallows).toBeGreaterThan(thresholds.pools);
        expect(thresholds.pools).toBeGreaterThan(thresholds.all);
    });

    it("says no ice while the temperature is not known", () => {
        expect(explainWeather(input({ frostAir: undefined })).ice).toMatchObject({
            ice: 0,
            stage: "none",
            reason: "unknown",
        });
    });
});

describe("explainWeather: frozen soil", () => {
    const soilUnder = (temperature: number) => explainWeather(input({ roomAir: { temperature, humidity: 60 } })).soil;

    it("says thawed, partly frozen and frozen", () => {
        expect(soilUnder(5)).toMatchObject({ frost: 0, reason: "thawed" });
        expect(soilUnder(0)).toMatchObject({ frost: 0.5, reason: "partly" });
        expect(soilUnder(-4)).toMatchObject({ frost: 1, reason: "frozen" });
    });

    it("says not frozen while the air of the map is not known, as the server does", () => {
        expect(explainWeather(input({ roomAir: undefined })).soil).toMatchObject({ frost: 0, reason: "unknown" });
    });
});

describe("explainWeather: snow on the ground", () => {
    it("says nothing is known until the server told the ground of the map", () => {
        expect(explainWeather(input()).snow).toMatchObject({ known: false, trend: "none" });
    });

    it("says the snow the server keeps, on the map and under the avatar", () => {
        const { snow } = explainWeather(input({ snow: { map: 0.4, here: 1 } }));
        expect(snow).toMatchObject({ known: true, mapCover: 0.4, hereCover: 1, shown: true });
    });

    it("says it builds up while a snow falls on the map", () => {
        const { snow } = explainWeather(
            input({ roomAir: { temperature: -3, humidity: 80 }, mapFalling: true, snow: { map: 0.1, here: 0 } }),
        );
        expect(snow.trend).toBe("building");
        expect(snow.snowShare).toBe(1);
    });

    it("says it melts over zero, and how long a white ground lasts, from the rule of the server", () => {
        const { snow } = explainWeather(
            input({ roomAir: { temperature: 10, humidity: 50 }, roomWind: 0, snow: { map: 1, here: 1 } }),
        );
        expect(snow.trend).toBe("melting");
        // 15 mm at 10 °C without wind, 600 times faster than the real clock: about a minute (Terrain/Snow.ts).
        expect(snow.whiteGroundMeltsIn).toBeGreaterThan(30);
        expect(snow.whiteGroundMeltsIn).toBeLessThan(90);
        expect(snowMeltMmPerHour({ temperature: 10, humidity: 50, windSpeed: 0 })).toBeGreaterThan(0);
    });

    it("says it holds at zero and under", () => {
        const { snow } = explainWeather(
            input({ roomAir: { temperature: -1, humidity: 50 }, snow: { map: 1, here: 1 } }),
        );
        expect(snow.trend).toBe("holding");
        expect(snow.whiteGroundMeltsIn).toBeUndefined();
    });

    it("says a player who follows a city does not see it", () => {
        const { snow } = explainWeather(
            followingCity({ temperature: 20, humidity: 50, windSpeed: 5 }, { snow: { map: 0.8, here: 1 } }),
        );
        expect(snow).toMatchObject({ known: true, mapCover: 0.8, shown: false });
    });
});

describe("explainWeather: the case that asked for this board", () => {
    // The city of the server is warm; the player follows a cold, dry and windy city; they launch a downpour.
    const board = explainWeather(
        followingCity(
            { temperature: -3, humidity: 45, windSpeed: 40 },
            {
                mapAir: { temperature: 24, humidity: 55, windSpeed: 12, byHand: false, place: "Dakar" },
                roomAir: { temperature: 24, humidity: 55 },
                mapFrostAir: { temperature: 24, humidity: 55, windSpeed: 12 },
                falling: false,
            },
        ),
    );

    it("says no frost: their own air is cold but too dry, for them alone", () => {
        expect(board.frost).toMatchObject({ air: "own", audience: "you", frost: 0, level: "none", reason: "dry" });
        expect(board.frost.temperature).toBe(-3);
        expect(board.frost.needsHumidity).toBeGreaterThan(45);
    });

    it("says the downpour falls as rain: it goes by the warm air of the map, for everyone", () => {
        expect(board.downpour).toMatchObject({
            air: "map",
            audience: "everyone",
            form: "rain",
            share: 0,
            temperature: 24,
        });
    });

    it("says their own precipitation would be snow, for them alone", () => {
        expect(board.precipitation).toMatchObject({ air: "own", audience: "you", form: "snow" });
    });

    it("says where their screen and the map part: the form of what would fall, not the frost", () => {
        expect(board.precipitation.differs).toBe(true);
        expect(board.precipitation.onMap).toMatchObject({ form: "rain", falling: false });
        // No frost on either side, for two reasons: too dry for them, too warm on the map.
        expect(board.frost.differs).toBe(false);
        expect(board.frost.onMap).toMatchObject({ level: "none", reason: "groundWarm" });
        // The edges of their water freeze at -3 °C; the water of the map does not.
        expect(board.ice).toMatchObject({ stage: "shallows", differs: true });
        expect(board.ice.onMap).toMatchObject({ stage: "none" });
    });

    it("shows both airs side by side", () => {
        expect(board.mapAir).toMatchObject({ temperature: 24, place: "Dakar" });
        expect(board.ownAir).toMatchObject({ temperature: -3, place: "Auckland" });
    });
});

describe("explainWeather: the player's screen against the map of the server", () => {
    const cold = { temperature: -3, humidity: 95, windSpeed: 2 };
    const warm = { temperature: 24, humidity: 55, windSpeed: 12 };

    it("sets nothing against the map for a player who follows the server", () => {
        const board = explainWeather(
            input({ frostAir: cold, mapFrostAir: cold, precipitationAir: cold, roomAir: cold }),
        );
        expect(board.precipitation.onMap).toBeUndefined();
        expect(board.frost.onMap).toBeUndefined();
        expect(board.ice.onMap).toBeUndefined();
        expect(board.precipitation.differs).toBe(false);
        expect(board.frost.differs).toBe(false);
        expect(board.ice.differs).toBe(false);
    });

    it("warm server, cold player: snow, frost and ice for them alone; rain and a thawed soil on the map", () => {
        const board = explainWeather(
            followingCity(cold, {
                mapAir: { ...warm, byHand: false, place: "Dakar" },
                roomAir: warm,
                mapFrostAir: warm,
                falling: true,
                mapFalling: true,
            }),
        );
        expect(board.precipitation).toMatchObject({ air: "own", form: "snow", falling: true, differs: true });
        expect(board.precipitation.onMap).toMatchObject({
            air: "map",
            audience: "serverFollowers",
            form: "rain",
            falling: true,
            temperature: 24,
        });
        expect(board.frost).toMatchObject({ air: "own", reason: "frost", differs: true });
        expect(board.frost.onMap).toMatchObject({ air: "map", level: "none", reason: "groundWarm", temperature: 24 });
        expect(board.ice).toMatchObject({ air: "own", stage: "shallows", differs: true });
        expect(board.ice.onMap).toMatchObject({ air: "map", stage: "none", reason: "warm" });
        // What the server works out goes by its own air, whatever the screen of this player shows.
        expect(board.downpour).toMatchObject({ form: "rain", temperature: 24 });
        expect(board.soil).toMatchObject({ reason: "thawed", temperature: 24 });
    });

    it("cold server, warm player: rain and no frost for them alone; snow, frost and a frozen soil on the map", () => {
        const board = explainWeather(
            followingCity(warm, {
                mapAir: { ...cold, byHand: false, place: "Oslo" },
                roomAir: cold,
                mapFrostAir: cold,
                falling: false,
                mapFalling: true,
                snow: { map: 0.6, here: 1 },
            }),
        );
        expect(board.precipitation).toMatchObject({ air: "own", form: "rain", falling: false, differs: true });
        expect(board.precipitation.onMap).toMatchObject({ form: "snow", falling: true });
        expect(board.frost).toMatchObject({ level: "none", reason: "groundWarm", differs: true });
        expect(board.frost.onMap).toMatchObject({ reason: "frost" });
        expect(board.frost.onMap?.frost).toBe(frostOf(cold));
        expect(board.ice).toMatchObject({ stage: "none", differs: true });
        expect(board.ice.onMap).toMatchObject({ stage: "shallows" });
        expect(board.ice.onMap?.ice).toBe(iceOf(cold));
        expect(board.downpour).toMatchObject({ form: "snow" });
        expect(board.soil).toMatchObject({ reason: "frozen", temperature: -3 });
        expect(board.snow).toMatchObject({ shown: false, mapCover: 0.6, trend: "building" });
    });

    it("says no gap when both airs give the same thing, though they are not the same air", () => {
        const board = explainWeather(
            followingCity({ temperature: 15, humidity: 40, windSpeed: 30 }, { roomAir: warm, mapFrostAir: warm }),
        );
        expect(board.precipitation.onMap).toBeDefined();
        expect(board.precipitation.differs).toBe(false);
        expect(board.frost.differs).toBe(false);
        expect(board.ice.differs).toBe(false);
    });

    it("tells a gap when the same nothing falls but would not fall the same", () => {
        // Nothing falls on either side, yet a downpour launched now is a rain where their own sky would snow.
        const board = explainWeather(
            followingCity({ temperature: -3, humidity: 45, windSpeed: 40 }, { roomAir: warm }),
        );
        expect(board.precipitation).toMatchObject({ falling: false, form: "snow", differs: true });
        expect(board.precipitation.onMap).toMatchObject({ falling: false, form: "rain" });
    });

    it("keeps the frost against the map while a weather is tried, the precipitation being the map's already", () => {
        const board = explainWeather(
            followingCity(cold, {
                drawsOwnWeather: false,
                precipitationAir: warm,
                roomAir: warm,
                mapFrostAir: warm,
            }),
        );
        expect(board.precipitation.onMap).toBeUndefined();
        expect(board.frost.onMap).toMatchObject({ level: "none" });
        expect(board.frost.differs).toBe(true);
    });
});

describe("explainWeather: never another value than the game's", () => {
    const temperatures = [-30, -15, -8, -3, -1.2, -0.4, 0, 0.3, 0.9, 1.5, 2, 3.5, 5, 6, 12, 30];
    const humidities = [undefined, 0, 20, 45, 70, 91, 99, 100];
    const winds = [undefined, 0, 6, 10, 18, 40];

    it("explains the very values the rules of the game give, over a grid of airs", () => {
        for (const temperature of temperatures) {
            for (const humidity of humidities) {
                for (const windSpeed of winds) {
                    const air = { temperature, humidity, windSpeed };
                    const falls = humidity === undefined ? undefined : { temperature, humidity };
                    const board = explainWeather(
                        input({ precipitationAir: falls, roomAir: falls, frostAir: air, mapFrostAir: air }),
                    );
                    // Drops or flakes of the sky: GameScene.getSnowShare.
                    expect(board.precipitation.share).toBe(snowShareOf(falls));
                    // The downpour: GameScene, DownpourView.
                    expect(board.downpour.share).toBe(snowShareOf(falls));
                    // The frost and the ice the water cycle goes towards: Frost.waterCycleNow.
                    expect(board.frost.frost).toBe(frostOf(air));
                    expect(board.ice.ice).toBe(iceOf(air));
                    // The soil of the server: MeadowManager.
                    expect(board.soil.frost).toBe(soilFrostOf(falls));
                    // A reason never contradicts the value.
                    expect(board.frost.reason === "frost").toBe(board.frost.frost > 0);
                    expect(board.precipitation.form === "rain").toBe(board.precipitation.share === 0);
                    expect(board.precipitation.form === "snow").toBe(board.precipitation.share === 1);
                    // What would change it is only told where it does not hold.
                    if (board.frost.frost > 0) {
                        expect(board.frost.needsHumidity).toBeUndefined();
                        expect(board.frost.needsWindUnder).toBeUndefined();
                    }
                }
            }
        }
    });

    it("tells the frost the game computes for an air: the helpers of Frost are the ones its cycle uses", () => {
        expect(frostOf({ temperature: -2, humidity: 95, windSpeed: 0 })).toBe(
            hoarFrost({ temperature: -2, humidity: 95, windSpeed: 0 }),
        );
        expect(frostOf({ temperature: -2, humidity: undefined, windSpeed: 0 })).toBe(0);
        expect(frostOf(undefined)).toBe(0);
        expect(iceOf({ temperature: -15, humidity: undefined, windSpeed: undefined })).toBe(iceAt(-15));
        expect(iceOf(undefined)).toBe(0);
    });
});
