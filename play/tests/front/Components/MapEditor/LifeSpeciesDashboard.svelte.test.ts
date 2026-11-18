import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { LifeSample } from "@workadventure/map-editor";
import type { LifeSpeciesView, SpeciesRow } from "../../../../src/front/Phaser/Game/Life/LifeSpeciesStats";

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

const { default: LifeSpeciesDashboard } =
    await import("../../../../src/front/Components/MapEditor/LifeSpeciesDashboard.svelte");
const { aquaticLifeSpeciesStore, lifeRangeStore } = await import("../../../../src/front/Stores/TerrainEditorStore");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;
const render = (view: LifeSpeciesView | undefined): void => {
    aquaticLifeSpeciesStore.set(view);
    flushSync(() => {
        component = mount(LifeSpeciesDashboard, { target });
    });
};
const clear = (): void => {
    if (component) unmount(component).catch((error: unknown) => console.error(error));
    component = undefined;
    target.replaceChildren();
};
const find = (testId: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const text = (testId: string): string => find(testId)?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const none = { arrivals: 0, births: 0, diedOfAge: 0, eaten: 0, starved: 0, diedDry: 0, meals: [] };
const fish: SpeciesRow = {
    species: 0,
    males: 7,
    females: 5,
    cap: 40,
    arrivals: 2,
    births: 30,
    diedOfAge: 9,
    eaten: 11,
    starved: 0,
    diedDry: 1,
    meals: [],
    lastMinute: { ...none, births: 4, eaten: 2 },
    extinctSince: undefined,
};
const dolphin: SpeciesRow = {
    species: 1,
    males: 1,
    females: 1,
    cap: 2,
    arrivals: 2,
    births: 1,
    diedOfAge: 0,
    eaten: 0,
    starved: 3,
    diedDry: 0,
    meals: [{ species: 0, count: 11 }],
    lastMinute: { ...none, meals: [{ species: 0, count: 2 }] },
    extinctSince: undefined,
};
const samples: LifeSample[] = [
    { at: 0, prey: 0, predators: 0, counts: { "0": 2 } },
    { at: 60_000, prey: 0, predators: 0, counts: { "0": 12, "1": 2 } },
];
const view = (rows: SpeciesRow[]): LifeSpeciesView => ({
    rows,
    history: samples,
    ranges: { "5min": samples, "1h": [], "4h": samples, "1d": samples },
});

describe("LifeSpeciesDashboard", () => {
    afterEach(() => {
        clear();
    });

    it("shows nothing while the server tells nothing of the species", () => {
        render(undefined);
        expect(find("life-species")).toBeNull();
        clear();
        render(view([]));
        expect(find("life-species")).toBeNull();
    });

    it("shows who lives of each species, and how full its places are", () => {
        render(view([fish, dolphin]));
        expect(text("life-species-0-name")).toBe("mapEditor.life.species.name.fish");
        expect(text("life-species-1-name")).toBe("mapEditor.life.species.name.dolphin");
        expect(text("life-species-0-males")).toBe("7");
        expect(text("life-species-0-females")).toBe("5");
        expect(text("life-species-0-fill")).toBe("12 / 40");
        expect(text("life-species-1-fill")).toBe("2 / 2");
    });

    it("shows what happened over the last minute, or since the start", () => {
        render(view([fish, dolphin]));
        expect(text("life-species-0-births")).toBe("4");
        expect(text("life-species-0-eaten")).toBe("2");
        expect(text("life-species-1-starved")).toBe("0");
        flushSync(() => find("life-species-period-total")?.click());
        expect(text("life-species-0-births")).toBe("30");
        expect(text("life-species-0-eaten")).toBe("11");
        expect(text("life-species-1-starved")).toBe("3");
    });

    it("tells who eats whom, and nothing while nobody ate", () => {
        render(view([fish, dolphin]));
        expect(text("life-meals-1-0")).toBe(
            "mapEditor.life.species.name.dolphin → mapEditor.life.species.name.fish 2 11",
        );
        clear();
        render(view([fish, { ...dolphin, meals: [], lastMinute: none }]));
        expect(find("life-meals")).toBeNull();
    });

    it("draws a curve for each species, and hides the ones unticked", () => {
        render(view([fish, dolphin]));
        expect(target.querySelectorAll('[data-testid="life-species-curves"] polyline')).toHaveLength(2);
        flushSync(() => find("life-curve-toggle-1")?.click());
        expect(target.querySelectorAll('[data-testid="life-species-curves"] polyline')).toHaveLength(1);
        expect(find("life-species-curve-0")).not.toBeNull();
        expect(text("life-curve-max-0")).toBe('(mapEditor.life.species.max {"max":12})');
        expect(find("life-curve-max-1")).toBeNull();
    });

    it("warns of a species that died out", () => {
        render(view([fish, { ...dolphin, males: 0, females: 0, extinctSince: 1_700_000_000_000 }]));
        expect(text("life-extinct-1")).toContain("mapEditor.life.species.extinct");
        expect(text("life-extinct-1")).toContain("mapEditor.life.species.name.dolphin");
        expect(find("life-extinct-0")).toBeNull();
    });

    it("draws the range of time chosen in the dashboard above", () => {
        render(view([fish, dolphin]));
        expect(find("life-species-curve-0")?.getAttribute("points")).not.toBe("");
        flushSync(() => lifeRangeStore.set("1h"));
        expect(find("life-species-curve-0")?.getAttribute("points")).toBe("");
        flushSync(() => lifeRangeStore.set("5min"));
    });
});
