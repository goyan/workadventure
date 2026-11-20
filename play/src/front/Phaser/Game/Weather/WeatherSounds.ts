import type * as Phaser from "phaser";
import { WeatherType } from "@workadventure/map-editor";
import { get, type Unsubscriber } from "svelte/store";
import Debug from "debug";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { weatherVolumeStore } from "../../../Stores/SoundEffectsStore";
import { basicActiveStore, isBasicActive } from "../../../Stores/BasicModeStore";
import { lastStrike } from "./WeatherFrame";
import { rainLoudness, USUAL_RAIN } from "./Rain";

export const WEATHER_SOUNDS = [
    { key: "audio-weather-night-rain", url: "/resources/objects/weather/night_rain.mp3" },
    { key: "audio-weather-night", url: "/resources/objects/weather/night.mp3" },
    { key: "audio-weather-sunny", url: "/resources/objects/weather/sunny.mp3" },
    { key: "audio-weather-snow", url: "/resources/objects/weather/snow.mp3" },
    { key: "audio-weather-rain", url: "/resources/objects/weather/rain.mp3" },
    { key: "audio-weather-thunder", url: "/resources/objects/weather/thunder.mp3" },
];

const debug = Debug("front:weather-audio");

type WeatherSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

export class WeatherSounds {
    private ambient: HTMLAudioElement | undefined;
    private ambientKey: string | undefined;
    private playPending = false;
    private thunder: WeatherSound | undefined;
    private lastStormCycle: number | undefined;

    /** Basique silences the weather at once, before the next update (which may come seconds later). */
    private readonly unsubscribeBasic: Unsubscriber;

    constructor(private readonly sound: Phaser.Sound.BaseSoundManager) {
        this.unsubscribeBasic = basicActiveStore.subscribe((basic) => {
            if (basic) this.silence();
        });
    }

    /** `rain`: how hard a rain falls, 0 to 1 (rainIntensity), which sets how loud it is. */
    public update(
        weather: WeatherType,
        serverDate: Date | undefined,
        editing: boolean,
        night = false,
        rain = USUAL_RAIN,
    ): void {
        if (isBasicActive()) {
            this.silence();
            return;
        }
        const volume = editing || localUserStore.getBlockAudio() ? 0 : get(weatherVolumeStore);
        if (volume === 0) {
            this.ambient?.pause();
            this.thunder?.stop();
            this.lastStormCycle = undefined;
            return;
        }
        if (this.sound.locked) return;
        const key =
            weather === WeatherType.Clear || weather === WeatherType.Fog
                ? night
                    ? "audio-weather-night"
                    : "audio-weather-sunny"
                : weather === WeatherType.Snow
                  ? "audio-weather-snow"
                  : night
                    ? "audio-weather-night-rain"
                    : "audio-weather-rain";
        if (this.ambientKey !== key) {
            this.releaseAmbient();
            this.ambient = undefined;
            this.ambientKey = key;
        }
        if (!this.ambient) {
            const asset = WEATHER_SOUNDS.find((asset) => asset.key === key);
            if (!asset) return;
            this.ambient = new Audio(asset.url);
            this.ambient.loop = true;
            this.ambient.preload = "none";
        }
        this.ambient.volume =
            volume * (weather === WeatherType.Storm ? 0.22 : weather === WeatherType.Rain ? rainLoudness(rain) : 0.14);
        if (this.ambient.paused && !this.playPending) {
            this.playPending = true;
            this.ambient
                .play()
                .catch((error: unknown) => debug("Ambience playback postponed", error))
                .finally(() => {
                    this.playPending = false;
                });
        }
        if (weather !== WeatherType.Storm || !serverDate) {
            this.thunder?.stop();
            this.lastStormCycle = undefined;
            return;
        }
        this.thunder?.setVolume(volume * 0.3);
        const epoch = serverDate.getTime();
        const strike = lastStrike(epoch);
        const since = epoch - strike.at;
        // Thunder comes 1.8 s after the shared strike; joining midway never replays an old strike.
        if (since >= 1800 && since < 2800 && strike.at !== this.lastStormCycle) {
            this.lastStormCycle = strike.at;
            this.thunder ??= this.sound.add("audio-weather-thunder") as WeatherSound;
            this.thunder.setVolume(volume * 0.3);
            this.thunder.play();
        }
    }

    /** No sound at all, and none that a click could play again: the ambience is let go, not only paused. */
    private silence(): void {
        this.releaseAmbient();
        this.ambientKey = undefined;
        this.thunder?.stop();
        this.lastStormCycle = undefined;
    }

    private releaseAmbient(): void {
        this.ambient?.pause();
        this.ambient?.removeAttribute("src");
        this.ambient?.load();
        this.ambient = undefined;
        this.playPending = false;
    }

    public destroy(): void {
        this.unsubscribeBasic();
        this.releaseAmbient();
        this.thunder?.destroy();
    }
}
