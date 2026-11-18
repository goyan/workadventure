import type { UpdateWAMSettingsMessage } from "@workadventure/messages";
import type { WAMFileFormat, WAMSettings } from "../../types";
import {
    AutoWeather,
    CategorySettings,
    MegaphoneSettings,
    PrefabOverride,
    RecordingSettings,
    Weather,
    WeatherLocation,
    WeatherType,
} from "../../types";
import { Command } from "../Command";

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
