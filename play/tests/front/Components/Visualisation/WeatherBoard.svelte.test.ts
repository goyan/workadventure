import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import WeatherBoard from "../../../../src/front/Components/Visualisation/WeatherBoard.svelte";
import { explainWeather } from "../../../../src/front/Phaser/Game/Weather/WeatherExplained";
import type { WeatherBoardInput } from "../../../../src/front/Phaser/Game/Weather/WeatherExplained";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

/** A player who follows the server under a mild air; each test changes what it is about. */
function input(changes: Partial<WeatherBoardInput> = {}): WeatherBoardInput {
    const air = { temperature: 12, humidity: 70, windSpeed: 10 };
    return {
        city: undefined,
        drawsOwnWeather: false,
        mapAir: { ...air, byHand: false, place: "Paris" },
        ownAir: undefined,
        precipitationAir: air,
        roomAir: air,
        frostAir: air,
        falling: false,
        mapFalling: false,
        drawn: undefined,
        snow: undefined,
        roomWind: 10,
        ...changes,
    };
}

/** The case that asked for this board: a warm city on the server, a cold, dry and windy one followed. */
const USER_CASE = input({
    city: "Auckland",
    drawsOwnWeather: true,
    mapAir: { temperature: 24, humidity: 55, windSpeed: 12, byHand: false, place: "Dakar" },
    ownAir: { temperature: -3, humidity: 45, windSpeed: 40, byHand: false, place: "Auckland" },
    precipitationAir: { temperature: -3, humidity: 45 },
    roomAir: { temperature: 24, humidity: 55 },
    frostAir: { temperature: -3, humidity: 45, windSpeed: 40 },
});

