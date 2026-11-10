import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import SoundEffectsSettings from "@wa/front/Components/Menu/SoundEffectsSettings.svelte";
import { doorVolumeStore, weatherVolumeStore } from "@wa/front/Stores/SoundEffectsStore";
import { loadLocaleAsync } from "@wa/i18n/i18n-util.async";
import { setLocale } from "@wa/i18n/i18n-svelte";

let component: ReturnType<typeof mount> | undefined;
beforeAll(async () => {
    await loadLocaleAsync("en-US");
    setLocale("en-US");
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    document.body.replaceChildren();
});

function open() {
    const preview = { play: vi.fn(), stop: vi.fn() };
    const target = document.createElement("div");
    document.body.append(target);
    flushSync(() => {
        component = mount(SoundEffectsSettings, { target, props: { preview } });
    });
    return { target, preview };
}

describe("SoundEffectsSettings", () => {
    it("shows one slider per family of sounds, in three groups", () => {
        const { target } = open();
        const ids = [...target.querySelectorAll<HTMLInputElement>('input[type="range"]')].map((input) => input.id);
        expect(ids).toEqual([
            "footstep-volume",
            "skateboard-volume",
            "weather-volume",
            "door-volume",
            "map-sounds-volume",
            "notification-sound-volume",
        ]);
        expect(target.querySelectorAll('[data-testid="sound-effects-group"]')).toHaveLength(3);
    });

    it("offers to listen to every family but the map's own sounds, at the chosen volume", () => {
        const { target, preview } = open();
        const listen = [...target.querySelectorAll<HTMLButtonElement>('[data-testid^="listen-"]')].map(
            (button) => button.dataset.testid,
        );
        expect(listen).toEqual([
            "listen-footsteps",
            "listen-skateboard",
            "listen-weather",
            "listen-doors",
            "listen-notifications",
        ]);
        doorVolumeStore.set(0.4);
        flushSync(() => target.querySelector<HTMLButtonElement>('[data-testid="listen-doors"]')?.click());
        expect(preview.play).toHaveBeenCalledWith("doors", 0.4);
    });

    it("explains the sounds placed on the map", () => {
        const { target } = open();
        expect(target.textContent).toContain("Sounds placed on the map");
        expect(target.textContent).toContain("Areas and objects that play a sound");
    });

    it("says a family is muted at volume 0", () => {
        weatherVolumeStore.set(0);
        const { target } = open();
        const labels = [...target.querySelectorAll("label")].map((label) =>
            label.textContent?.replace(/\s+/g, " ").trim(),
        );
        expect(labels).toContain("Weather : Muted");
        expect(labels).toContain("Footsteps and swimming : 15 %");
        weatherVolumeStore.set(0.15);
    });
});
