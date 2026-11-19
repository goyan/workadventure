import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount as mountComponent, unmount } from "svelte";
import { get } from "svelte/store";
import FishingContestPanel from "../../../../src/front/Components/Fishing/FishingContestPanel.svelte";
import {
    fishingContestSetupStore,
    fishingContestStore,
    rodEquippedStore,
} from "../../../../src/front/Stores/FishingStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const row = (rank: number, name: string, totalGrams: number, bestGrams: number, own = false) => ({
    rank,
    name,
    totalGrams,
    bestGrams,
    catches: 1,
    own,
});

describe("FishingContestPanel", () => {
    const previousLocale = get(locale);
    let target: HTMLElement;
    let component: ReturnType<typeof mountComponent> | undefined;

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        setLocale(previousLocale);
    });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        vi.useRealTimers();
        fishingContestStore.set(undefined);
        fishingContestSetupStore.set(false);
        rodEquippedStore.set(false);
    });

    const mount = () => {
        const start = vi.fn();
        const join = vi.fn();
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mountComponent(FishingContestPanel, { target, props: { start, join } });
        flushSync();
        const queryByTestId = (id: string): HTMLElement | null => target.querySelector(`[data-testid="${id}"]`);
        const getByTestId = (id: string): HTMLElement => {
            const found = queryByTestId(id);
            if (!found) throw new Error(`no ${id}`);
            return found;
        };
        const getAllByTestId = (id: string): HTMLElement[] => [
            ...target.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
        ];
        return { start, join, queryByTestId, getByTestId, getAllByTestId };
    };
    const click = (element: HTMLElement): void => {
        element.click();
        flushSync();
    };

    it("shows nothing while there is no contest", () => {
        const { queryByTestId } = mount();
        expect(queryByTestId("fishing-contest")).toBeNull();
        expect(queryByTestId("fishing-contest-setup")).toBeNull();
    });

    it("asks how long the contest will last, and starts it", () => {
        fishingContestSetupStore.set(true);
        const { getByTestId, queryByTestId, start } = mount();
        expect(getByTestId("fishing-contest-start-3").textContent).toBe("3 min");
        expect(getByTestId("fishing-contest-start-10").textContent).toBe("10 min");
        click(getByTestId("fishing-contest-start-5"));
        expect(start).toHaveBeenCalledWith(5);
        click(getByTestId("fishing-contest-cancel"));
        expect(queryByTestId("fishing-contest-setup")).toBeNull();
    });

    it("shows the ranking and the time left, which goes down", () => {
        fishingContestStore.set({
            hostName: "Hugo",
            minutes: 5,
            endsAt: 1_192_000,
            finished: false,
            rows: [row(1, "Hugo", 4810, 2100), row(2, "Antoine", 3950, 1240, true)],
        });
        const { getByTestId, getAllByTestId } = mount();
        expect(getByTestId("fishing-contest").textContent).toContain("Lancé par Hugo");
        expect(getByTestId("fishing-contest-remaining").textContent).toBe("03:12");
        const rows = getAllByTestId("fishing-contest-row");
        expect(rows.map((line) => line.textContent?.replace(/\s+/g, " ").trim())).toEqual([
            "1. Hugo 4,81 kg (2,10)",
            "2. Antoine 3,95 kg (1,24)",
        ]);
        expect(rows[1].getAttribute("aria-current")).toBe("true");
        expect(rows[0].getAttribute("aria-current")).toBeNull();
        vi.advanceTimersByTime(2000);
        flushSync();
        expect(getByTestId("fishing-contest-remaining").textContent).toBe("03:10");
    });

    it("offers to join to who has no rod in hand, not to who has one", () => {
        fishingContestStore.set({ hostName: "Hugo", minutes: 3, endsAt: 1_100_000, finished: false, rows: [] });
        const { getByTestId, queryByTestId, join } = mount();
        expect(getByTestId("fishing-contest-empty").textContent?.trim()).toBe("Personne n'a encore rien pris.");
        click(getByTestId("fishing-contest-join"));
        expect(join).toHaveBeenCalledTimes(1);
        rodEquippedStore.set(true);
        flushSync();
        expect(queryByTestId("fishing-contest-join")).toBeNull();
    });

    it("shows the podium once it is over, the biggest fish named, and closes", () => {
        fishingContestStore.set({
            hostName: "Hugo",
            minutes: 3,
            endsAt: 1_000_000,
            finished: true,
            rows: [
                row(1, "Hugo", 4810, 1500),
                row(2, "Antoine", 3950, 2400),
                row(3, "Charles", 620, 620),
                row(4, "Amine", 300, 300),
            ],
        });
        const { getByTestId, getAllByTestId, queryByTestId } = mount();
        expect(getByTestId("fishing-contest").textContent).toContain("Concours terminé");
        expect(queryByTestId("fishing-contest-remaining")).toBeNull();
        expect(queryByTestId("fishing-contest-join")).toBeNull();
        expect(getAllByTestId("fishing-contest-row")).toHaveLength(3);
        expect(getByTestId("fishing-contest-biggest").textContent?.trim()).toBe(
            "Plus gros poisson : 2,40 kg (Antoine)",
        );
        click(getByTestId("fishing-contest-close"));
        expect(queryByTestId("fishing-contest")).toBeNull();
    });

    it("says so when nobody caught anything", () => {
        fishingContestStore.set({ hostName: "Hugo", minutes: 3, endsAt: 1_000_000, finished: true, rows: [] });
        const { getByTestId } = mount();
        expect(getByTestId("fishing-contest-empty").textContent?.trim()).toBe("Personne n'a rien pris.");
    });
});
