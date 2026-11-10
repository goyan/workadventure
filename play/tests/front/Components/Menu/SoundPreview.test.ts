import { describe, expect, it, vi } from "vitest";
import { createSoundPreview, SOUND_PREVIEWS } from "../../../../src/front/Components/Menu/SoundPreview";

function fakeAudio() {
    const created: {
        url: string;
        volume: number;
        currentTime: number;
        play: ReturnType<typeof vi.fn>;
        pause: ReturnType<typeof vi.fn>;
    }[] = [];
    const createAudio = (url: string) => {
        const audio = { url, volume: 1, currentTime: 0, play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
        created.push(audio);
        return audio as unknown as HTMLAudioElement;
    };
    return { created, createAudio };
}

describe("SoundPreview", () => {
    it("plays an example of the family at the in-game loudness times the chosen volume", () => {
        const { created, createAudio } = fakeAudio();
        const preview = createSoundPreview(createAudio);
        preview.play("doors", 0.5);
        expect(created).toHaveLength(1);
        expect(created[0].url).toBe(SOUND_PREVIEWS.doors.url);
        expect(created[0].volume).toBeCloseTo(SOUND_PREVIEWS.doors.baseVolume * 0.5);
        expect(created[0].play).toHaveBeenCalledOnce();
    });

    it("stops the previous example when another starts, and plays nothing at volume 0", () => {
        const { created, createAudio } = fakeAudio();
        const preview = createSoundPreview(createAudio);
        preview.play("weather", 1);
        preview.play("notifications", 1);
        expect(created[0].pause).toHaveBeenCalled();
        preview.play("footsteps", 0);
        expect(created[1].pause).toHaveBeenCalled();
        expect(created).toHaveLength(2);
    });

    it("has an example for every family that has a typical sound", () => {
        expect(Object.keys(SOUND_PREVIEWS).sort()).toEqual(
            ["doors", "footsteps", "nerf", "notifications", "skateboard", "weather"].sort(),
        );
        for (const { url, baseVolume } of Object.values(SOUND_PREVIEWS)) {
            expect(url).toMatch(/^\/resources\/.+\.(ogg|mp3|wav)$/);
            expect(baseVolume).toBeGreaterThan(0);
            expect(baseVolume).toBeLessThanOrEqual(1);
        }
    });
});
