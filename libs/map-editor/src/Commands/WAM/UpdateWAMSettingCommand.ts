import type { UpdateWAMSettingsMessage } from "@workadventure/messages";
import type { WAMFileFormat, WAMSettings } from "../../types";
import {
    AIR_LIFE_BOUNDS,
    AutoWeather,
    CategorySettings,
    DEFAULT_AIR_LIFE_SETTINGS,
    DEFAULT_LAND_LIFE_SETTINGS,
    DEFAULT_LIFE_SETTINGS,
    DEFAULT_MEADOW_SETTINGS,
    DEFAULT_WATER_SETTINGS,
    DEFAULT_WAVE_SETTINGS,
    LAND_LIFE_BOUNDS,
    LIFE_BOUNDS,
    MAX_WATER_CURRENT,
    MAX_WATER_INDOOR_DRAIN,
    MAX_WATER_MAX_SURFACE,
    MAX_WATER_SPEED,
    MEADOW_BOUNDS,
    MegaphoneSettings,
    PrefabOverride,
    RecordingSettings,
    WAVE_BOUNDS,
    Weather,
    WeatherLocation,
    WeatherType,
} from "../../types";
import { Command } from "../Command";

const AIR_LIFE_KEYS = ["gullHuntInterval", "gullReproductionDelay", "gullMaxLifespan"] as const;
const LAND_LIFE_KEYS = [
    "antelopeReproductionDelay",
    "antelopeMaxLifespan",
    "landHuntInterval",
    "landPredatorReproductionDelay",
    "landPredatorMaxLifespan",
] as const;

export class UpdateWAMSettingCommand extends Command {
    protected readonly oldConfig: WAMSettings | undefined;
    constructor(
        protected wam: WAMFileFormat,
        protected updateWAMSettingsMessage: UpdateWAMSettingsMessage,
        id?: string,
    ) {
        super(id);
        this.oldConfig = structuredClone(this.wam.settings);
    }

