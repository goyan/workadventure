import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { GameScene } from "../Game/GameScene";
import type { UsernameDomLayer } from "../Game/UsernameDomLayer";
import { UsernameDisplay } from "./UsernameDisplay";

vi.mock("phaser", () => ({ Scenes: { Events: { RENDER: "render" } } }));
vi.mock("../Services/WaScaleManager", () => ({
    waScaleManager: { zoomModifier: 1 },
    WaScaleManagerEvent: { ZoomChanged: "zoom-changed" },
}));

describe("username hover", () => {
    afterEach(() => document.body.replaceChildren());

    it("highlights the name and releases selection on leave, hiding, and destruction", () => {
        const layer = document.createElement("div");
        document.body.append(layer);
        const scene = Object.assign(mock<GameScene>(), {
            events: mock<GameScene["events"]>(),
            game: { events: mock<GameScene["game"]["events"]>() },
            usernameDomLayer: mock<UsernameDomLayer>({
                addUsername: (node) => layer.append(node),
                getAncestorScale: () => 1,
            }),
        });
        const onHover = vi.fn((hovered: boolean): void => {
            display.setPlayerNameOutlineColor(hovered ? 0x6856cc : undefined);
            display.setToForeFront(hovered);
        });
        const display = new UsernameDisplay(scene, 100, 200, "Alice", undefined, onHover);
        const node = layer.querySelector<HTMLDivElement>(".username-display");
        const background = node?.style.background;
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        expect(onHover.mock.lastCall).toEqual([true]);
        expect(node?.style.background).not.toBe(background);
        expect(Number(node?.style.zIndex)).toBeGreaterThan(1000000000);
        node?.dispatchEvent(new MouseEvent("mouseleave"));
        expect(onHover.mock.lastCall).toEqual([false]);
        expect(node?.style.background).toBe(background);
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        display.setVideoBubbleVisible(true);
        expect(onHover.mock.lastCall).toEqual([false]);
        display.setVideoBubbleVisible(false);
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        display.destroy();
        expect(onHover.mock.lastCall).toEqual([false]);
        onHover.mockClear();
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        node?.dispatchEvent(new MouseEvent("mouseleave"));
        expect(onHover).not.toHaveBeenCalled();
        expect(layer.children).toHaveLength(0);
    });

    it("marks the name of a player in the discussion of the local player, and unmarks it when they leave", () => {
        const layer = document.createElement("div");
        document.body.append(layer);
        const scene = Object.assign(mock<GameScene>(), {
            events: mock<GameScene["events"]>(),
            game: { events: mock<GameScene["game"]["events"]>() },
            usernameDomLayer: mock<UsernameDomLayer>({
                addUsername: (node) => layer.append(node),
                getAncestorScale: () => 1,
            }),
        });
        const display = new UsernameDisplay(scene, 100, 200, "Bob", undefined, vi.fn());
        const node = layer.querySelector<HTMLDivElement>(".username-display");
        expect(node?.classList.contains("in-discussion")).toBe(false);
        display.setInDiscussion(true);
        expect(node?.classList.contains("in-discussion")).toBe(true);
        display.setInDiscussion(false);
        expect(node?.classList.contains("in-discussion")).toBe(false);
        display.destroy();
    });

    it("hands the wheel and the presses on the name to the canvas, so that it zooms and drags the view", () => {
        const layer = document.createElement("div");
        const canvas = document.createElement("canvas");
        document.body.append(layer, canvas);
        const scene = Object.assign(mock<GameScene>(), {
            events: mock<GameScene["events"]>(),
            game: { events: mock<GameScene["game"]["events"]>(), canvas },
            usernameDomLayer: mock<UsernameDomLayer>({
                addUsername: (node) => layer.append(node),
                getAncestorScale: () => 1,
            }),
        });
        const display = new UsernameDisplay(scene, 100, 200, "Carol", undefined, vi.fn());
        const node = layer.querySelector<HTMLDivElement>(".username-display");
        const received: Event[] = [];
        for (const type of ["wheel", "mousedown", "mousemove"]) canvas.addEventListener(type, (e) => received.push(e));

        const wheel = new WheelEvent("wheel", {
            deltaY: -120,
            clientX: 12,
            clientY: 34,
            cancelable: true,
            bubbles: true,
        });
        node?.dispatchEvent(wheel);
        node?.dispatchEvent(
            new MouseEvent("mousedown", { button: 0, buttons: 1, clientX: 12, clientY: 34, bubbles: true }),
        );
        node?.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 20, clientY: 40, bubbles: true }));

        expect(received.map((e) => e.type)).toEqual(["wheel", "mousedown", "mousemove"]);
        expect((received[0] as WheelEvent).deltaY).toBe(-120);
        expect((received[1] as MouseEvent).clientX).toBe(12);
        expect((received[2] as MouseEvent).buttons).toBe(1);
        expect(wheel.defaultPrevented).toBe(true);

        display.destroy();
        received.length = 0;
        node?.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));
        expect(received).toHaveLength(0);
    });
});
