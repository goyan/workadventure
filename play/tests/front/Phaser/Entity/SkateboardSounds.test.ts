import type * as Phaser from "phaser";
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mock } from "vitest-mock-extended";
import { SkateboardSounds, SKATEBOARD_SOUNDS, type SkatingCharacter } from "@wa/front/Phaser/Vehicle/SkateboardSounds";
import { skateboardVolumeStore } from "@wa/front/Stores/SoundEffectsStore";

beforeEach(() => {
    localStorage.clear();
    skateboardVolumeStore.set(0.5);
});
function setup(): {
    effect: SkateboardSounds;
    sound: ReturnType<typeof mock<Phaser.Sound.WebAudioSound>>;
    manager: ReturnType<typeof mockDeep<Phaser.Sound.BaseSoundManager>>;
} {
    const manager = mockDeep<Phaser.Sound.BaseSoundManager>();
    const sound = mock<Phaser.Sound.WebAudioSound>();
    manager.add.mockReturnValue(sound);
    Object.assign(manager, { locked: false });
    Object.assign(sound, { isPlaying: true, duration: 30 });
    return { effect: new SkateboardSounds(manager), sound, manager };
}
const skater = (x: number, fields: Partial<SkatingCharacter> = {}): SkatingCharacter => ({
    x,
    y: 0,
    riding: true,
    moving: true,
    indoor: false,
    ...fields,
});
describe("personal skateboard rolling audio", () => {
    it("skips the inaudible intro on every loop without re-encoding the clip", () => {
        const { effect, sound } = setup();
        Object.assign(sound, { isPlaying: false });
        effect.update(skater(0), false, 0);
        effect.update(skater(10), false, 16);
        expect(sound.addMarker.mock.calls).toEqual([
            [
                {
                    name: SKATEBOARD_SOUNDS[0].key,
                    start: 0.18,
                    duration: 29.82,
                    config: { loop: true },
                },
            ],
        ]);
        expect(sound.play.mock.calls).toEqual([[SKATEBOARD_SOUNDS[0].key]]);
    });
    it("keeps one continuous loop when desktop rendering runs faster than physics", () => {
        const { effect, sound, manager } = setup();
        effect.update(skater(0), false, 0);
        effect.update(skater(10), false, 16);
        effect.update(skater(10), false, 24);
        effect.update(skater(20), false, 32);
        effect.update(skater(20), false, 40);
        expect(manager.add.mock.calls).toHaveLength(1);
        expect(sound.destroy.mock.calls).toHaveLength(0);
        effect.update(skater(20, { moving: false }), false, 48);
        expect(sound.destroy.mock.calls).toHaveLength(1);
    });
    it("loops during displacement despite the standing avatar, including slow rendering, and stops at rest", () => {
        const { effect, sound, manager } = setup();
        effect.update(skater(0), false, 0);
        expect(manager.add.mock.calls).toHaveLength(0);
        effect.update(skater(80), false, 0);
        expect(manager.add.mock.calls).toEqual([[SKATEBOARD_SOUNDS[0].key, { loop: true }]]);
        effect.update(skater(160), false, 0);
        expect(manager.add.mock.calls).toHaveLength(1);
        effect.update(skater(160), false, 100);
        expect(sound.destroy.mock.calls).toHaveLength(1);
        effect.update(skater(170), false, 0);
        effect.update(skater(180, { moving: false }), false, 0);
        expect(sound.destroy.mock.calls).toHaveLength(2);
        effect.destroy();
    });
    it("switches to the supplied indoor clip and releases audio when dismounting or leaving the map", () => {
        const { effect, sound, manager } = setup();
        effect.update(skater(0), false, 0);
        effect.update(skater(1), false, 0);
        effect.update(skater(2, { indoor: true }), false, 0);
        expect(manager.add.mock.lastCall?.[0]).toBe(SKATEBOARD_SOUNDS[1].key);
        expect(sound.destroy.mock.calls).toHaveLength(1);
        effect.update(skater(3, { riding: false }), false, 0);
        expect(sound.destroy.mock.calls).toHaveLength(2);
        effect.update(skater(4), false, 0);
        effect.destroy();
        expect(sound.destroy.mock.calls).toHaveLength(3);
    });
    it("applies the saved gain immediately and silences the editor and zero volume", () => {
        const { effect, sound, manager } = setup();
        effect.update(skater(0), false, 0);
        effect.update(skater(1), false, 0);
        expect(sound.setVolume.mock.lastCall).toEqual([0.5]);
        skateboardVolumeStore.set(1);
        effect.update(skater(2), false, 0);
        expect(sound.setVolume.mock.lastCall).toEqual([1]);
        effect.update(skater(3), true, 0);
        skateboardVolumeStore.set(0);
        effect.update(skater(4), false, 0);
        expect(manager.add.mock.calls).toHaveLength(1);
        expect(sound.destroy.mock.calls).toHaveLength(1);
        effect.destroy();
    });
});
