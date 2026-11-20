import type * as Phaser from "phaser";
import { get } from "svelte/store";
import { airplaneVolumeStore } from "@wa/front/Stores/SoundEffectsStore";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";

export const AIRPLANE_SOUND = { key: "audio-airplane", url: "/resources/vehicles/small_plane.mp3" };
type EngineSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

/** Local engine only, including the coast and automatic landing after releasing the keys. */
export class AirplaneSounds {
    private sound: EngineSound | undefined;

    constructor(private readonly manager: Phaser.Sound.BaseSoundManager) {}

    public update(riding: boolean, editing: boolean): void {
        const volume = editing || localUserStore.getBlockAudio() ? 0 : get(airplaneVolumeStore);
        if (!riding || volume === 0 || this.manager.locked) {
            this.destroy();
            return;
        }
        this.sound ??= this.manager.add(AIRPLANE_SOUND.key, { loop: true }) as EngineSound;
        this.sound.setVolume(volume);
        if (!this.sound.isPlaying) this.sound.play();
    }

    public destroy(): void {
        this.sound?.destroy();
        this.sound = undefined;
    }
}
