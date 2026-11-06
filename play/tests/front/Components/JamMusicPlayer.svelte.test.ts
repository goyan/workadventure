import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import JamMusicPlayer from "../../../src/front/Components/ListeningZone/JamMusicPlayer.svelte";
import {
    jamMusicMutedStore,
    jamMusicStreamsStore,
    jamMusicVolumeStore,
    setJamMusicStream,
} from "../../../src/front/ListeningZone/JamMusicStore";
import { speakerSelectedStore } from "../../../src/front/Stores/AudioOutputStore";

describe("JamMusicPlayer", () => {
    const musicStream = new EventTarget() as unknown as MediaStream;
    const otherStream = new EventTarget() as unknown as MediaStream;
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    beforeEach(() => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        jamMusicStreamsStore.set(new Map());
        jamMusicMutedStore.set(false);
        jamMusicVolumeStore.set(1);
        speakerSelectedStore.set("");
        target = document.createElement("div");
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) {
            await unmount(mounted);
        }
        vi.restoreAllMocks();
    });

    function render(spaceName = "world.jam-space") {
        component = mount(JamMusicPlayer, { target, props: { spaceName } });
        flushSync();
    }

    function audio(): HTMLAudioElement | null {
        return target.querySelector("audio");
    }

    it("plays the music its Jam space relays", () => {
        setJamMusicStream("world.jam-space", musicStream);
        render();

        expect(audio()?.srcObject).toBe(musicStream);
    });

    it("ignores the music of another Jam space", () => {
        setJamMusicStream("world.another-space", otherStream);
        render();

        expect(audio()?.srcObject ?? null).toBeNull();
    });

    it("follows the music when it starts after the player", () => {
        render();

        setJamMusicStream("world.jam-space", musicStream);
        flushSync();

        expect(audio()?.srcObject).toBe(musicStream);
    });

    it("renders no audio element while the music is silenced", () => {
        setJamMusicStream("world.jam-space", musicStream);
        jamMusicMutedStore.set(true);
        render();

        expect(audio()).toBeNull();
    });

    it("applies the volume of the music alone", () => {
        setJamMusicStream("world.jam-space", musicStream);
        jamMusicVolumeStore.set(0.4);
        render();

        expect(audio()?.volume).toBeCloseTo(0.4);
    });
});
