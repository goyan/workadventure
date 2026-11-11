import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import NerfHearts from "../../../../src/front/Components/Nerf/NerfHearts.svelte";
import { nerfHeartsStore } from "../../../../src/front/Stores/NerfStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

describe("NerfHearts", () => {
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

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        nerfHeartsStore.set(undefined);
    });

    function render(): void {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(NerfHearts, { target });
        flushSync();
    }

    it("shows nothing while the Nerf is put away", () => {
        render();
        expect(target.querySelector("[role=img]")).toBeNull();
    });

    it("tells how many hearts and thirds are left", () => {
        nerfHeartsStore.set({ thirds: 14, jailed: false });
        render();
        expect(target.querySelector("[role=img]")?.getAttribute("aria-label")).toBe("4 cœurs et 2 tiers");
        expect(target.querySelectorAll("svg")).toHaveLength(5);
        expect(target.textContent).not.toContain("prison");
    });

    it("tells the way out of the prison", () => {
        nerfHeartsStore.set({ thirds: 0, jailed: true });
        render();
        expect(target.textContent).toContain("En prison — sortez à pied pour revenir");
    });
});
