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
    preyPerPredator: 6,
    totals: {
        since: Date.now() - 125_000,
        arrivals: 2,
        births: 30,
        diedOfAge: 9,
        eaten: 11,
        diedDry: 1,
        habitableBodies: 3,
        populatedBodies: 2,
        capacity: 40,
    },
    lastMinute: { arrivals: 0, births: 4, diedOfAge: 1, eaten: 2, diedDry: 0 },
    history: [
        { prey: 2, predators: 0 },
        { prey: 8, predators: 1 },
        { prey: 12, predators: 2 },
    ],
};

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
    });

    it("draws the history of the prey and of the predators", () => {
        aquaticLifeStatsStore.set(view);
        render();
        const lines = target.querySelectorAll('[data-testid="life-history"] polyline');
        expect(lines).toHaveLength(2);
        // Three samples each; the largest prey just under the top, the predators lower: the lines never overlap there.
        expect(lines[0].getAttribute("points")?.trim().split(" ")).toHaveLength(3);
        expect(lines[0].getAttribute("points")?.trim().endsWith(",4")).toBe(true);
        expect(lines[1].getAttribute("points")?.trim().endsWith(",16")).toBe(true);
    });

    it("shows a dash for the prey of a predator when there is no predator", () => {
        aquaticLifeStatsStore.set({ ...view, predators: 0, preyPerPredator: undefined });
        render();
        expect(text("life-prey-per-predator")).toContain("—");
    });
});
