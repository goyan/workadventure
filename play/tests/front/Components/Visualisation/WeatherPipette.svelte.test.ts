import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import WeatherPipette from "../../../../src/front/Components/Visualisation/WeatherPipette.svelte";
import { explainCell } from "../../../../src/front/Phaser/Game/Weather/CellExplained";
import type { CellExplained, CellInput } from "../../../../src/front/Phaser/Game/Weather/CellExplained";
import { weatherPipetteStore } from "../../../../src/front/Stores/VisualisationStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const ICE: CellInput = {
    city: undefined,
    ground: "map",
    outdoor: true,
    reading: { ground: -2, surface: 0, depth: 2, soil: "earth", roughness: 0.03 },
    depthPx: 58,
    deep: true,
    current: { speed: 0, heading: 0 },
    hold: "solid",
    kept: { iceMm: 100, snowMm: 0, grass: 0, moisture: 1, dryness: 0, fire: 0, ash: 0 },
    own: { snowMm: 0, frost: 0 },
    weather: { temperature: 24, humidity: 49, windSpeed: 10 },
    snowing: false,
    times: 1,
    soilFrost: 0,
    sunElevation: 35,
};

describe("WeatherPipette", () => {
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
        weatherPipetteStore.set(false);
    });

    function render(cell: CellExplained | undefined): void {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(WeatherPipette, { target, props: { cell } });
        flushSync();
    }
    const find = (id: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const text = (id: string): string => (find(id)?.textContent ?? "").replace(/\s+/g, " ").trim();

    it("says to aim at the map while the pointer is off it", () => {
        render(undefined);
        expect(text("weather-pipette-away")).toBe("Vise la carte : la pipette lit la case sous la souris.");
        expect(find("weather-pipette-ice")).toBeNull();
    });

    it("says the cell in the order one asks: the ground, the water, the ice, the snow, the frost, the sun", () => {
        render(explainCell(ICE));
        const shown = [...target.querySelectorAll("article")].map((section) => section.getAttribute("data-testid"));
        expect(shown).toEqual(
            // Under water there is no grass to tell: no meadow.
            ["relief", "water", "ice", "snow", "frost", "sun"].map((id) => `weather-pipette-${id}`),
        );
        expect(text("weather-pipette-ground")).toContain("Sol du serveur : le même pour tous ceux qui le suivent.");
        expect(text("weather-pipette-ice")).toContain("Glace de 10 cm d'épaisseur.");
        expect(text("weather-pipette-ice")).toContain("Elle aura disparu dans environ 14 h.");
        // Whose air decides and who sees the same, as on the weather board.
        expect(text("weather-pipette-ground")).toContain("Décidé par l'air de la carte");
        expect(text("weather-pipette-ground")).toContain("Vu par tous ceux qui suivent le serveur");
        // The sections that ground holds bear its colour; the relief and the sun are no one's.
        expect(find("weather-pipette-ice")?.getAttribute("data-air")).toBe("map");
        expect(find("weather-pipette-relief")?.getAttribute("data-air")).toBeNull();
        expect(text("weather-pipette")).not.toContain("undefined");
    });

    it("says the ground is the player's own when they follow a city", () => {
        render(explainCell({ ...ICE, ground: "own", city: "Oslo", kept: undefined, hold: "thin" }));
        expect(text("weather-pipette-ground")).toContain(
            "Tu suis Oslo : c'est ton propre sol que tu vois, pour toi seul.",
        );
        expect(text("weather-pipette-ground")).toContain("Décidé par ton air");
        expect(text("weather-pipette-ground")).toContain("Vu par toi seul");
        expect(find("weather-pipette-ice")?.getAttribute("data-air")).toBe("own");
    });

    it("is put away by its cross", () => {
        weatherPipetteStore.set(true);
        render(undefined);
        find("weather-pipette-close")?.click();
        expect(get(weatherPipetteStore)).toBe(false);
    });
});
