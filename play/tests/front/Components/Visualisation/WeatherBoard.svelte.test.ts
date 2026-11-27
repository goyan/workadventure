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
        mapFrostAir: air,
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
    mapFrostAir: { temperature: 24, humidity: 55, windSpeed: 12 },
    peaks: { iceMm: 0, snowMm: 0 },
});

const WARM = { temperature: 24, humidity: 55, windSpeed: 12 };
const COLD = { temperature: -3, humidity: 95, windSpeed: 2 };
/** A warm server, and a player who follows a cold and damp city where it snows. */
const WARM_SERVER_COLD_PLAYER = input({
    city: "Oslo",
    drawsOwnWeather: true,
    mapAir: { ...WARM, byHand: false, place: "Dakar" },
    ownAir: { ...COLD, byHand: false, place: "Oslo" },
    precipitationAir: COLD,
    roomAir: WARM,
    frostAir: COLD,
    mapFrostAir: WARM,
    falling: true,
    mapFalling: true,
    snow: { map: 0, here: 0 },
    peaks: { iceMm: 0, snowMm: 0 },
});
/** A cold server where it snows, and a player who follows a warm city under a clear sky. */
const COLD_SERVER_WARM_PLAYER = input({
    city: "Dakar",
    drawsOwnWeather: true,
    mapAir: { ...COLD, byHand: false, place: "Oslo" },
    ownAir: { ...WARM, byHand: false, place: "Dakar" },
    precipitationAir: WARM,
    roomAir: COLD,
    frostAir: WARM,
    mapFrostAir: COLD,
    falling: false,
    mapFalling: true,
    snow: { map: 0.6, here: 1 },
    roomWind: 2,
    peaks: { iceMm: 80, snowMm: 30 },
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

    it("reads the case that asked for it: why my screen has no frost, and why the downpour is a rain for all", () => {
        render(USER_CASE);
        expect(text("weather-board-follows")).toBe(
            "Tu suis Auckland : c'est son ciel et sa météo que tu vois, pour toi seul.",
        );
        expect(text("weather-board-air-map")).toContain("air réel à Dakar");
        expect(text("weather-board-air-map")).toContain("24 °C");
        expect(text("weather-board-air-own")).toContain("air réel à Auckland");
        expect(text("weather-board-air-own")).toContain("-3 °C");

        // The gaps at a glance, before the cards.
        expect(text("weather-board-summary")).toContain("Ton écran et la carte, en ce moment");
        expect(text("weather-board-summary-precipitation")).toBe(
            "Pluie ou neige ? : toi, rien ne tombe (ce serait de la neige) · carte, rien ne tombe (ce serait de la pluie) écart",
        );
        expect(text("weather-board-summary-downpour")).toBe(
            "Averse de la catastrophe : pluie, pour tout le monde serveur",
        );
        expect(text("weather-board-summary-frost")).toBe(
            "Givre au sol : toi, pas de givre · carte, pas de givre pareil",
        );
        expect(text("weather-board-summary-ice")).toBe(
            "Glace sur l'eau : toi, bords de l'eau gelés · carte, pas de glace écart",
        );
        expect(text("weather-board-summary-soil")).toBe("Sol gelé : pas gelé, pour tout le monde serveur");
        expect(text("weather-board-summary-snow")).toBe(
            "Neige au sol : pas encore connue, tenue par le serveur et non montrée chez toi serveur",
        );

        // No frost on my screen: my own air, too dry; the map has none either, so no doubled display.
        expect(text("weather-board-frost-result")).toBe("Pas de givre.");
        expect(find("weather-board-frost-air")?.getAttribute("data-air")).toBe("own");
        expect(text("weather-board-frost-air")).toContain("ton air");
        expect(text("weather-board-frost-audience")).toContain("toi seul");
        expect(text("weather-board-frost")).toContain("-3 °C et 45 % d'humidité : l'air est trop sec");
        expect(text("weather-board-frost")).toContain("Il gèle sans blanchir.");
        expect(text("weather-board-frost-change")).toMatch(/^→ Il givrerait avec plus de \d+ % d'humidité\.$/);
        expect(find("weather-board-frost-map")).toBeNull();
        expect(find("weather-board-frost-gap")).toBeNull();
        expect(text("weather-board-frost-same")).toBe(
            "Comme sur la carte : l'air de la carte donne le même résultat, pour tout le monde.",
        );

        // The downpour is a rain: the server lets it fall through its own warm air, for everyone.
        expect(text("weather-board-downpour-result")).toBe("Elle tombe en pluie.");
        expect(find("weather-board-downpour-air")?.getAttribute("data-air")).toBe("map");
        expect(text("weather-board-downpour-audience")).toContain("tout le monde");
        expect(text("weather-board-downpour")).toContain("24 °C et 55 % d'humidité");
        expect(text("weather-board-downpour-server")).toBe(
            "C'est le serveur qui la fait tomber : elle suit toujours l'air de la carte, pour tout le monde. Ton air (Auckland, -3 °C) n'y change rien : sur ton écran aussi, elle tombe comme sur la carte.",
        );

        // My own sky would snow where the map would rain: both set side by side, then what it means.
        expect(text("weather-board-precipitation-own")).toContain("Chez toi");
        expect(text("weather-board-precipitation-result")).toBe("Rien ne tombe. Ce serait de la neige.");
        expect(text("weather-board-precipitation-audience")).toContain("toi seul");
        expect(text("weather-board-precipitation-map")).toContain("Sur la carte (serveur)");
        expect(text("weather-board-precipitation-map-result")).toBe("Rien ne tombe. Ce serait de la pluie.");
        expect(text("weather-board-precipitation-map")).toContain("24 °C et 55 % d'humidité");
        expect(text("weather-board-precipitation-gap")).toContain(
            "Sur leur écran : rien ne tombe (ce serait de la pluie). Sur le tien : rien ne tombe (ce serait de la neige).",
        );
        expect(text("weather-board-precipitation-gap")).toContain("Pour le serveur, rien ne tombe sur la carte");

        // The edges of my water freeze; the water of the server stays liquid.
        expect(text("weather-board-ice-result")).toBe("Les bords de l'eau sont gelés.");
        expect(text("weather-board-ice-map-result")).toBe("Pas de glace.");
        expect(text("weather-board-ice-gap")).toContain("La glace de la carte est tenue par le serveur");

        // The soil is the server's: my cold air changes nothing to it.
        expect(find("weather-board-soil-air")?.getAttribute("data-air")).toBe("map");
        expect(text("weather-board-soil-result")).toBe("Le sol n'est pas gelé.");
        expect(text("weather-board-soil")).toContain("Ton air (-3 °C) n'y change rien : le sol est celui de la carte.");
        expect(text("weather-board-soil")).toContain("Pour le serveur le sol n'est pas gelé");
    });

    it("warm server, cold player: sets my snow, frost and ice against the rain of the map, and says what counts", () => {
        render(WARM_SERVER_COLD_PLAYER);
        expect(text("weather-board-summary-precipitation")).toBe("Pluie ou neige ? : toi, neige · carte, pluie écart");
        expect(text("weather-board-summary-frost")).toBe("Givre au sol : toi, givre · carte, pas de givre écart");
        expect(text("weather-board-summary-ice")).toBe(
            "Glace sur l'eau : toi, bords de l'eau gelés · carte, pas de glace écart",
        );

        expect(text("weather-board-precipitation-result")).toBe("Il neige.");
        expect(text("weather-board-precipitation-own")).toContain("-3 °C et 95 % d'humidité");
        expect(text("weather-board-precipitation-map-result")).toBe("Il pleut.");
        expect(text("weather-board-precipitation-map")).toContain("24 °C et 55 % d'humidité");
        expect(text("weather-board-precipitation-gap")).toContain(
            "Ceux qui suivent le serveur voient autre chose que toi. Sur leur écran : pluie. Sur le tien : neige.",
        );
        expect(text("weather-board-precipitation-gap")).toContain(
            "Pour le serveur, ce qui tombe sur la carte est de la pluie : elle remplit l'eau et mouille le sol, pour tout le monde, quoi que montre ton écran.",
        );

        expect(text("weather-board-frost-result")).toMatch(/^Givre \(\d+ %\) : le sol blanchit\.$/);
        expect(text("weather-board-frost-map-result")).toBe("Pas de givre.");
        expect(text("weather-board-frost-map")).toContain("24 °C dans l'air");
        expect(text("weather-board-frost-gap")).toContain("Sur leur écran : pas de givre. Sur le tien : givre.");
        expect(text("weather-board-frost-gap")).toContain(
            "Le givre n'est que dessiné, par chaque navigateur : le serveur n'en tient aucun compte.",
        );

        expect(text("weather-board-ice-map")).toContain("24 °C : l'eau ne gèle que sous 0 °C.");
        expect(text("weather-board-downpour-result")).toBe("Elle tombe en pluie.");
        expect(text("weather-board-soil")).toContain(
            "Pour le serveur le sol n'est pas gelé : son eau circule et l'herbe pousse",
        );
        expect(text("weather-board-snow-result")).toBe("Pas de neige au sol.");
    });

    it("cold server, warm player: my clear and mild screen against the snow, the frost and the frozen soil of the map", () => {
        render(COLD_SERVER_WARM_PLAYER);
        expect(text("weather-board-summary-precipitation")).toBe(
            "Pluie ou neige ? : toi, rien ne tombe (ce serait de la pluie) · carte, neige écart",
        );
        expect(text("weather-board-summary-downpour")).toBe(
            "Averse de la catastrophe : neige, pour tout le monde serveur",
        );
        expect(text("weather-board-summary-frost")).toBe("Givre au sol : toi, pas de givre · carte, givre écart");
        expect(text("weather-board-summary-soil")).toBe("Sol gelé : gelé, pour tout le monde serveur");
        expect(text("weather-board-summary-snow")).toBe(
            "Neige au sol : sur 60 % de la carte, tenue par le serveur et non montrée chez toi serveur",
        );

        expect(text("weather-board-precipitation-result")).toBe("Rien ne tombe. Ce serait de la pluie.");
        expect(text("weather-board-precipitation-map-result")).toBe("Il neige.");
        expect(text("weather-board-precipitation-gap")).toContain(
            "Sur leur écran : neige. Sur le tien : rien ne tombe",
        );
        expect(text("weather-board-precipitation-gap")).toContain(
            "Pour le serveur, ce qui tombe sur la carte est de la neige : elle s'accumule au sol sans apporter d'eau",
        );

        expect(text("weather-board-frost-result")).toBe("Pas de givre.");
        expect(text("weather-board-frost-own")).toContain("24 °C dans l'air");
        expect(text("weather-board-frost-map-result")).toMatch(/^Givre \(\d+ %\) : le sol blanchit\.$/);
        expect(text("weather-board-frost-gap")).toContain("Sur leur écran : givre. Sur le tien : pas de givre.");

        expect(text("weather-board-ice-result")).toBe("Pas de glace.");
        expect(text("weather-board-ice-map-result")).toBe("De la glace sur l'eau : jusqu'à 80 mm d'épaisseur.");
        expect(text("weather-board-ice-map")).toMatch(/-3 °C : elle épaissit de [\d,]+ mm par heure/);
        expect(text("weather-board-ice-gap")).toContain(
            "Sur leur écran : de la glace jusqu'à 80 mm. Sur le tien : pas de glace.",
        );

        expect(text("weather-board-downpour-result")).toBe("Elle tombe en neige.");
        expect(text("weather-board-downpour-server")).toContain("Ton air (Dakar, 24 °C) n'y change rien");

        expect(text("weather-board-soil-result")).toBe("Le sol est gelé.");
        expect(text("weather-board-soil")).toContain("Ton air (24 °C) n'y change rien");
        expect(text("weather-board-soil")).toContain(
            "Pour le serveur le sol est gelé : il garde son eau et l'herbe dort",
        );

        expect(text("weather-board-snow-result")).toBe(
            "De la neige sur 60 % de la carte ; sous ton avatar, le sol est blanc à 100 %.",
        );
        expect(text("weather-board-snow")).toContain(
            "Il neige sur la carte (100 % de flocons) : la couche s'épaissit. Tant qu'il neige, elle tient au sol jusqu'à 2 °C.",
        );
        expect(text("weather-board-snow-server")).toBe(
            "Tu ne la vois pas : tu suis Dakar, et cette neige est celle de la carte. Reviens au temps du serveur pour la voir.",
        );
    });

    it("answers why the downpour goes by 36 °C when it is -34 °C on my screen", () => {
        const hot = { temperature: 36, humidity: 19, windSpeed: 5 };
        const polar = { temperature: -34, humidity: 80, windSpeed: 15 };
        render(
            input({
                city: "Iakoutsk",
                drawsOwnWeather: true,
                mapAir: { ...hot, byHand: true },
                ownAir: { ...polar, byHand: false, place: "Iakoutsk" },
                precipitationAir: polar,
                roomAir: hot,
                frostAir: polar,
                mapFrostAir: hot,
            }),
        );
        expect(text("weather-board-summary-downpour")).toBe(
            "Averse de la catastrophe : pluie, pour tout le monde serveur",
        );
        expect(text("weather-board-downpour-result")).toBe("Elle tombe en pluie.");
        expect(find("weather-board-downpour-air")?.getAttribute("data-air")).toBe("map");
        expect(text("weather-board-downpour-air")).toContain("Décidé par l'air de la carte");
        expect(text("weather-board-downpour-audience")).toContain("Vu par tout le monde");
        expect(text("weather-board-downpour")).toContain("36 °C et 19 % d'humidité");
        expect(text("weather-board-downpour")).toContain("Au-dessus de 1,5 °C, il fond : c'est de la pluie.");
        expect(text("weather-board-downpour-server")).toBe(
            "C'est le serveur qui la fait tomber : elle suit toujours l'air de la carte, pour tout le monde. Ton air (Iakoutsk, -34 °C) n'y change rien : sur ton écran aussi, elle tombe comme sur la carte.",
        );
        // My own sky, it, is a snow, and my ground is white where the map's is not.
        expect(text("weather-board-precipitation-result")).toBe("Rien ne tombe. Ce serait de la neige.");
        expect(text("weather-board-precipitation-map-result")).toBe("Rien ne tombe. Ce serait de la pluie.");
        expect(text("weather-board-frost-own")).toContain("-34 °C et 80 % d'humidité");
        expect(text("weather-board-frost-map-result")).toBe("Pas de givre.");
        expect(text("weather-board-soil")).toContain("Ton air (-34 °C) n'y change rien");
    });

    it("says the ice and the snow that are there and melting, not what a warm air would form", () => {
        // The capture that asked for it: a warm air (24 °C, 49 %, 10 km/h) over a map still frozen and white.
        const warm = { temperature: 24, humidity: 49, windSpeed: 10 };
        render(
            input({
                mapAir: { ...warm, byHand: false, place: "Le Caire" },
                precipitationAir: warm,
                roomAir: warm,
                frostAir: warm,
                mapFrostAir: warm,
                snow: { map: 0.8, here: 1 },
                peaks: { iceMm: 100, snowMm: 12 },
                roomWind: 10,
            }),
        );
        expect(text("weather-board-ice-result")).toBe("De la glace sur l'eau : jusqu'à 10 cm d'épaisseur.");
        expect(text("weather-board-ice")).toContain(
            "24 °C sur la carte : elle fond de 7,1 mm par heure, partout pareil. La plus épaisse aura disparu dans environ 14 h ; la plus mince part d'abord.",
        );
        expect(text("weather-board-ice")).toContain("Ni le soleil, ni l'ombre, ni la profondeur ne changent la fonte.");
        expect(text("weather-board-ice")).toContain("Sur cette carte, la neige et la glace vont en temps réel.");
        // The rule of a player's own ice (edges under -1.8 °C…) is not the server's: not said here.
        expect(text("weather-board-ice")).not.toContain("Les bords gèlent sous");
        expect(text("weather-board-snow")).toContain("Au plus épais : 12 mm d'eau.");
        expect(text("weather-board-snow")).toMatch(
            /24 °C sur la carte : elle fond de [\d,]+ mm par heure\. La plus épaisse aura disparu dans environ \d+ (min|h)\./,
        );
    });

    it("goes as fast as the water of the map", () => {
        const warm = { temperature: 24, humidity: 49, windSpeed: 10 };
        render(
            input({
                roomAir: warm,
                frostAir: warm,
                mapFrostAir: warm,
                peaks: { iceMm: 100, snowMm: 0 },
                roomWind: 10,
                snowTimes: 60,
            }),
        );
        expect(text("weather-board-ice")).toContain("La plus épaisse aura disparu dans environ 14 min");
        expect(text("weather-board-ice")).toContain("60 fois plus vite qu'en vrai");
    });

    it("says no trend while the server lives the time the room missed: the thicknesses stay, they are true", () => {
        const warm = { temperature: 24, humidity: 49, windSpeed: 10 };
        render(
            input({
                roomAir: warm,
                frostAir: warm,
                mapFrostAir: warm,
                snow: { map: 0.8, here: 1 },
                peaks: { iceMm: 100, snowMm: 12, catchingUp: true },
                roomWind: 10,
            }),
        );
        const catching =
            "Le serveur rattrape le temps passé pendant que la carte était vide : la glace et la neige changent selon la météo de ce temps-là. La tendance reprend ensuite.";
        expect(text("weather-board-ice-result")).toBe("De la glace sur l'eau : jusqu'à 10 cm d'épaisseur.");
        expect(text("weather-board-ice")).toContain(catching);
        expect(text("weather-board-ice")).not.toContain("elle fond de");
        expect(text("weather-board-snow")).toContain("Au plus épais : 12 mm d'eau.");
        expect(text("weather-board-snow")).toContain(catching);
        expect(text("weather-board-snow")).not.toContain("elle fond de");
    });

    it("says the cold air of a cold snap lies on the map, held or let go, and that the ice thickens under it", () => {
        const mild = { temperature: 17.8, humidity: 50, windSpeed: 5 };
        render(
            input({
                roomAir: mild,
                frostAir: mild,
                mapFrostAir: mild,
                peaks: { iceMm: 33, snowMm: 0 },
                roomWind: 5,
                cold: { celsius: -80, secondsLeft: undefined },
            }),
        );
        expect(text("weather-board-cold")).toContain("Air froid sur la carte");
        expect(text("weather-board-cold")).toContain(
            "Un coup de froid a posé de l'air à -80 °C sur une partie de la carte.",
        );
        expect(text("weather-board-cold")).toContain("Un joueur le tient : il reste tant qu'il est tenu.");
        expect(text("weather-board-ice")).toContain(
            "Sous l'air froid d'un coup de froid, la glace épaissit au lieu de fondre.",
        );
    });

    it("says when the cold air let go is the air of the map again, and nothing without cold air", () => {
        render(input({ cold: { celsius: -20, secondsLeft: 150 } }));
        expect(text("weather-board-cold")).toContain("Relâché, il redevient l'air de la carte dans environ 3 min.");
        render(input());
        expect(find("weather-board-cold")).toBeNull();
    });

    it("says the server told nothing of the ice yet rather than no ice", () => {
        render(input());
        expect(text("weather-board-ice-result")).toBe("Le serveur n'a encore rien dit de la glace de cette carte.");
    });

    it("doubles nothing for a player who follows the server: one line says it is the weather of the map", () => {
        render(input({ frostAir: COLD, mapFrostAir: COLD, precipitationAir: COLD, roomAir: COLD, falling: true }));
        expect(find("weather-board-summary")).toBeNull();
        for (const id of ["precipitation", "frost", "ice"]) {
            expect(find(`weather-board-${id}-map`)).toBeNull();
            expect(find(`weather-board-${id}-gap`)).toBeNull();
            expect(text(`weather-board-${id}-same`)).toBe(
                "C'est la météo de la carte : la même pour tous ceux qui suivent le serveur.",
            );
        }
        expect(text("weather-board-downpour-server")).toBe(
            "C'est le serveur qui la fait tomber : elle suit toujours l'air de la carte, pour tout le monde.",
        );
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
        expect(text("weather-board-snow-server")).toContain("Tu ne la vois pas : tu suis Auckland");
        expect(text("weather-board-snow")).toContain("24 °C sur la carte : elle fond.");
    });

    /** A snow falls on the map, and some lies on it already. */
    const SNOWING = { mapFalling: true, falling: true, snow: { map: 0.2, here: 0 }, peaks: { iceMm: 0, snowMm: 5 } };

    it("says a snow that falls holds on the ground up to 2 °C", () => {
        // Montréal on 2026-11-27 as the user saw it: +1 °C, 96 %, 18 km/h.
        render(input({ ...SNOWING, roomAir: { temperature: 1, humidity: 96 }, roomWind: 18 }));
        expect(text("weather-board-snow")).toContain("Tant qu'il neige, elle tient au sol jusqu'à 2 °C.");
        expect(text("weather-board-snow")).not.toContain("En accéléré");
    });

    it("says a snow that falls sped up grows no thicker than a ground all white", () => {
        render(input({ ...SNOWING, roomAir: { temperature: 1, humidity: 96 }, roomWind: 18, snowfallCapMm: 15 }));
        expect(text("weather-board-snow")).toContain(
            "En accéléré, elle ne dépasse pas un sol tout blanc (15 mm d'eau) : sa fonte ne noie pas la carte.",
        );
    });

    it("says a snow that falls in a milder air melts as it falls", () => {
        render(input({ ...SNOWING, roomAir: { temperature: 4, humidity: 40 }, roomWind: 0 }));
        expect(text("weather-board-snow")).toContain(
            "mais à 4 °C elle fond en tombant : tant qu'il neige, elle ne tient au sol que jusqu'à 2 °C.",
        );
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
