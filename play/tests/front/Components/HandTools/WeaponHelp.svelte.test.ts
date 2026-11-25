import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import WeaponHelp from "../../../../src/front/Components/HandTools/WeaponHelp.svelte";
import { nerfEquippedStore } from "../../../../src/front/Stores/NerfStore";
import { grenadeLauncherEquippedStore } from "../../../../src/front/Stores/ZombieGrenadeStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

describe("WeaponHelp", () => {
    const previousLocale = get(locale);
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        setLocale(previousLocale);
    });

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        nerfEquippedStore.set(false);
        grenadeLauncherEquippedStore.set(false);
        vi.useRealTimers();
    });

    function render(): void {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(WeaponHelp, { target });
        flushSync();
    }

    function help(): string | undefined {
        return target.querySelector("[data-testid=weapon-help]")?.textContent?.trim();
    }

    it("tells how to fire the Nerf when it is taken, a few seconds", () => {
        render();
        expect(help()).toBeUndefined();
        nerfEquippedStore.set(true);
        flushSync();
        expect(help()).toContain("ESPACE : tirer vers le pointeur");
        vi.advanceTimersByTime(5000);
        flushSync();
        expect(help()).toBeUndefined();
    });

    it("tells how to fire the grenade launcher when it is taken", () => {
        render();
        grenadeLauncherEquippedStore.set(true);
        flushSync();
        expect(help()).toContain("ESPACE : tirer une grenade vers le pointeur");
    });

    it("hides the help when the weapon is put away", () => {
        render();
        nerfEquippedStore.set(true);
        flushSync();
        nerfEquippedStore.set(false);
        flushSync();
        expect(help()).toBeUndefined();
    });

    it("says nothing of a weapon already held when the game shows up again", () => {
        nerfEquippedStore.set(true);
        render();
        expect(help()).toBeUndefined();
    });
});
