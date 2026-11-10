import { FOOTSTEP_MAX_VOLUME } from "../../Phaser/Game/FootstepSounds";
import { DOOR_MAX_VOLUME, DOOR_SOUND_URLS } from "../../Phaser/Game/MapEditor/MapLayer/DoorAnimator";
import { NERF_MAX_VOLUME, NERF_SOUND_URL } from "../../Phaser/Game/Nerf/NerfProtocol";

/** The families of sound effects that have a typical sound to listen to (the map's own sounds have none). */
export type PreviewedSoundFamily = "footsteps" | "skateboard" | "weather" | "doors" | "nerf" | "notifications";

/**
 * An example per family, at the loudness the game uses for it: the slider then sounds as it will in game.
 * Looping sounds (skateboard, rain) are cut after `durationMs`.
 */
export const SOUND_PREVIEWS: Record<
    PreviewedSoundFamily,
    { url: string; baseVolume: number; durationMs?: number; startAt?: number }
> = {
    footsteps: { url: "/resources/objects/footsteps/wood-0.ogg", baseVolume: FOOTSTEP_MAX_VOLUME },
    skateboard: { url: "/resources/vehicles/skate.mp3", baseVolume: 1, durationMs: 1500, startAt: 0.18 },
    // WeatherSounds plays the rain at 14 % of the weather volume.
    weather: { url: "/resources/objects/weather/rain.mp3", baseVolume: 0.14, durationMs: 3000 },
    doors: { url: DOOR_SOUND_URLS.open, baseVolume: DOOR_MAX_VOLUME },
    nerf: { url: NERF_SOUND_URL, baseVolume: NERF_MAX_VOLUME },
    // GameScene.playSound plays notification sounds at 20 %.
    notifications: { url: "/resources/objects/new-message.mp3", baseVolume: 0.2 },
};

/** Plays one example at a time: starting another one, or a volume of 0, stops the current one. */
export function createSoundPreview(createAudio: (url: string) => HTMLAudioElement = (url) => new Audio(url)) {
    let current: HTMLAudioElement | undefined;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = undefined;
        current?.pause();
        current = undefined;
    };
    return {
        play(family: PreviewedSoundFamily, volume: number): void {
            stop();
            if (volume <= 0) return;
            const { url, baseVolume, durationMs, startAt } = SOUND_PREVIEWS[family];
            const audio = createAudio(url);
            audio.volume = Math.min(1, baseVolume * volume);
            if (startAt) audio.currentTime = startAt;
            current = audio;
            audio.play().catch((error: unknown) => console.warn("Could not play the sound preview", error));
            if (durationMs) stopTimer = setTimeout(stop, durationMs);
        },
        stop,
    };
}
