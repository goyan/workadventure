import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable, writable } from "svelte/store";

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const LL = readable({ actionbar: { visualisation: { weather: { close: () => "Close the board" } } } });
    return { default: LL, LL };
});

vi.mock("../../../../src/front/Stores/NightStore", () => ({
    nightDateStore: writable<Date | undefined>(new Date("2026-11-21T12:00:00Z")),
}));

vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            getGameMap: () => ({ getWamFile: () => undefined }),
            getMeadow: () => undefined,
            CurrentPlayer: undefined,
        }),
    },
}));

vi.mock("../../../../src/front/Phaser/Game/Weather/WeatherBoardNow", () => ({ weatherBoardNow: () => ({}) }));

vi.mock("../../../../src/front/Components/Visualisation/WeatherBoard.svelte", async () => {
    const mod = (await import("./WeatherBoardStub.svelte")) as { default: unknown };
    return { default: mod.default };
});

import WeatherBoardLive from "../../../../src/front/Components/Visualisation/WeatherBoardLive.svelte";
import { BOARD_BOTTOM_MARGIN_PX } from "../../../../src/front/Components/Visualisation/WeatherBoardFit";
import { weatherExplainedStore } from "../../../../src/front/Stores/VisualisationStore";

/** The column of the clock: the clock line at its top, the board below the panels it is mounted after. */
let column: HTMLElement;
let clockLine: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
/** Where the board would start in its place (px from the top of the window). */
let boardTop = 0;

const rect = (top: number, height: number): DOMRect => ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
});

function open(windowHeight: number, top: number): HTMLElement | null {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: windowHeight });
    boardTop = top;
    component = mount(WeatherBoardLive, { target: column });
    flushSync();
    return column.querySelector<HTMLElement>('[data-testid="weather-board-fit"]');
}

beforeEach(() => {
    column = document.createElement("div");
    clockLine = document.createElement("div");
    clockLine.setAttribute("data-testid", "clock-line");
    column.appendChild(clockLine);
    document.body.appendChild(column);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this === clockLine) return rect(8, 32);
        if (this === column) return rect(8, 900);
        // The anchor before the board, and anything else: where the board would start.
        return rect(boardTop, 0);
    });
    weatherExplainedStore.set(true);
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    column.remove();
    vi.restoreAllMocks();
});

describe("WeatherBoardLive", () => {
    it("keeps the board in its place, never past the bottom of the window", () => {
        const fit = open(950, 300);
        expect(fit?.getAttribute("data-overlay")).toBe("false");
        expect(fit?.style.maxHeight).toBe(`${950 - 300 - BOARD_BOTTOM_MARGIN_PX}px`);
        expect(column.querySelector('[data-testid="weather-board-close"]')).toBeNull();
    });

    it("lays the board over the panels under the clock line when too little room is left, with a close button", () => {
        // Two weather cards unfolded and the disasters above it, in a window of 950 points.
        const fit = open(950, 830);
        expect(fit?.getAttribute("data-overlay")).toBe("true");
        // Under the clock line (bottom at 40), from the top of the column (8): 8 px of gap.
        expect(fit?.style.top).toBe(`${40 + 8 - 8}px`);
        expect(fit?.style.maxHeight).toBe(`${950 - 48 - BOARD_BOTTOM_MARGIN_PX}px`);
        column.querySelector<HTMLButtonElement>('[data-testid="weather-board-close"]')?.click();
        expect(get(weatherExplainedStore)).toBe(false);
    });

    it("fits again when the window changes size", () => {
        const fit = open(950, 830);
        expect(fit?.getAttribute("data-overlay")).toBe("true");
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 1400 });
        window.dispatchEvent(new Event("resize"));
        flushSync();
        expect(fit?.getAttribute("data-overlay")).toBe("false");
        expect(fit?.style.maxHeight).toBe(`${1400 - 830 - BOARD_BOTTOM_MARGIN_PX}px`);
    });
});
