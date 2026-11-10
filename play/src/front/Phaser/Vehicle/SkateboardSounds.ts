import type * as Phaser from "phaser";
import { get } from "svelte/store";
import { skateboardVolumeStore } from "@wa/front/Stores/SoundEffectsStore";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";

export const SKATEBOARD_SOUNDS = [
    { key: "audio-skateboard", url: "/resources/vehicles/skate.mp3", start: 0.18 },
    { key: "audio-skateboard-indoor", url: "/resources/vehicles/skate_indoor.mp3", start: 0.05 },
];
/** Rendering can run faster than physics; retain audio across frames without a physics step. */
const MOVEMENT_GRACE_MS = 100;
type RollingSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;
export interface SkatingCharacter {
    x: number;
    y: number;
    riding: boolean;
    moving: boolean;
    indoor: boolean;
}

/** Only the local skateboard is audible; movement is independent of the standing avatar's animation. */
export class SkateboardSounds {
    private sound: RollingSound | undefined;
    private soundKey: string | undefined;
    private lastMovementAt = -Infinity;
    private lastPosition: { x: number; y: number } | undefined;

    constructor(private readonly manager: Phaser.Sound.BaseSoundManager) {}

    public update(character: SkatingCharacter, editing: boolean, time: number): void {
        const volume = editing || localUserStore.getBlockAudio() ? 0 : get(skateboardVolumeStore);
        const moved = this.lastPosition
            ? Math.hypot(character.x - this.lastPosition.x, character.y - this.lastPosition.y)
            : 0;
        this.lastPosition = { x: character.x, y: character.y };
        if (moved >= 0.01) this.lastMovementAt = time;
        if (
            !character.riding ||
            !character.moving ||
            time - this.lastMovementAt >= MOVEMENT_GRACE_MS ||
            volume === 0 ||
            this.manager.locked
        ) {
            this.releaseSound();
            return;
        }
        const clip = character.indoor ? SKATEBOARD_SOUNDS[1] : SKATEBOARD_SOUNDS[0];
        const key = clip.key;
        if (this.soundKey !== key) this.releaseSound();
        this.soundKey = key;
        if (!this.sound) {
            this.sound = this.manager.add(key, { loop: true }) as RollingSound;
            // Skip the measured silent lead-in on every loop without recompressing the recording.
            this.sound.addMarker({
                name: key,
                start: clip.start,
                duration: this.sound.duration - clip.start,
                config: { loop: true },
            });
        }
        this.sound.setVolume(volume);
        if (!this.sound.isPlaying) this.sound.play(key);
    }

    private releaseSound(): void {
        this.sound?.destroy();
        this.sound = undefined;
        this.soundKey = undefined;
    }

    public destroy(): void {
        this.releaseSound();
    }
}
