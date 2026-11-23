import { ICE_BEARS_MM, iceThawMmPerHour, PX_PER_MM, snowMeltMmPerHour } from "@workadventure/map-editor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { pipetteSections } from "../../../../src/front/Components/Visualisation/pipetteText";
import type { PipetteSection } from "../../../../src/front/Components/Visualisation/pipetteText";
import { explainCell } from "../../../../src/front/Phaser/Game/Weather/CellExplained";
import type { CellInput } from "../../../../src/front/Phaser/Game/Weather/CellExplained";
import { LL, locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const cairo = { temperature: 24, humidity: 49, windSpeed: 10 };
const frost = { temperature: -10, humidity: 70, windSpeed: 0 };
const dry = { iceMm: 0, snowMm: 0, grass: 0.6, moisture: 0.3, dryness: 0, fire: 0, ash: 0 };

/** A cell of dry earth outdoors on the ground of the server, under a warm air; each test changes what it is about. */
function cell(changes: Partial<CellInput> = {}): CellInput {
    return {
        city: undefined,
        ground: "map",
        outdoor: true,
        reading: { ground: 0, soil: "earth", roughness: 0.03 },
        depthPx: 0,
        deep: false,
        current: undefined,
        hold: "none",
        kept: dry,
        own: { snowMm: 0, frost: 0 },
        weather: cairo,
        snowing: false,
        times: 1,
        soilFrost: 0,
        sunElevation: 35,
        ...changes,
    };
}

/** Two metres of water under the cell, deep enough to swim. */
const lake = (changes: Partial<CellInput> = {}): Partial<CellInput> => ({
    reading: { ground: -2, surface: 0, depth: 2, soil: "earth", roughness: 0.03 },
    depthPx: 58,
    deep: true,
    current: { speed: 0, heading: 0 },
    ...changes,
});

describe("explainCell", () => {
    it("says where the ice of a cell goes by the rules of the server, never thicker than its water", () => {
        const explained = explainCell(cell(lake({ kept: { ...dry, iceMm: 100 }, hold: "solid" })));
        expect(explained.ice).toMatchObject({ hold: "solid", why: "ice" });
        expect(explained.ice.kept).toMatchObject({ mm: 100, trend: "thawing", bears: true });
        expect(explained.ice.kept?.mmPerHour).toBe(iceThawMmPerHour(cairo));
        expect(explained.snow.kept.trend).toBe("none");
        // In the frost, a water of 30 mm holds no ice that bears.
        const shallow = explainCell(
            cell(lake({ depthPx: 30 * PX_PER_MM, deep: false, weather: frost, kept: { ...dry, iceMm: 10 } })),
        );
        expect(shallow.ice.kept).toMatchObject({ trend: "growing" });
        expect(shallow.ice.kept?.bearsIn).toBeUndefined();
        expect(ICE_BEARS_MM).toBeGreaterThan(30);
    });

    it("says why there is no ice: no water, indoors, a warm air, a water running too fast", () => {
        expect(explainCell(cell()).ice).toMatchObject({ why: "noWater", kept: undefined });
        expect(explainCell(cell(lake({ outdoor: false }))).ice).toMatchObject({ why: "indoor", hold: "none" });
        expect(explainCell(cell(lake())).ice.why).toBe("warm");
        expect(explainCell(cell(lake({ weather: frost, current: { speed: 1.5, heading: 90 } }))).ice.why).toBe(
            "current",
        );
        expect(explainCell(cell(lake({ weather: frost }))).ice.why).toBe("taking");
        expect(explainCell(cell(lake({ weather: undefined }))).ice.why).toBe("unknown");
    });

    it("tells how the water runs against the speeds at which an ice takes", () => {
        const run = (speed: number) => explainCell(cell(lake({ current: { speed, heading: 0 } }))).water?.run;
        expect(run(0)).toBe("still");
        expect(run(0.3)).toBe("runs");
        expect(run(0.9)).toBe("slush");
        expect(run(1.2)).toBe("open");
        expect(explainCell(cell(lake({ current: undefined }))).water?.run).toBe("unknown");
    });

    it("reads the snow of the tile on a ground kept tile by tile, the even snow of their city else", () => {
        const kept = explainCell(cell({ kept: { ...dry, snowMm: 12 } }));
        expect(kept.snow.kept).toMatchObject({ mm: 12, trend: "thawing" });
        expect(kept.snow.kept.meltMmPerHour).toBe(snowMeltMmPerHour(cairo));
        const own = explainCell(cell({ ground: "own", city: "Oslo", kept: undefined, own: { snowMm: 8, frost: 0.4 } }));
        expect(own).toMatchObject({ audience: "you", frost: 0.4, meadow: undefined });
        expect(own.snow.kept.mm).toBe(8);
        // Indoors nothing of the sky lies.
        expect(
            explainCell(cell({ ground: "own", kept: undefined, outdoor: false, own: { snowMm: 8, frost: 0.4 } })),
        ).toMatchObject({ frost: 0, snow: { cover: 0 } });
    });
});

describe("pipetteSections (fr-FR)", () => {
    const previousLocale = get(locale);
    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });
    afterAll(() => {
        setLocale(previousLocale);
    });

    const sections = (input: CellInput): Record<PipetteSection["id"], PipetteSection> => {
        const all = pipetteSections(get(LL), "fr-FR", explainCell(input));
        return Object.fromEntries(all.map((section) => [section.id, section])) as Record<
            PipetteSection["id"],
            PipetteSection
        >;
    };

    it("says an ice that thaws: its thickness, how fast, when it gives way and is gone, and what it bears", () => {
        // The capture that asked for it: ice off the shore under an air at 24 °C.
        const said = sections(cell(lake({ kept: { ...dry, iceMm: 100, grass: 0 }, hold: "solid" })));
        expect(said.water.lines).toEqual(["2 m d'eau, surface à 0 m.", "On y nage.", "Elle est immobile."]);
        expect(said.ice.lines).toEqual([
            "Glace de 10 cm d'épaisseur.",
            "24 °C : elle fond de 7,1 mm par heure. Elle aura disparu dans environ 14 h.",
            "Elle porte un marcheur (il faut 50 mm).",
            "Elle ne portera plus dans environ 7 h.",
            "Pas assez épaisse pour une cabane de pêche (il faut 10,2 cm).",
        ]);
        expect(said.ice).toMatchObject({ owner: "map", audience: "serverFollowers" });
        expect(said.sun.lines).toEqual([
            "Le soleil est à 35° au-dessus de l'horizon.",
            "Seul l'air compte : sa température, son vent, son humidité. Ni le soleil, ni l'ombre, ni la profondeur ne changent la fonte.",
            "Sur cette carte, la neige et la glace vont en temps réel.",
        ]);
    });

    it("says a thin ice cracks, and a thick one takes a shack", () => {
        expect(sections(cell(lake({ kept: { ...dry, iceMm: 20 }, hold: "thin" }))).ice.lines).toContain(
            "Trop mince pour porter un marcheur là où on nage (il faut 50 mm) : elle craque et cède.",
        );
        expect(sections(cell(lake({ kept: { ...dry, iceMm: 150 }, hold: "solid" }))).ice.lines).toContain(
            "Assez épaisse pour une cabane de pêche (il faut 10,2 cm).",
        );
    });

    it("says an open water that runs too fast to freeze, in the frost", () => {
        const said = sections(cell(lake({ weather: frost, current: { speed: 1.5, heading: 90 } })));
        expect(said.water.lines).toContain("Elle court à 1,5 m/s, vers E.");
        expect(said.ice.lines).toEqual([
            "Pas de glace.",
            "L'eau court à 1,5 m/s : trop vite pour qu'une glace prenne (aucune à partir de 1,2 m/s).",
        ]);
    });

    it("says an ice that takes in the frost, slower on a running water and under the snow, and when it will bear", () => {
        const still = sections(cell(lake({ weather: frost, kept: { ...dry, iceMm: 20, snowMm: 10 }, hold: "thin" })));
        expect(still.ice.lines[0]).toBe("Glace de 20 mm d'épaisseur.");
        expect(still.ice.lines[1]).toMatch(/^-10 °C : elle épaissit de [\d,]+ mm par heure, de moins en moins vite\.$/);
        expect(still.ice.lines).toContain("La neige posée dessus ralentit sa prise.");
        expect(
            still.ice.lines.some((line) => /^Elle portera un marcheur dans environ \d+ (min|h|j)\.$/.test(line)),
        ).toBe(true);
        const running = sections(cell(lake({ weather: frost, current: { speed: 0.9, heading: 180 } })));
        expect(running.ice.lines).toContain(
            "L'eau court à 0,9 m/s : la glace y prend 50 % moins vite (aucune à partir de 1,2 m/s).",
        );
        expect(running.ice.lines).toContain("-10 °C : il gèle, la glace commence à prendre.");
    });

    it("says an open water under a warm air", () => {
        expect(sections(cell(lake())).ice.lines).toEqual(["Pas de glace.", "24 °C : l'eau ne gèle que sous 0 °C."]);
    });

    it("says the snow of a cell: how much, how white, how fast it melts and when it is gone", () => {
        const said = sections(cell({ kept: { ...dry, snowMm: 12 } }));
        expect(said.snow.lines[0]).toBe("Neige : 12 mm d'eau, sol blanc à 80 %.");
        expect(said.snow.lines[1]).toMatch(
            /^24 °C : elle fond de [\d,]+ mm par heure\. Elle aura disparu dans environ \d+ (min|h)\.$/,
        );
        expect(said.ice.lines).toEqual(["Pas d'eau, donc pas de glace."]);
        expect(said.water.lines).toEqual(["Pas d'eau ici."]);
    });

    it("says a dry ground: its relief and soil, no water, no ice, no snow, its grass", () => {
        const said = sections(cell({ reading: { ground: 1.6, soil: "meadow", roughness: 0.035 } }));
        expect(said.relief.lines).toEqual(["Sol à +1,6 m. Prairie.", "Dehors."]);
        expect(said.snow.lines).toEqual(["Pas de neige."]);
        expect(said.frost.lines).toEqual([
            "Pas de givre.",
            "Le givre est dessiné par ton navigateur, pour toi.",
            "Le sol n'est pas gelé.",
            "Calculé par le serveur avec l'air de la carte, pour tout le monde.",
        ]);
        expect(said.meadow.lines).toEqual(["Herbe : 60 %. Humidité du sol : 30 %."]);
        // Nothing thaws there: the sun says only where it is.
        expect(said.sun.lines).toEqual(["Le soleil est à 35° au-dessus de l'horizon."]);
    });

    it("says a grass dry, burning or burnt, a frozen soil, a frost, a sun down", () => {
        const said = sections(
            cell({
                kept: { ...dry, dryness: 0.7, fire: 0.5, ash: 0.2 },
                own: { snowMm: 0, frost: 0.6 },
                soilFrost: 1,
                sunElevation: -12,
            }),
        );
        expect(said.meadow.lines).toEqual([
            "Herbe : 60 %. Humidité du sol : 30 %.",
            "Herbe sèche à 70 %.",
            "En feu.",
            "Cendres d'un feu.",
        ]);
        expect(said.frost.lines).toContain("Givre : sol blanc à 60 %.");
        expect(said.frost.lines).toContain("Sol gelé à 100 % : il garde son eau, l'herbe dort.");
        expect(said.sun.lines).toEqual(["Le soleil est couché."]);
    });

    it("says indoors, and the ice of a player's own city", () => {
        expect(sections(cell(lake({ outdoor: false }))).ice.lines).toEqual(["À l'intérieur, l'eau ne gèle jamais."]);
        const own = sections(cell(lake({ ground: "own", city: "Oslo", kept: undefined, hold: "thin" })));
        expect(own.ice.lines).toEqual([
            "Elle craque et cède sous toi.",
            "Ta glace suit le froid de ta ville : elle n'a pas d'épaisseur tenue par le serveur.",
        ]);
        expect(own.ice).toMatchObject({ owner: "own", audience: "you" });
    });

    it("says nothing of a grass under water, and that a ground of their own is not kept tile by tile on land", () => {
        expect(sections(cell(lake())).meadow).toBeUndefined();
        expect(sections(cell(lake({ ground: "own", city: "Oslo", kept: undefined }))).meadow).toBeUndefined();
        expect(sections(cell({ ground: "own", city: "Oslo", kept: undefined })).meadow.lines).toEqual([
            "Le sol de cette case n'est pas tenu case par case chez toi.",
        ]);
    });

    it("says a heated pool never freezes, whatever ice the tile was told and however cold", () => {
        const said = sections(
            cell(
                lake({
                    reading: { ground: -1, surface: 0, depth: 1, soil: "pool", roughness: 0.01 },
                    pool: { hot: true },
                    weather: frost,
                    kept: { ...dry, iceMm: 30 },
                    hold: "none",
                }),
            ),
        );
        expect(said.relief.lines[0]).toBe("Sol à -1 m. Piscine.");
        expect(said.water.lines).toContain(
            "Piscine chauffée : son eau ne gèle pas et fait fondre la neige qui y tombe.",
        );
        expect(said.ice.lines).toEqual(["Piscine chauffée : elle ne gèle jamais."]);
        // A pool that is not heated freezes as any water.
        const cold = sections(cell(lake({ pool: { hot: false }, weather: frost, kept: { ...dry, iceMm: 30 } })));
        expect(cold.ice.lines[0]).toBe("Glace de 30 mm d'épaisseur.");
    });

    it("says the raised floors drawn over the cell, the highest first: the ground under them is what is read", () => {
        const said = sections(cell({ floorsOver: [128, 64] }));
        expect(said.relief.lines).toEqual([
            "Sol à 0 m. Terre.",
            "Dehors.",
            "Un palier à +4,4 m couvre cette case : la pipette lit le sol dessous.",
            "Un palier à +2,2 m couvre cette case : la pipette lit le sol dessous.",
        ]);
    });

    it("says the shade or the light of the cell by day, when the shadows of the sky are drawn, never indoors", () => {
        expect(sections(cell({ shaded: true })).sun.lines).toEqual([
            "Le soleil est à 35° au-dessus de l'horizon.",
            "Cette case est à l'ombre (les ombres du ciel dessinées chez toi).",
        ]);
        expect(sections(cell({ shaded: false })).sun.lines).toContain("Cette case est en pleine lumière.");
        expect(sections(cell({ shaded: true, sunElevation: -5 })).sun.lines).toEqual(["Le soleil est couché."]);
        expect(sections(cell({ shaded: true, outdoor: false })).sun.lines).toEqual([
            "Le soleil est à 35° au-dessus de l'horizon.",
        ]);
        expect(sections(cell()).sun.lines).toEqual(["Le soleil est à 35° au-dessus de l'horizon."]);
    });

    it("goes as fast as the water of the map", () => {
        const said = sections(cell(lake({ kept: { ...dry, iceMm: 100 }, hold: "solid", times: 60 })));
        expect(said.ice.lines[1]).toBe("24 °C : elle fond de 428 mm par heure. Elle aura disparu dans environ 14 min.");
        expect(said.sun.lines).toContain(
            "Sur cette carte, la neige et la glace vont 60 fois plus vite qu'en vrai (la vitesse de l'eau).",
        );
    });
});
