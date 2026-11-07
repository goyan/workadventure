import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { WeatherType } from "@workadventure/map-editor";
import { environmentVolumeStore } from "../../../../../src/front/Stores/SoundEffectsStore";

const { blockedAudio } = vi.hoisted(() => ({ blockedAudio: vi.fn(() => false) }));
vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getBlockAudio: blockedAudio },
}));
const { WeatherSounds } = await import("../../../../../src/front/Phaser/Game/Weather/WeatherSounds");

afterEach(() => {
    environmentVolumeStore.set(1);
    blockedAudio.mockReturnValue(false);
});

function fixture(): {
    sounds: InstanceType<typeof WeatherSounds>;
    audio: ReturnType<typeof mockDeep<Phaser.Sound.BaseSoundManager>>;
    rain: ReturnType<typeof mockDeep<Phaser.Sound.WebAudioSound>>;
    thunder: ReturnType<typeof mockDeep<Phaser.Sound.WebAudioSound>>;
} {
    const audio = mockDeep<Phaser.Sound.BaseSoundManager>();
    Object.defineProperty(audio, "locked", { value: false, writable: true });
    const rain = mockDeep<Phaser.Sound.WebAudioSound>();
    Object.defineProperty(rain, "isPlaying", { value: false });
    const thunder = mockDeep<Phaser.Sound.WebAudioSound>();
    audio.add.mockImplementation((key) => (key === "audio-weather-thunder" ? thunder : rain));
    return { sounds: new WeatherSounds(audio), audio, rain, thunder };
}

describe("weather audio", () => {
    it("updates the personal volume live and silences ambience for editing and mute", () => {
        const { sounds, rain } = fixture();
        sounds.update(WeatherType.Rain, undefined, false);
        expect(rain.play.mock.calls).toHaveLength(1);
        environmentVolumeStore.set(0.5);
        sounds.update(WeatherType.Rain, undefined, false);
        expect(rain.setVolume.mock.lastCall).toEqual([0.07]);
        sounds.update(WeatherType.Rain, undefined, true);
        environmentVolumeStore.set(0);
        sounds.update(WeatherType.Rain, undefined, false);
        expect(rain.stop.mock.calls).toHaveLength(2);
        environmentVolumeStore.set(1);
        blockedAudio.mockReturnValue(true);
        sounds.update(WeatherType.Rain, undefined, false);
        expect(rain.stop.mock.calls).toHaveLength(3);
        sounds.destroy();
        expect(rain.destroy.mock.calls).toHaveLength(1);
    });

    it("loops sunny by default, switches snow and rain without stacking ambience, and reuses rain during storms", () => {
        const { sounds, audio, rain } = fixture();
        sounds.update(WeatherType.Clear, undefined, false);
        expect(audio.add.mock.lastCall).toEqual(["audio-weather-sunny", { loop: true }]);
        sounds.update(WeatherType.Snow, undefined, false);
        expect(audio.add.mock.lastCall).toEqual(["audio-weather-snow", { loop: true }]);
        sounds.update(WeatherType.Rain, undefined, false);
        expect(audio.add.mock.lastCall).toEqual(["audio-weather-rain", { loop: true }]);
        expect(rain.destroy.mock.calls).toHaveLength(2);
        const count = audio.add.mock.calls.length;
        sounds.update(WeatherType.Storm, undefined, false);
        expect(audio.add.mock.calls).toHaveLength(count);
        sounds.destroy();
    });

    it("plays thunder once per shared strike and stops it immediately when leaving the storm", () => {
        const { sounds, rain, thunder } = fixture();
        sounds.update(WeatherType.Storm, new Date(5000), false);
        expect(thunder.play.mock.calls).toHaveLength(0);
        sounds.update(WeatherType.Storm, new Date(25000), false);
        sounds.update(WeatherType.Storm, new Date(25040), false);
        expect(thunder.play.mock.calls).toHaveLength(1);
        environmentVolumeStore.set(0.5);
        sounds.update(WeatherType.Storm, new Date(26000), false);
        expect(thunder.setVolume.mock.lastCall).toEqual([0.15]);
        sounds.update(WeatherType.Rain, new Date(26040), false);
        expect(thunder.stop.mock.calls).toHaveLength(1);
        sounds.destroy();
        expect(rain.destroy.mock.calls).toHaveLength(1);
        expect(thunder.destroy.mock.calls).toHaveLength(1);
    });

    it("waits for the browser audio unlock without creating sound instances", () => {
        const { sounds, audio } = fixture();
        Object.defineProperty(audio, "locked", { value: true });
        sounds.update(WeatherType.Rain, undefined, false);
        expect(audio.add.mock.calls).toHaveLength(0);
        sounds.destroy();
    });
});
