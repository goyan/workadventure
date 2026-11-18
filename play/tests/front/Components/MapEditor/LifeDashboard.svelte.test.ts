import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    // Any translation renders as its key and its arguments.
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: (_target, _this, args: unknown[]) =>
                [path.join("."), ...args.map((arg) => JSON.stringify(arg))].join(" "),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});

const { default: LifeDashboard } = await import("../../../../src/front/Components/MapEditor/LifeDashboard.svelte");
const { aquaticLifeStatsStore } = await import("../../../../src/front/Stores/TerrainEditorStore");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;
const render = (): void => {
    flushSync(() => {
        component = mount(LifeDashboard, { target });
    });
};
const text = (testId: string): string =>
    target.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const view = {
    males: 7,
    females: 5,
    prey: 12,
    predators: 2,
    predatorMales: 1,
    predatorFemales: 1,
    preyPerPredator: 6,
    totals: {
        since: Date.now() - 125_000,
        arrivals: 2,
        births: 30,
        diedOfAge: 9,
        eaten: 11,
        diedDry: 1,
        predatorBirths: 3,
        predatorDeaths: 2,
        habitableBodies: 3,
        populatedBodies: 2,
        capacity: 40,
        history: [],
        historyStepMs: 5000,
        ranges: [],
    },
    lastMinute: { arrivals: 0, births: 4, diedOfAge: 1, eaten: 2, diedDry: 0, predatorBirths: 1, predatorDeaths: 0 },
    history: [
        { at: 0, prey: 2, predators: 0 },
        { at: 60_000, prey: 8, predators: 1 },
        { at: 180_000, prey: 12, predators: 2 },
    ],
    ranges: {
        "5min": [
            { at: 1_000_000, prey: 4, predators: 1 },
            { at: 1_150_000, prey: 12, predators: 2 },
        ],
        "1h": [
            { at: 250_000, prey: 30, predators: 3 },
            { at: 1_150_000, prey: 12, predators: 2 },
        ],
        "4h": [],
        "1d": [],
    },
};
const choose = (range: string): void => {
    flushSync(() => target.querySelector<HTMLInputElement>(`[data-testid="life-range-${range}"]`)?.click());
};
const points = (line: number): string[] =>
    target.querySelectorAll('[data-testid="life-history"] polyline')[line].getAttribute("points")?.trim().split(" ") ??
    [];

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    aquaticLifeStatsStore.set(undefined);
});

describe("LifeDashboard", () => {
    it("says there is no life to show while the server told nothing", () => {
        render();
        expect(text("life-dashboard-empty")).toContain("mapEditor.life.dashboard.empty");
        expect(target.querySelector('[data-testid="life-prey"]')).toBeNull();
    });

    it("shows the prey by sex, the predators, and the prey for a predator", () => {
        aquaticLifeStatsStore.set(view);
        render();
        expect(text("life-prey")).toContain("12");
        expect(text("life-males")).toContain("7");
        expect(text("life-females")).toContain("5");
        expect(text("life-predators")).toContain("2");
        expect(text("life-predator-males")).toContain("1");
        expect(text("life-predator-females")).toContain("1");
        expect(text("life-prey-per-predator")).toContain("6");
    });

    it("shows how full the waters are, and how many of them are populated", () => {
        aquaticLifeStatsStore.set(view);
        render();
        expect(text("life-capacity")).toContain("12 / 40");
        expect(target.querySelector<HTMLElement>('[data-testid="life-capacity-bar"]')?.style.width).toBe("30%");
        expect(text("life-waters")).toContain("2 / 3");
    });

    it("shows what happened over the last minute and since the life began", () => {
        aquaticLifeStatsStore.set(view);
        render();
        expect(text("life-minute-births")).toContain("4");
        expect(text("life-minute-eaten")).toContain("2");
        expect(text("life-minute-diedOfAge")).toContain("1");
        expect(text("life-total-births")).toContain("30");
        expect(text("life-total-eaten")).toContain("11");
        expect(text("life-total-diedDry")).toContain("1");
        expect(text("life-total-arrivals")).toContain("2");
        expect(text("life-since")).toContain("2 min");
        // The dolphins have their own lines.
        expect(text("life-minute-predatorBirths")).toContain("1");
        expect(text("life-total-predatorBirths")).toContain("3");
        expect(text("life-total-predatorDeaths")).toContain("2");
    });

    it("draws the last five minutes at first: the present on the right, five minutes ago on the left", () => {
        aquaticLifeStatsStore.set(view);
        render();
        expect(target.querySelector<HTMLInputElement>('[data-testid="life-range-5min"]')?.checked).toBe(true);
        // A sample two and a half minutes ago stands in the middle, whatever the first sample is.
        expect(points(0).map((point) => point.split(",")[0])).toEqual(["150", "300"]);
        expect(text("life-history-prey-max")).toContain("12");
        expect(text("life-history-span")).toContain("5 min");
    });

    it("draws another range when it is chosen, on the scale of that range", () => {
        aquaticLifeStatsStore.set(view);
        render();
        choose("1h");
        // A quarter of an hour ago: three quarters of the width.
        expect(points(1).map((point) => point.split(",")[0])).toEqual(["225", "300"]);
        expect(text("life-history-prey-max")).toContain("30");
        expect(text("life-history-predators-max")).toContain("3");
        expect(text("life-history-span")).toContain("1 h");
        // A range without a sample yet draws nothing.
        choose("1d");
        expect(points(0)).toEqual([""]);
        expect(text("life-history-span")).toContain("24 h");
    });

    it("draws the whole life of the map when asked, each curve on its own scale, with the time it covers", () => {
        aquaticLifeStatsStore.set(view);
        render();
        choose("all");
        const lines = target.querySelectorAll('[data-testid="life-history"] polyline');
        expect(lines).toHaveLength(2);
        // Three samples each, placed at their time: the second one at a third of the width.
        const prey = lines[0].getAttribute("points")?.trim().split(" ") ?? [];
        expect(prey).toHaveLength(3);
        expect(prey[1].split(",")[0]).toBe("100");
        // The scales: the largest prey on the left, the largest predators on the right.
        expect(text("life-history-prey-max")).toContain("12");
        expect(text("life-history-predators-max")).toContain("2");
        // Three minutes of history.
        expect(text("life-history-span")).toContain("3 min");
    });

    it("shows a dash for the prey of a predator when there is no predator", () => {
        aquaticLifeStatsStore.set({ ...view, predators: 0, preyPerPredator: undefined });
        render();
        expect(text("life-prey-per-predator")).toContain("—");
    });
});