describe("WeatherBoard", () => {
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
    });

    function render(board: WeatherBoardInput): void {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(WeatherBoard, { target, props: { board: explainWeather(board) } });
        flushSync();
    }
    const find = (id: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const text = (id: string): string => (find(id)?.textContent ?? "").replace(/\s+/g, " ").trim();
    const CARDS = ["precipitation", "downpour", "frost", "ice", "soil", "snow"];

    it("shows one air and says so for a player who follows the server", () => {
        render(input());
        expect(find("weather-board-air-map")).not.toBeNull();
        expect(find("weather-board-air-own")).toBeNull();
        expect(text("weather-board-follows")).toContain("Tu suis le serveur");
        expect(text("weather-board-air-map")).toContain("air réel à Paris");
        expect(text("weather-board-air-map")).toContain("12 °C");
        expect(text("weather-board-air-map")).toContain("70 %");
        expect(text("weather-board-air-map")).toContain("10 km/h");
        // Each unit is named where it is first shown.
        expect(text("weather-board-units")).toContain("°C : degrés Celsius");
        expect(text("weather-board-units")).toContain("km/h : kilomètres par heure");
    });

    it("shows a card for each thing, in the order the question comes, each with its air and who sees it", () => {
        render(input());
        const shown = [...target.querySelectorAll("article")].map((card) => card.getAttribute("data-testid"));
        expect(shown).toEqual(CARDS.map((id) => `weather-board-${id}`));
        for (const id of CARDS) {
            expect(text(`weather-board-${id}-result`)).not.toBe("");
            expect(find(`weather-board-${id}-air`)?.getAttribute("data-air")).toBe("map");
            expect(text(`weather-board-${id}-air`)).toContain("l'air de la carte");
            expect(text(`weather-board-${id}-audience`)).toContain("Vu par");
        }
    });

    it("reads the case that asked for it without effort: both airs, no frost for me, a rain for everyone", () => {
        render(USER_CASE);
        expect(text("weather-board-follows")).toBe(
            "Tu suis Auckland : c'est son ciel et sa météo que tu vois, pour toi seul.",
        );
        expect(text("weather-board-air-map")).toContain("air réel à Dakar");
        expect(text("weather-board-air-map")).toContain("24 °C");
        expect(text("weather-board-air-own")).toContain("air réel à Auckland");
        expect(text("weather-board-air-own")).toContain("-3 °C");

        expect(text("weather-board-frost-result")).toBe("Pas de givre.");
        expect(find("weather-board-frost-air")?.getAttribute("data-air")).toBe("own");
        expect(text("weather-board-frost-air")).toContain("ton air");
        expect(text("weather-board-frost-audience")).toContain("toi seul");
        expect(text("weather-board-frost")).toContain("-3 °C et 45 % d'humidité : l'air est trop sec");
        expect(text("weather-board-frost")).toContain("Il gèle sans blanchir.");
        expect(text("weather-board-frost-change")).toMatch(/^→ Il givrerait avec plus de \d+ % d'humidité\.$/);

        expect(text("weather-board-downpour-result")).toBe("Elle tombe en pluie.");
        expect(find("weather-board-downpour-air")?.getAttribute("data-air")).toBe("map");
        expect(text("weather-board-downpour-audience")).toContain("tout le monde");
        expect(text("weather-board-downpour")).toContain("24 °C et 55 % d'humidité");
        expect(text("weather-board-downpour")).toContain("elle suit toujours l'air de la carte, pour tout le monde");
        expect(text("weather-board-downpour")).toContain("Ton air (Auckland) n'y change rien.");

        // Their own sky would snow, for them alone; the ground of the server is not theirs to see.
        expect(text("weather-board-precipitation-result")).toBe("Rien ne tombe. Ce serait de la neige.");
        expect(text("weather-board-precipitation-audience")).toContain("toi seul");
        expect(find("weather-board-soil-air")?.getAttribute("data-air")).toBe("map");
    });

    it("says what is not known rather than leaving a card empty", () => {
        render(
            input({
                mapAir: { byHand: false },
                precipitationAir: undefined,
                roomAir: undefined,
                frostAir: undefined,
                roomWind: undefined,
            }),
        );
        expect(text("weather-board-air-map")).toContain("inconnu");
        expect(text("weather-board-air-map")).toContain("air réel à Paris");
        for (const id of CARDS) {
            expect(text(`weather-board-${id}-result`)).not.toBe("");
            expect(text(`weather-board-${id}`)).not.toContain("undefined");
            expect(text(`weather-board-${id}`)).not.toContain("NaN");
        }
        expect(text("weather-board-precipitation")).toContain("n'est pas connue : sans elles, tout tombe en pluie");
        expect(text("weather-board-frost")).toContain("n'est pas connue : pas de givre");
        expect(text("weather-board-snow-result")).toBe("Le serveur n'a encore rien dit du sol de cette carte.");
    });

    it("says no frost is made up while the humidity alone is not known", () => {
        render(input({ frostAir: { temperature: -5, humidity: undefined, windSpeed: 3 } }));
        expect(text("weather-board-frost")).toContain("L'humidité de cet air n'est pas connue");
        expect(text("weather-board-frost")).not.toContain("undefined");
    });

    it("says the wind when it alone holds the frost back, and what would change it", () => {
        render(input({ frostAir: { temperature: -2, humidity: 95, windSpeed: 40 } }));
        expect(text("weather-board-frost")).toContain("Vent de 40 km/h");
        expect(text("weather-board-frost-change")).toMatch(
            /Il givrerait avec moins de \d+ km\/h de vent, ou plus de \d+ % d'humidité\./,
        );
    });

    it("says the wet bulb and its threshold for a rain", () => {
        render(input({ precipitationAir: { temperature: 5, humidity: 80 }, falling: true }));
        expect(text("weather-board-precipitation-result")).toBe("Il pleut.");
        expect(text("weather-board-precipitation")).toMatch(/Au-dessus de 1,5 °C, il fond : c'est de la pluie\./);
        expect(text("weather-board-precipitation-change")).toMatch(/Les premiers flocons viendraient sous/);
    });

    it("says the snow the server keeps is not shown to a player who follows a city", () => {
        render({ ...USER_CASE, snow: { map: 0.4, here: 1 } });
        expect(text("weather-board-snow-result")).toBe(
            "De la neige sur 40 % de la carte ; sous ton avatar, le sol est blanc à 100 %.",
        );
        expect(text("weather-board-snow")).toContain("Tu ne la vois pas : tu suis Auckland");
        expect(text("weather-board-snow")).toContain("24 °C sur la carte : elle fond.");
    });

    it("says what is drawn lags behind the air", () => {
        render(input({ frostAir: { temperature: -2, humidity: 95, windSpeed: 0 }, drawn: { frost: 0.1, ice: 0 } }));
        expect(text("weather-board-frost")).toContain("À l'écran : 10 %.");
    });

    it("keeps the rule of each card behind a disclosure reached by the keyboard", () => {
        render(input());
        const more = find("weather-board-frost")?.querySelector("details");
        expect(more?.open).toBe(false);
        expect(more?.querySelector("summary")?.textContent).toContain("En savoir plus");
        expect(more?.textContent).toContain("point de givrage");
    });
});
