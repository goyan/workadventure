import * as Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { loadLocale } from "../../../../src/i18n/i18n-util.sync";
import { setLocale } from "../../../../src/i18n/i18n-svelte";

vi.mock("../../../../src/front/Components/Catastrophe/WeatherTab.svelte", async () => ({
    default: ((await import("../Catastrophe/WeatherTabStub.svelte")) as { default: unknown }).default,
}));

import CatastrophePanel from "../../../../src/front/Components/Catastrophe/CatastrophePanel.svelte";
import {
    armedCatastropheStore,
    catastrophePanelStore,
    disarmCatastrophe,
} from "../../../../src/front/Stores/CatastropheStore";

/**
 * The panels of the clock line over the map, through the real mouse listeners of Phaser: Phaser listens to the mouse
 * on its canvas and on the window, and hands each press to its input manager, whose pointer keeps the target of the
 * event (`Pointer.down` / `Pointer.up`: `downElement` / `upElement`). A press whose target is not the canvas then becomes
 * a POINTER_DOWN_OUTSIDE and a POINTER_UP_OUTSIDE (InputPlugin.processDownEvents / processUpEvents compare them with the
 * canvas), never the POINTER_UP the game walks, picks or throws a disaster on.
 */
describe("a popover of the clock line over the Phaser canvas", () => {
    let canvas: HTMLCanvasElement;
    /** The targets of the presses the mouse manager of Phaser handed on: what its pointer keeps. */
    let downElements: (EventTarget | null)[];
    let upElements: (EventTarget | null)[];
    let mouse: Phaser.Input.Mouse.MouseManager;
    let wheel: ReturnType<typeof vi.fn>;
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(() => {
        loadLocale("fr-FR");
        setLocale("fr-FR");
    });

    beforeEach(() => {
        canvas = document.createElement("canvas");
        document.body.append(canvas);
        const manager = mock<Phaser.Input.InputManager>();
        const events = new Phaser.Events.EventEmitter();
        wheel = vi.fn();
        downElements = [];
        upElements = [];
        Object.assign(manager, {
            onMouseDown: (event: MouseEvent) => downElements.push(event.target),
            onMouseUp: (event: MouseEvent) => upElements.push(event.target),
            onMouseWheel: wheel,
            onMouseMove: () => undefined,
            events,
            enabled: true,
            canvas,
            game: { canvas, config: { autoFocus: false, inputWindowEvents: true } },
            config: {
                inputMouse: true,
                inputMouseEventTarget: null,
                inputMousePassive: false,
                inputMousePreventDefaultDown: true,
                inputMousePreventDefaultUp: true,
                inputMousePreventDefaultMove: true,
                inputMousePreventDefaultWheel: true,
                disableContextMenu: false,
            },
        });
        mouse = new Phaser.Input.Mouse.MouseManager(manager);
        events.emit(Phaser.Input.Events.MANAGER_BOOT);

        catastrophePanelStore.set(true);
        disarmCatastrophe();
        target = document.createElement("div");
        document.body.append(target);
        component = mount(CatastrophePanel, { target, props: { compact: false } });
        flushSync();
        target.querySelector<HTMLButtonElement>('[data-testid="catastrophe-chip"]')?.click();
        flushSync();
    });

    afterEach(async () => {
        mouse.stopListeners();
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target.remove();
        canvas.remove();
        catastrophePanelStore.set(false);
    });

    // As a browser does: pointerdown, then the mouse events Phaser listens to.
    function press(element: Element): void {
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1 }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
        flushSync();
    }

    it("tells Phaser a press on a tile of the panel as outside its canvas: the tile arms, the map gets nothing", () => {
        const tile = target.querySelector('[data-testid="catastrophe-meteor"]');
        if (!tile) throw new Error("no tile");
        press(tile);
        expect(get(armedCatastropheStore)).toBe("meteor");
        // Phaser is told of the press (it listens on the window too), with the tile as its target, not its canvas.
        expect(downElements).toEqual([tile]);
        expect(upElements).toEqual([tile]);
        // The panel is still open: the size of the comet is set right there.
        expect(target.querySelector('[data-testid="catastrophe-meteor-size"]')).not.toBeNull();
    });

    it("tells Phaser a press on the map as on its canvas, the control of the test", () => {
        press(canvas);
        expect(downElements).toEqual([canvas]);
        expect(upElements).toEqual([canvas]);
        // A press on the map closes the panel: it starts aiming there.
        expect(target.querySelector('[data-testid="catastrophe-chip-popover"]')).toBeNull();
    });

    it("keeps the wheel over the panel from Phaser, which zooms on the wheel over its canvas only", () => {
        const popover = target.querySelector('[data-testid="catastrophe-chip-popover"]');
        if (!popover) throw new Error("no popover");
        popover.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
        expect(wheel).not.toHaveBeenCalled();
        canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
        expect(wheel).toHaveBeenCalledTimes(1);
    });
});
