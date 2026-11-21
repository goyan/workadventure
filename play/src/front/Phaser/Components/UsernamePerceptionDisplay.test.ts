import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { GameScene } from "../Game/GameScene";
import type { UsernameDomLayer } from "../Game/UsernameDomLayer";
import { perceptionMarkLift } from "../Game/Perception/PerceptionMarkShape";
import { UsernameDisplay } from "./UsernameDisplay";
import { UsernamePerceptionDisplay } from "./UsernamePerceptionDisplay";

vi.mock("phaser", () => ({ Scenes: { Events: { RENDER: "render" } } }));
vi.mock("../Services/WaScaleManager", () => ({
    waScaleManager: { zoomModifier: 1 },
    WaScaleManagerEvent: { ZoomChanged: "zoom-changed" },
}));

/** jsdom has no Web Animations: a stand-in that records what was asked. */
function stubAnimate(): ReturnType<typeof vi.fn> {
    const animate = vi.fn(() => mock<Animation>());
    Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true, writable: true });
    Object.defineProperty(SVGElement.prototype, "animate", { value: animate, configurable: true, writable: true });
    return animate;
}

describe("UsernamePerceptionDisplay", () => {
    afterEach(() => {
        document.body.replaceChildren();
        Reflect.deleteProperty(HTMLElement.prototype, "animate");
        Reflect.deleteProperty(SVGElement.prototype, "animate");
    });

    it("floats inside the name tag, so that it follows its place, its layer and its scale", () => {
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
        const display = new UsernameDisplay(scene, 100, 200, "Alice", undefined, vi.fn());
        display.setPerceptionMark("basic", "Mode Basique", perceptionMarkLift(false));
        const mark = layer.querySelector(".username-display > .username-perception");
        expect(mark).not.toBeNull();
        expect(mark?.querySelector("svg")?.dataset.mark).toBe("basic");
        display.destroy();
        expect(layer.querySelector(".username-perception")).toBeNull();
    });

    it("shows one symbol or the other with its tooltip, above the Nerf hearts when they show, and hides", () => {
        stubAnimate();
        const display = new UsernamePerceptionDisplay(false);
        display.show("place", "Suit la météo d’une autre ville", perceptionMarkLift(true));
        expect(display.element.style.display).toBe("");
        expect(display.element.title).toBe("Suit la météo d’une autre ville");
        expect(display.element.querySelector("svg")?.dataset.mark).toBe("place");
        expect(display.element.style.bottom).toContain(`${perceptionMarkLift(true)}px`);
        display.show("basic", "Mode Basique", perceptionMarkLift(false));
        expect(display.element.querySelectorAll("svg")).toHaveLength(1);
        expect(display.element.querySelector("svg")?.dataset.mark).toBe("basic");
        expect(display.element.style.bottom).toContain(`${perceptionMarkLift(false)}px`);
        display.show(undefined, "", perceptionMarkLift(false));
        expect(display.element.style.display).toBe("none");
        expect(display.element.title).toBe("");
        expect(display.element.querySelector("svg")).toBeNull();
    });

    it("floats and twinkles, played by the browser", () => {
        const animate = stubAnimate();
        const display = new UsernamePerceptionDisplay(false);
        display.show("basic", "", 2);
        expect(display.animated).toBe(true);
        expect(animate).toHaveBeenCalledTimes(2);
        display.show(undefined, "", 2);
        expect(display.animated).toBe(false);
    });

    it("stands still when the system asks for less motion", () => {
        const animate = stubAnimate();
        const display = new UsernamePerceptionDisplay(true);
        display.show("basic", "", 2);
        display.show("place", "", 2);
        expect(animate).not.toHaveBeenCalled();
        expect(display.animated).toBe(false);
        expect(display.element.querySelector("svg")).not.toBeNull();
    });
});
