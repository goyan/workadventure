// @vitest-environment node

import { render } from "svelte/server";
import { beforeAll, describe, expect, it } from "vitest";
import FloorLevelStack from "../../../../src/front/Components/Floors/FloorLevelStack.svelte";

import { setLocale } from "../../../../src/i18n/i18n-svelte";
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
});
