import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import FishingCards from "../../../../src/front/Components/Fishing/FishingCards.svelte";
import { FISHING_CARD_MS, fishingCardsStore, showFishingCard } from "../../../../src/front/Stores/FishingStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

describe("FishingCards", () => {
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
        fishingCardsStore.set([]);
        vi.useRealTimers();
    });

    function render(): void {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(FishingCards, { target });
        flushSync();
    }
    const texts = (): string[] =>
        [...target.querySelectorAll("[data-testid^=fishing-card-]")].map((card) => card.textContent?.trim() ?? "");

    it("shows nothing while nothing happens", () => {
        render();
        expect(texts()).toEqual([]);
    });

    it("names the fish caught and its weight", () => {
        render();
        showFishingCard({ kind: "caught", own: true, grams: 1240, female: true });
        showFishingCard({ kind: "caught", own: true, grams: 300, female: false });
        flushSync();
        expect(texts()).toEqual(["Poisson rose · 1,24 kg", "Poisson bleu · 0,30 kg"]);
    });

    it("names the angler of another player's catch", () => {
        render();
        showFishingCard({ kind: "caught", own: false, name: "Hugo", grams: 2100, female: false });
        flushSync();
        expect(texts()).toEqual(["Hugo : Poisson bleu · 2,10 kg"]);
    });

    it("says why the line came back empty", () => {
        render();
        showFishingCard({ kind: "missed", own: true });
        showFishingCard({ kind: "lost", own: true });
        showFishingCard({ kind: "refused", own: true });
        flushSync();
        expect(texts()).toEqual([
            "Trop tard : le poisson est reparti.",
            "Un dauphin a mangé votre prise.",
            "Raté. Lancez dans une eau où vivent des poissons, à huit cases au plus.",
        ]);
    });

    it("keeps three cards at most, each for four seconds", () => {
        vi.useFakeTimers();
        render();
        for (const grams of [100, 200, 300, 400]) showFishingCard({ kind: "caught", own: true, grams, female: true });
        flushSync();
        expect(texts()).toHaveLength(3);
        expect(texts()[0]).toBe("Poisson rose · 0,20 kg");
        vi.advanceTimersByTime(FISHING_CARD_MS);
        flushSync();
        expect(texts()).toEqual([]);
    });
});
