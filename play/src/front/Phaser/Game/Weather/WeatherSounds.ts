import type * as Phaser from "phaser";
import { WeatherType } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { environmentVolumeStore } from "../../../Stores/SoundEffectsStore";

export const WEATHER_SOUNDS = [
    { key: "audio-weather-sunny", url: "/resources/objects/weather/sunny.mp3" },
    { key: "audio-weather-snow", url: "/resources/objects/weather/snow.mp3" },
    { key: "audio-weather-rain", url: "/resources/objects/weather/rain.mp3" },
    { key: "audio-weather-thunder", url: "/resources/objects/weather/thunder.mp3" },
];

type WeatherSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

export class WeatherSounds {
    private ambient: WeatherSound | undefined;
    private ambientKey: string | undefined;
    private thunder: WeatherSound | undefined;
    private lastStormCycle: number | undefined;

    constructor(private readonly sound: Phaser.Sound.BaseSoundManager) {}

    public update(weather: WeatherType, serverDate: Date | undefined, editing: boolean): void {
        const volume = editing || localUserStore.getBlockAudio() ? 0 : get(environmentVolumeStore);
        if (volume === 0) {
            this.ambient?.stop();
            this.thunder?.stop();
            this.lastStormCycle = undefined;
            return;
        }
        if (this.sound.locked) return;
        const key =
            weather === WeatherType.Clear
                ? "audio-weather-sunny"
                : weather === WeatherType.Snow
                  ? "audio-weather-snow"
                  : "audio-weather-rain";
        if (this.ambientKey !== key) {
            this.ambient?.destroy();
            this.ambient = undefined;
            this.ambientKey = key;
        }
        this.ambient ??= this.sound.add(key, { loop: true }) as WeatherSound;
        this.ambient.setVolume(volume * (weather === WeatherType.Storm ? 0.22 : 0.14));
        if (!this.ambient.isPlaying) this.ambient.play();
        if (weather !== WeatherType.Storm || !serverDate) {
            this.thunder?.stop();
            this.lastStormCycle = undefined;
            return;
        }
        this.thunder?.setVolume(volume * 0.3);
        const epoch = serverDate.getTime();
        const cycle = Math.floor(epoch / 23000);
        // Thunder follows the shared glow; joining midway never replays an old strike.
        if (epoch % 23000 >= 1800 && epoch % 23000 < 2800 && cycle !== this.lastStormCycle) {
            this.lastStormCycle = cycle;
            this.thunder ??= this.sound.add("audio-weather-thunder") as WeatherSound;
            this.thunder.setVolume(volume * 0.3);
            this.thunder.play();
        }
    }

    public destroy(): void {
        this.ambient?.destroy();
        this.thunder?.destroy();
    }
}