    public execute(): Promise<void> {
        if (this.wam.settings === undefined) {
            this.wam.settings = {};
        }

        const message: UpdateWAMSettingsMessage["message"] = this.updateWAMSettingsMessage.message;
        if (message === undefined) {
            console.warn("Empty settings message received");
            return Promise.resolve();
        }
        switch (message.$case) {
            case "updateMegaphoneSettingMessage": {
                this.wam.settings.megaphone = MegaphoneSettings.optional().parse(
                    message.updateMegaphoneSettingMessage.settings,
                );
                break;
            }
            case "updateRecordingSettingMessage": {
                this.wam.settings.recording = RecordingSettings.optional().parse(
                    message.updateRecordingSettingMessage.settings,
                );
                break;
            }
            case "updatePrefabOverrideSettingMessage": {
                const prefabId = message.updatePrefabOverrideSettingMessage.prefabId;
                const override: unknown = message.updatePrefabOverrideSettingMessage.override;
                const others = Object.fromEntries(
                    Object.entries(this.wam.settings.prefabOverrides ?? {}).filter(([id]) => id !== prefabId),
                );
                this.wam.settings.prefabOverrides =
                    override === undefined || override === null
                        ? others
                        : { ...others, [prefabId]: PrefabOverride.parse(override) };
                break;
            }
            case "updateCategorySettingMessage": {
                const category = message.updateCategorySettingMessage.category.trim().toLocaleLowerCase();
                const settings: unknown = message.updateCategorySettingMessage.settings;
                const others = Object.fromEntries(
                    Object.entries(this.wam.settings.categories ?? {}).filter(([name]) => name !== category),
                );
                this.wam.settings.categories =
                    settings === undefined || settings === null
                        ? others
                        : { ...others, [category]: CategorySettings.parse(settings) };
                break;
            }
            case "updateWeatherSettingMessage": {
                const weather = Weather.parse(message.updateWeatherSettingMessage.weather);
                const previous = this.wam.settings.weather;
                const previousStart = this.wam.settings.weatherStartedAt;
                // The server stamps the change; a client applying its own change first uses its clock until then.
                const changedAt = message.updateWeatherSettingMessage.startedAt ?? Date.now();
                const snowGoesOn = previous === WeatherType.Snow && weather === WeatherType.Snow;
                // A snow chosen again goes on: its ground keeps the snow it already holds.
                this.wam.settings.weatherStartedAt = snowGoesOn ? previousStart : changedAt;
                // A snow that stops leaves its ground to melt (see snowCoverage).
                if (previous === WeatherType.Snow && !snowGoesOn) {
                    this.wam.settings.lastSnow = {
                        ...(previousStart !== undefined ? { startedAt: previousStart } : {}),
                        endedAt: changedAt,
                    };
                }
                this.wam.settings.weather = weather;
                // Back to the default place on request. Otherwise older clients send no place: keep the existing one.
                // A broken place is ignored.
                const location = WeatherLocation.safeParse(message.updateWeatherSettingMessage.location);
                if (message.updateWeatherSettingMessage.clearLocation) {
                    delete this.wam.settings.weatherLocation;
                } else if (location.success) {
                    this.wam.settings.weatherLocation = location.data;
                }
                const { autoFrequency, autoInclude, autoClouds } = message.updateWeatherSettingMessage;
                // Older clients send no auto settings: keep the existing ones. Clouds alike when not sent.
                if (autoFrequency !== undefined && autoFrequency !== "") {
                    const auto = AutoWeather.safeParse({
                        frequency: autoFrequency,
                        include: autoInclude,
                        clouds: autoClouds ?? this.wam.settings.weatherAuto?.clouds,
                    });
                    if (auto.success) {
                        this.wam.settings.weatherAuto = auto.data;
                    }
                }
                break;
            }
            case "updateWaterSettingMessage": {
                const {
                    runoff,
                    evaporation,
                    speed,
                    absorption,
                    current,
                    maxSurface,
                    indoorDrain,
                    inertia,
                    waveRoughness,
                    waveDamping,
                    waveBreaking,
                    waveMomentum,
                } = message.updateWaterSettingMessage;
                const within = (value: number, min: number, max: number, fallback: number): number =>
                    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
                // An older client sends no speed: the one of the map is kept.
                const keptSpeed = this.wam.settings.water?.speed ?? DEFAULT_WATER_SETTINGS.speed;
                const keptAbsorption = this.wam.settings.water?.absorption ?? DEFAULT_WATER_SETTINGS.absorption;
                const keptCurrent = this.wam.settings.water?.current ?? DEFAULT_WATER_SETTINGS.current;
                const keptMaxSurface = this.wam.settings.water?.maxSurface ?? DEFAULT_WATER_SETTINGS.maxSurface;
                const keptIndoorDrain = this.wam.settings.water?.indoorDrain ?? DEFAULT_WATER_SETTINGS.indoorDrain;
                // The waves: what the client sends within its bounds, the rest as the map had it. A map that never
                // set any, from a client that says nothing of them, keeps none.
                const keptWaves = this.wam.settings.water?.waves;
                const sentWaves = {
                    roughness: waveRoughness,
                    damping: waveDamping,
                    breaking: waveBreaking,
                    momentum: waveMomentum,
                };
                const wave = (key: keyof typeof DEFAULT_WAVE_SETTINGS): number => {
                    const kept = keptWaves?.[key] ?? DEFAULT_WAVE_SETTINGS[key];
                    const sent = sentWaves[key];
                    return sent === undefined ? kept : within(sent, WAVE_BOUNDS[key][0], WAVE_BOUNDS[key][1], kept);
                };
                const waves =
                    keptWaves || Object.values(sentWaves).some((sent) => sent !== undefined)
                        ? {
                              roughness: wave("roughness"),
                              damping: wave("damping"),
                              breaking: wave("breaking"),
                              momentum: wave("momentum"),
                          }
                        : undefined;
                this.wam.settings.water = {
                    runoff: within(runoff, 0, 100, DEFAULT_WATER_SETTINGS.runoff),
                    evaporation: within(evaporation, 0, 10, DEFAULT_WATER_SETTINGS.evaporation),
                    speed: speed === undefined ? keptSpeed : within(speed, 1, MAX_WATER_SPEED, keptSpeed),
                    absorption: absorption === undefined ? keptAbsorption : within(absorption, 0, 100, keptAbsorption),
                    current: current === undefined ? keptCurrent : within(current, 0, MAX_WATER_CURRENT, keptCurrent),
                    maxSurface:
                        maxSurface === undefined
                            ? keptMaxSurface
                            : within(
                                  maxSurface,
                                  DEFAULT_WATER_SETTINGS.maxSurface,
                                  MAX_WATER_MAX_SURFACE,
                                  keptMaxSurface,
                              ),
                    indoorDrain:
                        indoorDrain === undefined
                            ? keptIndoorDrain
                            : within(indoorDrain, 0, MAX_WATER_INDOOR_DRAIN, keptIndoorDrain),
                    // An older client says nothing of the inertia: the map keeps the water it had.
                    ...((inertia ?? this.wam.settings.water?.inertia) ? { inertia: true } : {}),
                    ...(waves ? { waves } : {}),
                };
                break;
            }
            case "updateMeadowSettingMessage": {
                const sent = message.updateMeadowSettingMessage;
                const kept = { ...DEFAULT_MEADOW_SETTINGS, ...this.wam.settings.meadow };
                const within = (key: keyof typeof MEADOW_BOUNDS): number => {
                    const [min, max] = MEADOW_BOUNDS[key];
                    const value = sent[key];
                    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : kept[key];
                };
                this.wam.settings.meadow = {
                    enabled: sent.enabled,
                    growMinutes: within("growMinutes"),
                    thirstMinutes: within("thirstMinutes"),
                    moistureHold: within("moistureHold"),
                };
                break;
            }
            case "updateLightingSettingMessage": {
                this.wam.settings.lighting = {
                    energySaving: message.updateLightingSettingMessage.energySaving === true,
                };
                break;
            }
            case "updateLifeSettingMessage": {
                const sent = message.updateLifeSettingMessage;
                const kept = this.wam.settings.life;
                const within = (key: keyof typeof LIFE_BOUNDS): number => {
                    const [min, max] = LIFE_BOUNDS[key];
                    const value = sent[key];
                    // An older client sends neither the dolphin settings nor the drinks of the land animals: those of the map
                    // are kept.
                    if (value === undefined) return kept?.[key] ?? DEFAULT_LIFE_SETTINGS[key];
                    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : DEFAULT_LIFE_SETTINGS[key];
                };
                this.wam.settings.life = {
                    enabled: sent.enabled === true,
                    reproductionDelay: within("reproductionDelay"),
                    maxLifespan: within("maxLifespan"),
                    maxSpeed: within("maxSpeed"),
                    huntInterval: within("huntInterval"),
                    dolphinReproductionDelay: within("dolphinReproductionDelay"),
                    dolphinMaxLifespan: within("dolphinMaxLifespan"),
                    drinkInterval: within("drinkInterval"),
                };
                // The life of the land: what an older client does not send is kept as the map has it.
                const land = this.wam.settings.life;
                const landEnabled = sent.landEnabled ?? kept?.landEnabled;
                if (landEnabled !== undefined) land.landEnabled = landEnabled;
                for (const key of LAND_LIFE_KEYS) {
                    const [min, max] = LAND_LIFE_BOUNDS[key];
                    const value = sent[key];
                    if (value === undefined) {
                        if (kept?.[key] !== undefined) land[key] = kept[key];
                    } else {
                        land[key] = Number.isFinite(value)
                            ? Math.min(max, Math.max(min, value))
                            : DEFAULT_LAND_LIFE_SETTINGS[key];
                    }
                }
                // The gulls, the same way.
                const gullsEnabled = sent.gullsEnabled ?? kept?.gullsEnabled;
                if (gullsEnabled !== undefined) land.gullsEnabled = gullsEnabled;
                for (const key of AIR_LIFE_KEYS) {
                    const [min, max] = AIR_LIFE_BOUNDS[key];
                    const value = sent[key];
                    if (value === undefined) {
                        if (kept?.[key] !== undefined) land[key] = kept[key];
                    } else {
                        land[key] = Number.isFinite(value)
                            ? Math.min(max, Math.max(min, value))
                            : DEFAULT_AIR_LIFE_SETTINGS[key];
                    }
                }
                break;
            }
            default: {
                const _exhaustiveCheck: never = message;
            }
        }
        return Promise.resolve();
    }

    /*undo(): Promise<void> {
        if (this.wam.settings === undefined) {
            this.wam.settings = {};
        }
        if (this.name === "megaphone") {
            this.wam.settings.megaphone = this.oldConfig;
        }
        return Promise.resolve();
    }*/
}
