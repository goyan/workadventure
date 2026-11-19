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
});
