// @vitest-environment node

import { render } from "svelte/server";
import { beforeAll, describe, expect, it } from "vitest";

import { get } from "svelte/store";
import { SOILS } from "@workadventure/map-editor";
import FloorLevelStack from "../../../../src/front/Components/Floors/FloorLevelStack.svelte";
import { SOIL_NAME_CH } from "../../../../src/front/Phaser/Game/Floors/AvatarAltitude";
import { LL, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocale } from "../../../../src/i18n/i18n-util.sync";

beforeAll(() => {
    loadLocale("fr-FR");
    setLocale("fr-FR");
});

const stack = {
    levels: [
        { elevation: 52, name: "Niveau 2" },
        { elevation: 0, name: "Sol" },
    ],
    current: 52,
};

describe("FloorLevelStack", () => {
    it("shows nothing without floors", () => {
        expect(render(FloorLevelStack, { props: { stack: undefined } }).body).not.toContain("Sol");
    });

    it("stays collapsed by default and shows auto mode with the current floor", () => {
        const { body } = render(FloorLevelStack, { props: { stack } });
        expect(body).toContain('aria-haspopup="menu"');
        expect(body).toContain('aria-expanded="false"');
        expect(body).toContain("Auto · Niveau 2");
        expect(body).not.toContain("<select");
        expect(body).not.toContain('role="menu"');
    });

    it("shows the manually viewed floor", () => {
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, viewed: 0 } } });
        expect(body).toContain(">Sol</span>");
        expect(body).not.toContain("Auto ·");
    });

    it("tells the altitude of the avatar on a map with a relief", () => {
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48 } } });
        expect(body).toContain('data-testid="avatar-altitude"');
        expect(body).toContain("+1,6 m");
        expect(render(FloorLevelStack, { props: { stack } }).body).not.toContain("avatar-altitude");
    });

    it("tells the ground under the pointer, and no water where there is none", () => {
        const { body } = render(FloorLevelStack, {
            props: { stack: { ...stack, altitude: 48, pointer: { ground: -3.6 } } },
        });
        expect(body).toContain('data-testid="pointer-ground"');
        expect(body).toContain("Sol sous le curseur");
        expect(body).toContain("-3,6 m");
        expect(body).toContain('data-testid="pointer-water"');
        expect(body).toContain("Pas d’eau");
        expect(body).not.toContain("Profondeur");
    });

    it("tells the surface of the water under the pointer and its depth", () => {
        const pointer = { ground: -3.6, surface: -1.2, depth: 2.4 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain("Surface de l’eau");
        expect(body).toContain("-1,2 m");
        expect(body).toContain("Profondeur 2,4 m");
        expect(body).not.toContain("Surface de la glace");
    });

    it("tells a frozen surface as ice", () => {
        const pointer = { ground: -3.6, surface: -1.2, depth: 2.4, ice: true };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain("Surface de la glace");
        expect(body).toContain("-1,2 m");
    });

    it("tells a film of water as less than a decimetre deep, not as nothing", () => {
        const pointer = { ground: -3.6, surface: -3.6, depth: 0 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain("Profondeur &lt; 0,1 m");
    });

    it("keeps the altitude of the avatar on a raised floor, and tells the ground and the water under the pointer", () => {
        const pointer = { ground: -3.6, surface: -1.2, depth: 2.4 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 52, pointer } } });
        expect(body).toContain("+1,8 m");
        expect(body).toContain("-3,6 m");
        expect(body).toContain("-1,2 m");
    });

    it("keeps its line while the pointer is off the game, so that nothing moves under it", () => {
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48 } } });
        expect(body).toContain('data-testid="pointer-ground"');
        expect(body).toContain("Curseur hors du jeu");
        // Without a relief, no line at all.
        expect(render(FloorLevelStack, { props: { stack } }).body).not.toContain("pointer-ground");
    });

    it("speaks English in en-US", () => {
        loadLocale("en-US");
        setLocale("en-US");
        const pointer = { ground: -3.6, surface: -1.2, depth: 2.4 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain("Ground under the pointer");
        expect(body).toContain("Water surface");
        expect(body).toContain("Depth 2.4 m");
        expect(body).toContain("-1.2 m");
        loadLocale("fr-FR");
        setLocale("fr-FR");
    });

    it("names the soil under the pointer, its roughness in the hint, and a pool as such", () => {
        const sand = { ground: -3.6, soil: "sand" as const, roughness: 0.025 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer: sand } } });
        expect(body).toContain('data-testid="pointer-soil"');
        expect(body).toContain(">Sable<");
        expect(body).toContain("Rugosité (Manning) 0,025");
        const pool = { ground: -1.5, soil: "pool" as const, roughness: 0.03 };
        expect(render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer: pool } } }).body).toContain(
            ">Piscine<",
        );
    });

    it("tells a cell not painted as the earth the water reads there", () => {
        const pointer = { ground: 0, roughness: 0.03 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain(">Terre<");
        expect(body).toContain("Terre (non peint)");
    });

    it("reserves the room of the longest soil name, in French as in English", () => {
        const names = ["fr-FR", "en-US"].flatMap((lang) => {
            loadLocale(lang as "fr-FR" | "en-US");
            setLocale(lang as "fr-FR" | "en-US");
            const ll = get(LL);
            return [...SOILS.map((soil) => ll.mapEditor.terrain.soils[soil]()), ll.mapEditor.terrain.pool()];
        });
        loadLocale("fr-FR");
        setLocale("fr-FR");
        expect(Math.max(...names.map((name) => name.length))).toBeLessThanOrEqual(SOIL_NAME_CH);
        const pointer = { ground: 0, soil: "gravel" as const, roughness: 0.03 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain(`min-width: ${SOIL_NAME_CH}ch`);
    });

    it("names the soil in English in en-US", () => {
        loadLocale("en-US");
        setLocale("en-US");
        const pointer = { ground: 0, roughness: 0.03 };
        const { body } = render(FloorLevelStack, { props: { stack: { ...stack, altitude: 48, pointer } } });
        expect(body).toContain("Earth (unpainted)");
        expect(body).toContain("Roughness (Manning) 0.03");
        loadLocale("fr-FR");
        setLocale("fr-FR");
    });
});
