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
});
