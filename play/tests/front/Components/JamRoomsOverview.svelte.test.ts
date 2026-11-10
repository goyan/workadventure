import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import JamRoomsOverview from "../../../src/front/Components/ListeningZone/JamRoomsOverview.svelte";

vi.mock("../../../src/front/Components/ListeningZone/JamRoomsList.svelte", async () => {
    const mod = (await import("./JamRoomsListStub.svelte")) as { default: unknown };
    return { default: mod.default };
});
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const label = (text: string) => () => text;
    return {
        LL: readable({
            spotify: {
                listeningZone: {
                    roomsTitle: label("Jams en cours"),
                    createHint: label("hint"),
                },
            },
        }),
    };
});

describe("JamRoomsOverview panel", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
    });

    it("never shows a horizontal scroll bar: on Windows it is always drawn, and cuts the card under it", () => {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(JamRoomsOverview, { target });
        flushSync();
        const panel = target.querySelector<HTMLElement>('[data-testid="jam-rooms-panel"]');
        expect(panel).not.toBeNull();
        // overflow-y alone turns overflow-x into auto: anything wider than the panel would then scroll sideways.
        expect(panel?.classList.contains("overflow-y-auto")).toBe(true);
        expect(panel?.classList.contains("overflow-x-hidden")).toBe(true);
    });
});
