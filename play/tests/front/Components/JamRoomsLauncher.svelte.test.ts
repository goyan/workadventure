import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import JamRoomsLauncher from "../../../src/front/Components/ListeningZone/JamRoomsLauncher.svelte";

const { rooms, currentZone, panelOpen } = vi.hoisted(() => {
    // vi.hoisted runs before the imports: the stores cannot come from "svelte/store" here, so they are tiny stand-ins.
    function store<T>(value: T) {
        const subscribers = new Set<(value: T) => void>();
        return {
            subscribe(run: (value: T) => void) {
                subscribers.add(run);
                run(value);
                return () => subscribers.delete(run);
            },
            set(next: T) {
                value = next;
                subscribers.forEach((run) => run(value));
            },
            update(change: (value: T) => T) {
                this.set(change(value));
            },
        };
    }
    return { rooms: store<unknown[]>([]), currentZone: store<unknown>(undefined), panelOpen: store(true) };
});

vi.mock("../../../src/front/ListeningZone/ListeningZoneController", () => ({ allJamRoomsStore: rooms }));
vi.mock("../../../src/front/ListeningZone/ListeningZoneStore", () => ({
    currentListeningZoneStore: currentZone,
    jamRoomsPanelOpenStore: panelOpen,
}));
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
                    jamsButton: label("Jams"),
                    roomsTitle: label("Jams en cours"),
                    createHint: label("hint"),
                },
            },
        }),
    };
});

describe("JamRoomsLauncher panel", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
    });

    it("never shows a horizontal scroll bar: on Windows it is always drawn, and cuts the card under it", () => {
        rooms.set([{}]);
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(JamRoomsLauncher, { target });
        flushSync();
        const panel = target.querySelector<HTMLElement>('[data-testid="jam-rooms-panel"]');
        expect(panel).not.toBeNull();
        // overflow-y alone turns overflow-x into auto: anything wider than the panel would then scroll sideways.
        expect(panel?.classList.contains("overflow-y-auto")).toBe(true);
        expect(panel?.classList.contains("overflow-x-hidden")).toBe(true);
    });
});
