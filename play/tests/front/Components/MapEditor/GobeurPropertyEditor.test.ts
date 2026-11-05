import type { GobeurPropertyData } from "@workadventure/map-editor";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import GobeurPropertyEditor from "../../../../src/front/Components/MapEditor/PropertyEditor/GobeurPropertyEditor.svelte";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const context = vi.hoisted(() => {
    const launch = vi.fn((_entityId: string) => Promise.resolve({ ok: true as const }));
    const stop = vi.fn();
    const remotePlayers = new Map<number, { userUuid: string; playerName: string }>();
    const areas: { id: string; name: string }[] = [];
    return { launch, stop, remotePlayers, areas };
});

vi.mock("../../../../src/front/Phaser/Game/GameManager", async () => {
    const { readable } = await import("svelte/store");
    const MapPlayersByKey = Object.assign(context.remotePlayers, {
        subscribe: readable(context.remotePlayers).subscribe,
    });
    const scene = {
        MapPlayersByKey,
        gobeurManager: { launch: context.launch, stop: context.stop },
        getGameMap: () => ({
            getWamFile: () => ({
                getGameMapAreas: () => ({ getAreas: () => new Map(context.areas.map((a) => [a.id, a])) }),
            }),
        }),
    };
    return { gameManager: { getCurrentGameScene: () => scene, getPlayerName: () => "Me" } };
});
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "local-uuid" }) },
}));

vi.mock("../../../../src/front/Stores/UserInputStore", async () => {
    const { writable } = await import("svelte/store");
    return { inputFormFocusStore: writable(false) };
});

function property(overrides: Partial<GobeurPropertyData> = {}): GobeurPropertyData {
    return {
        id: "property-id",
        type: "gobeurPropertyData",
        players: [],
        prisonAreaId: "",
        level: "beginner",
        durationSeconds: 180,
        ...overrides,
    };
}

function launchButton(target: HTMLElement): HTMLButtonElement {
    const button = target.querySelector<HTMLButtonElement>("[data-testid=gobeurLaunch]");
    if (!button) throw new Error("No launch button");
    return button;
}

describe("GobeurPropertyEditor", () => {
    const previousLocale = get(locale);
    const target = document.createElement("div");
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(async () => {
        document.body.appendChild(target);
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        target.remove();
        setLocale(previousLocale);
    });

    beforeEach(() => {
        context.remotePlayers.clear();
        context.areas.length = 0;
        context.areas.push({ id: "prison-area", name: "Prison" });
        vi.clearAllMocks();
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted, { outro: false });
        target.replaceChildren();
    });

    it("disables the launch without a prison and says why", () => {
        component = mount(GobeurPropertyEditor, {
            target,
            props: { property: property({ players: [{ uuid: "local-uuid", name: "Me" }] }), entityId: "entity-1" },
        });

        expect(launchButton(target).disabled).toBe(true);
        expect(target.textContent).toContain("Choisis une zone prison.");
    });

    it("launches the game of the entity with a prison and a present player chosen", async () => {
        context.remotePlayers.set(7, { userUuid: "remote-uuid", playerName: "Alice" });
        const onchange = vi.fn();
        component = mount(GobeurPropertyEditor, {
            target,
            props: { property: property({ prisonAreaId: "prison-area" }), entityId: "entity-1", onchange },
        });
        expect(launchButton(target).disabled).toBe(true);

        const alice = target.querySelector<HTMLInputElement>("input[data-testid='gobeurPlayer-remote-uuid']");
        if (!alice) throw new Error("No checkbox for Alice");
        alice.click();
        flushSync();

        expect(onchange).toHaveBeenCalledTimes(1);
        expect(launchButton(target).disabled).toBe(false);
        launchButton(target).click();
        await Promise.resolve();
        expect(context.launch).toHaveBeenCalledWith("entity-1");
    });

    it("greys a chosen player who is not here", () => {
        component = mount(GobeurPropertyEditor, {
            target,
            props: {
                property: property({ prisonAreaId: "prison-area", players: [{ uuid: "gone-uuid", name: "Bob" }] }),
                entityId: "entity-1",
            },
        });

        const bob = target.querySelector("[data-testid='gobeurAbsentPlayer-gone-uuid']");
        expect(bob?.textContent).toContain("Bob");
        expect(bob?.classList.contains("opacity-50")).toBe(true);
        expect(launchButton(target).disabled).toBe(true);
        expect(target.textContent).toContain("Choisis au moins un joueur présent.");
    });
});
