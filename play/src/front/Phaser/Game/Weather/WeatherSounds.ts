import type * as Phaser from "phaser";
import { WeatherType } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { environmentVolumeStore } from "../../../Stores/SoundEffectsStore";

export const WEATHER_SOUNDS = [
    { key: "audio-weather-rain", url: "/resources/objects/weather/rain.wav" },
    { key: "audio-weather-thunder", url: "/resources/objects/weather/thunder.wav" },
];

type WeatherSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

export class WeatherSounds {
    private rain: WeatherSound | undefined;
    private thunder: WeatherSound | undefined;
    private lastStormCycle: number | undefined;

    constructor(private readonly sound: Phaser.Sound.BaseSoundManager) {}

    public update(weather: WeatherType, serverDate: Date | undefined, editing: boolean): void {
        const volume = editing || localUserStore.getBlockAudio() ? 0 : get(environmentVolumeStore);
        const raining = weather === WeatherType.Rain || weather === WeatherType.Storm;
        if (!raining || volume === 0) {
            this.rain?.stop();
            this.thunder?.stop();
            this.lastStormCycle = undefined;
            return;
        }
        if (this.sound.locked) return;
        this.rain ??= this.sound.add("audio-weather-rain", { loop: true }) as WeatherSound;
        this.rain.setVolume(volume * (weather === WeatherType.Storm ? 0.22 : 0.14));
        if (!this.rain.isPlaying) this.rain.play();
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
        this.rain?.destroy();
        this.thunder?.destroy();
    }
}
