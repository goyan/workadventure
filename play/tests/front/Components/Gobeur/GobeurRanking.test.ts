import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import GobeurRanking from "../../../../src/front/Components/Gobeur/GobeurRanking.svelte";
import { gobeurRankingStore } from "../../../../src/front/Stores/GobeurStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

vi.mock("../../../../src/front/Phaser/Game/GameManager", async () => {
    const { readable } = await import("svelte/store");
    // The property knows p1 under another name than the one shown around: the property wins.
    const remotePlayers = new Map([
        [1, { userUuid: "p1", playerName: "Around one" }],
        [2, { userUuid: "p2", playerName: "Around two" }],
    ]);
    const MapPlayersByKey = Object.assign(remotePlayers, { subscribe: readable(remotePlayers).subscribe });
    const entity = {
        getProperties: () => [
            {
                id: "gobeur",
                type: "gobeurPropertyData",
                players: [{ uuid: "p1", name: "Chosen one" }],
                prisonAreaId: "prison",
                level: "beginner",
                durationSeconds: 180,
            },
        ],
    };
    const scene = {
        MapPlayersByKey,
        getGameMapFrontWrapper: () => ({
            getEntitiesManager: () => ({ getEntities: () => new Map([["entity-1", entity]]) }),
        }),
    };
    return { gameManager: { getCurrentGameScene: () => scene, getPlayerName: () => "Me" } };
});
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "local-uuid" }) },
}));

describe("GobeurRanking", () => {
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

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted, { outro: false });
        target.replaceChildren();
        gobeurRankingStore.set(undefined);
    });

    it("names the players from the property, then the players around, then the uuid", () => {
        gobeurRankingStore.set({
            entityId: "entity-1",
            reason: "timeUp",
            ranking: [
                { uuid: "p1", status: "survivor" },
                { uuid: "p2", status: "caught" },
                { uuid: "abcdef1234567890", status: "left" },
            ],
        });
        component = mount(GobeurRanking, { target });
        flushSync();

        const rows = [...target.querySelectorAll("li")].map((row) => row.textContent?.replace(/\s+/g, " ").trim());
        expect(rows).toEqual(["1. Chosen one Survivant", "2. Around two Gobé", "3. abcdef12 Parti"]);
        expect(target.textContent).toContain("Classement du Gobeur");
        expect(target.textContent).toContain("Le temps est écoulé.");
    });

    it("closes", () => {
        gobeurRankingStore.set({
            entityId: "entity-1",
            reason: "stopped",
            ranking: [{ uuid: "p1", status: "survivor" }],
        });
        component = mount(GobeurRanking, { target });
        flushSync();

        target.querySelector<HTMLButtonElement>("[data-testid=gobeurRankingClose]")?.click();
        flushSync();

        expect(get(gobeurRankingStore)).toBeUndefined();
        expect(target.querySelector("[data-testid=gobeurRanking]")).toBeNull();
    });
});
