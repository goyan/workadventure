import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import JamThemePicker from "../../../../src/front/Components/ListeningZone/JamThemePicker.svelte";
import { lampEffectsEnabledStore } from "../../../../src/front/Stores/LampEffectsStore";
import { setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocale } from "../../../../src/i18n/i18n-util.sync";

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.replaceChildren();
    lampEffectsEnabledStore.set(true);
});

describe("The look of the music lounge", () => {
    it("puts the personal switch of the light effects next to the ambience, and turns them off and on for me", () => {
        loadLocale("en-US");
        setLocale("en-US");
        flushSync(() => {
            component = mount(JamThemePicker, { target });
        });
        const button = target.querySelector<HTMLButtonElement>('[data-testid="jam-lights-toggle"]');
        if (!button) throw new Error("Missing light switch");
        expect(button.closest(".jam-theme-picker")).not.toBeNull();
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(false);
        expect(button.getAttribute("aria-pressed")).toBe("false");
        expect(button.getAttribute("aria-label")).toBe("Turn on light effects (for me)");
        flushSync(() => button.click());
        expect(get(lampEffectsEnabledStore)).toBe(true);
    });
});
