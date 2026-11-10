import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installGameKeyFocusGuard } from "../../../src/front/Utils/GameKeyFocusGuard";
import { isKeyFromInteractiveElement } from "../../../src/front/Utils/isKeyFromInteractiveElement";

describe("GameKeyFocusGuard", () => {
    let gameListens: boolean;
    let uninstall: () => void;
    let root: HTMLDivElement;

    beforeEach(() => {
        gameListens = true;
        uninstall = installGameKeyFocusGuard(window, { gameListens: () => gameListens });
        root = document.createElement("div");
        document.body.appendChild(root);
    });

    afterEach(() => {
        uninstall();
        root.remove();
    });

    function add<T extends HTMLElement>(element: T, parent: HTMLElement = root): T {
        parent.appendChild(element);
        return element;
    }

    /** A mouse click: the pointer goes down on the button, which takes the focus. */
    function clickWithMouse(element: HTMLElement): void {
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        element.focus();
    }

    /** Tab, or an arrow key in a menu: the focus comes from the keyboard. */
    function reachWithKeyboard(element: HTMLElement, key = "Tab"): void {
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        element.focus();
    }

    function press(key: " " | "Enter"): { keydown: KeyboardEvent; keypress: KeyboardEvent } {
        const target = document.activeElement ?? document.body;
        const keydown = new KeyboardEvent("keydown", { key, code: key === " " ? "Space" : "Enter", bubbles: true });
        target.dispatchEvent(keydown);
        const keypress = new KeyboardEvent("keypress", { key, bubbles: true, cancelable: true });
        target.dispatchEvent(keypress);
        return { keydown, keypress };
    }

    it("hands Space to the game once a button was clicked with the mouse: running does not click it again", () => {
        const button = add(document.createElement("button"));
        clickWithMouse(button);

        const { keydown } = press(" ");

        expect(document.activeElement).not.toBe(button);
        // The game reads the key: it must neither be cancelled (Phaser drops cancelled keys) nor look like the button's.
        expect(keydown.defaultPrevented).toBe(false);
        expect(isKeyFromInteractiveElement(keydown)).toBe(false);
    });

    it("hands Enter to the game too, and stops the browser from clicking the button with it", () => {
        const button = add(document.createElement("button"));
        clickWithMouse(button);

        const { keydown, keypress } = press("Enter");

        expect(document.activeElement).not.toBe(button);
        expect(keydown.defaultPrevented).toBe(false);
        expect(keypress.defaultPrevented).toBe(true);
    });

    it("leaves Space to a button reached with Tab: the toolbar stays usable with the keyboard", () => {
        const button = add(document.createElement("button"));
        reachWithKeyboard(button);

        const { keydown, keypress } = press(" ");

        expect(document.activeElement).toBe(button);
        expect(keypress.defaultPrevented).toBe(false);
        expect(isKeyFromInteractiveElement(keydown)).toBe(true);
    });

    it("leaves Space to a button reached with the arrows of a menu", () => {
        const item = add(document.createElement("div"));
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        reachWithKeyboard(item, "ArrowDown");

        press(" ");

        expect(document.activeElement).toBe(item);
    });

    it("takes the keyboard status away when the same button is later clicked with the mouse", () => {
        const button = add(document.createElement("button"));
        reachWithKeyboard(button);
        button.blur();
        clickWithMouse(button);

        press(" ");

        expect(document.activeElement).not.toBe(button);
    });

    it("hands Space to the game when a closing popup gives the focus back to the button that opened it", () => {
        const opener = add(document.createElement("button"));
        clickWithMouse(opener);
        // Escape closes the popup, which focuses its opener again.
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        opener.blur();
        opener.focus();

        press(" ");

        expect(document.activeElement).not.toBe(opener);
    });

    it("leaves the buttons of an open popup alone", () => {
        const dialog = add(document.createElement("div"));
        dialog.setAttribute("role", "dialog");
        const button = add(document.createElement("button"), dialog);
        clickWithMouse(button);

        press(" ");

        expect(document.activeElement).toBe(button);
    });

    it("leaves text fields and sliders alone: Space is a character there, and the arrows set the value", () => {
        const input = add(document.createElement("input"));
        clickWithMouse(input);
        press(" ");
        expect(document.activeElement).toBe(input);

        const range = add(document.createElement("input"));
        range.type = "range";
        clickWithMouse(range);
        press(" ");
        expect(document.activeElement).toBe(range);
    });

    it("does nothing while the game does not listen to the keyboard (a menu takes it)", () => {
        gameListens = false;
        const button = add(document.createElement("button"));
        clickWithMouse(button);

        press(" ");

        expect(document.activeElement).toBe(button);
    });

    it("stops listening once uninstalled", () => {
        uninstall();
        const button = add(document.createElement("button"));
        clickWithMouse(button);

        press(" ");

        expect(document.activeElement).toBe(button);
        uninstall = () => {};
    });
});
