import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import { readable } from "svelte/store";

const actions = vi.hoisted(() => ({ apply: vi.fn(), close: vi.fn() }));
vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        actionbar: {
            cancel: label("Cancel"),
            placeToMap: {
                title: label("Apply this weather to the map?"),
                confirm: ({ place, mapPlace }: { place: string; mapPlace: string }) =>
                    `The map will follow ${place} instead of ${mapPlace}, for everyone. Day, night and seasons too.`,
                goesReal: ({ weather }: { weather: string }) => `The map switches to real weather (was ${weather}).`,
                leaveManual: label("Back to the real conditions"),
                followMap: label("Then see the weather of the map"),
                action: label("Apply"),
                error: label("Could not change"),
            },
        },
    });
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Components/Weather/placeToMapActions", () => ({ applyPlaceToMap: actions.apply }));
vi.mock("@wa-modals", () => ({ modals: { close: actions.close } }));

import PlaceToMapModal from "../../../../src/front/Components/Weather/PlaceToMapModal.svelte";

const POINT = {
    name: "Hong Kong 770 km",
    longName: "24° N 122° E · Hong Kong à 770 km",
    coordinates: "24° N 122° E",
    latitude: 24.2,
    longitude: 121.9,
};

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

function open(props: { mapWeather?: string; manual: boolean }): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(PlaceToMapModal, {
        target,
        props: { isOpen: true, place: POINT, mapPlace: "Lille", mapWeather: props.mapWeather, manual: props.manual },
    });
    flushSync();
}

function find(testId: string): HTMLElement | null {
    return target.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function applyButton(): HTMLButtonElement | undefined {
    return [...target.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Apply");
}

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    actions.apply.mockReset();
    actions.close.mockReset();
});

describe("PlaceToMapModal", () => {
    it("says the map changes for everyone, with its day, night and seasons, and goes real", () => {
        open({ mapWeather: "Auto", manual: false });
        expect(find("place-to-map-modal")?.textContent).toContain(
            "The map will follow 24° N 122° E · Hong Kong à 770 km instead of Lille, for everyone.",
        );
        expect(find("place-to-map-real")?.textContent?.trim()).toBe("The map switches to real weather (was Auto).");
        // No conditions set by hand: nothing to leave.
        expect(find("place-to-map-leave-manual")).toBeNull();
    });

    it("applies the place, leaving the conditions set by hand and following the map by default", async () => {
        actions.apply.mockResolvedValue(undefined);
        open({ manual: true });
        expect(find("place-to-map-real")).toBeNull();
        applyButton()?.click();
        await tick();
        await Promise.resolve();
        expect(actions.apply).toHaveBeenCalledWith(POINT, { leaveManual: true, followMap: true });
        await vi.waitFor(() => expect(actions.close).toHaveBeenCalledOnce());
    });

    it("keeps the conditions set by hand when unticked", () => {
        actions.apply.mockResolvedValue(undefined);
        open({ manual: true });
        find("place-to-map-leave-manual")?.querySelector("input")?.click();
        flushSync();
        applyButton()?.click();
        expect(actions.apply).toHaveBeenCalledWith(POINT, { leaveManual: false, followMap: true });
    });

    it("stays open and says so when the map could not be changed", async () => {
        actions.apply.mockRejectedValue(new Error("refused"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        open({ manual: false });
        applyButton()?.click();
        await vi.waitFor(() => expect(find("place-to-map-error")?.textContent?.trim()).toBe("Could not change"));
        expect(actions.close).not.toHaveBeenCalled();
    });
});
