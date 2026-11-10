import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { writable } from "svelte/store";
import JamDrawer from "../../../src/front/Components/ListeningZone/JamDrawer.svelte";

const { rooms, currentZone } = vi.hoisted(() => {
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
        };
    }
    return { rooms: store<unknown[]>([]), currentZone: store<unknown>(undefined) };
});

vi.mock("../../../src/front/ListeningZone/ListeningZoneController", () => ({ allJamRoomsStore: rooms }));
vi.mock("../../../src/front/ListeningZone/ListeningZoneStore", () => ({ currentListeningZoneStore: currentZone }));
vi.mock("../../../src/front/ListeningZone/JamDrawerStore", () => ({ jamDrawer: undefined }));
vi.mock("../../../src/front/Components/ListeningZone/ListeningZoneBubble.svelte", async () => ({
    default: ((await import("./ListeningZoneBubbleStub.svelte")) as { default: unknown }).default,
}));
vi.mock("../../../src/front/Components/ListeningZone/JamRoomsOverview.svelte", async () => ({
    default: ((await import("./JamRoomsOverviewStub.svelte")) as { default: unknown }).default,
}));
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            spotify: {
                listeningZone: {
                    jamsButton: ({ count }: { count: number }) => `${count} Jams`,
                    showDrawer: () => "Show the Jams",
                    hideDrawer: () => "Hide the Jams",
                },
            },
        }),
    };
});

describe("JamDrawer", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;
    let open: ReturnType<typeof writable<boolean>>;
    let toggle: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        // jsdom has no Web Animations: the drawer slides with one. A stand-in animation that never ends is enough here.
        Element.prototype.animate = vi.fn(
            () => ({ cancel: vi.fn(), finished: new Promise(() => {}), onfinish: null }) as unknown as Animation,
        );
        rooms.set([]);
        currentZone.set(undefined);
        open = writable(false);
        toggle = vi.fn(() => open.update((value) => !value));
        target = document.createElement("div");
        document.body.appendChild(target);
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target.remove();
        delete (Element.prototype as Partial<Element>).animate;
    });

    function render(listening = false): void {
        component = mount(JamDrawer, { target, props: { drawer: { open, toggle }, listening } });
        flushSync();
    }

    const tab = () => target.querySelector<HTMLButtonElement>('[data-testid="jam-drawer-tab"]');
    const byTestId = (id: string) => target.querySelector(`[data-testid="${id}"]`);

    it("shows nothing away from the zones while no Jam is open", () => {
        render();
        expect(tab()).toBeNull();
    });

    it("shows only the icon, with the number of Jams, while closed", () => {
        rooms.set([{}, {}]);
        render();
        expect(tab()?.textContent).toContain("2");
        expect(tab()?.getAttribute("aria-expanded")).toBe("false");
        expect(byTestId("jam-drawer-panel")).toBeNull();
    });

    it("pulls out the list of Jams on a click on the icon, and pushes it back with the arrow", () => {
        rooms.set([{}]);
        render();
        tab()?.click();
        flushSync();
        expect(toggle).toHaveBeenCalledOnce();
        expect(tab()?.getAttribute("aria-expanded")).toBe("true");
        expect(byTestId("overview")).not.toBeNull();

        target.querySelector<HTMLButtonElement>('[data-testid="jam-drawer-close"]')?.click();
        flushSync();
        expect(toggle).toHaveBeenCalledTimes(2);
        expect(tab()?.getAttribute("aria-expanded")).toBe("false");
    });

    it("shows the zone's own panel inside a listening zone, even with no Jam yet", () => {
        currentZone.set({ areaId: "a" });
        open.set(true);
        render();
        expect(tab()).not.toBeNull();
        expect(byTestId("bubble")).not.toBeNull();
        expect(byTestId("overview")).toBeNull();
    });

    it("marks the icon while a Jam is being listened to", () => {
        rooms.set([{}]);
        render(true);
        expect(tab()?.dataset.listening).toBe("true");
    });
});
