import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { writable } from "svelte/store";
import JamAudioPlayback from "../../../src/front/Components/ListeningZone/JamAudioPlayback.svelte";

// The player plays real audio; the playback only decides whether, and for which Jam, it is there.
vi.mock("../../../src/front/Components/ListeningZone/JamMusicPlayer.svelte", async () => {
    const mod = (await import("./JamMusicPlayerStub.svelte")) as { default: unknown };
    return { default: mod.default };
});

describe("JamAudioPlayback", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;
    const listeningSpaceName = writable<string | undefined>(undefined);

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        listeningSpaceName.set(undefined);
    });

    function render() {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(JamAudioPlayback, { target, props: { listeningSpaceName } });
        flushSync();
    }
    const player = () => target.querySelector<HTMLElement>('[data-testid="jam-audio-player"]');

    it("plays nothing while no Jam is listened to", () => {
        render();
        expect(player()).toBeNull();
    });

    it("plays the music of the Jam listened to, whatever is on screen: it does not belong to any card or panel", () => {
        render();
        listeningSpaceName.set("world.jam:space");
        flushSync();
        expect(player()?.dataset.space).toBe("world.jam:space");
    });

    it("stops playing when the listening stops", () => {
        render();
        listeningSpaceName.set("world.jam:space");
        flushSync();
        listeningSpaceName.set(undefined);
        flushSync();
        expect(player()).toBeNull();
    });

    it("follows the user to another Jam", () => {
        render();
        listeningSpaceName.set("world.jam:one");
        flushSync();
        listeningSpaceName.set("world.jam:two");
        flushSync();
        expect(player()?.dataset.space).toBe("world.jam:two");
    });
});
