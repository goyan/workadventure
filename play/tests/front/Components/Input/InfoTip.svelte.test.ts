import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import InfoTip from "../../../../src/front/Components/Input/InfoTip.svelte";

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

function render(): { button: HTMLButtonElement; bubble: HTMLElement } {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(InfoTip, {
        target,
        props: { label: "How to throw it", text: "Click on the map", testid: "tip" },
    });
    flushSync();
    const button = target.querySelector<HTMLButtonElement>('[data-testid="tip"]');
    const bubble = target.querySelector<HTMLElement>('[data-testid="tip-text"]');
    if (!button || !bubble) throw new Error("no info tip");
    return { button, bubble };
}

const shown = (bubble: HTMLElement): boolean => !bubble.classList.contains("hidden");

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
});

describe("InfoTip", () => {
    it("is a named button described by its help, hidden at first", () => {
        const { button, bubble } = render();
        expect(button.getAttribute("aria-label")).toBe("How to throw it");
        expect(button.getAttribute("aria-describedby")).toBe(bubble.id);
        expect(bubble.getAttribute("role")).toBe("tooltip");
        expect(bubble.textContent).toContain("Click on the map");
        expect(shown(bubble)).toBe(false);
    });

    it("shows its help while hovered", () => {
        const { button, bubble } = render();
        button.dispatchEvent(new MouseEvent("mouseenter"));
        flushSync();
        expect(shown(bubble)).toBe(true);
        button.dispatchEvent(new MouseEvent("mouseleave"));
        flushSync();
        expect(shown(bubble)).toBe(false);
    });

    it("shows its help while focused from the keyboard", () => {
        const { button, bubble } = render();
        button.focus();
        flushSync();
        expect(shown(bubble)).toBe(true);
        button.blur();
        flushSync();
        expect(shown(bubble)).toBe(false);
    });

    it("pins its help on a click or a tap, until clicked again or a press elsewhere", () => {
        const { button, bubble } = render();
        button.click();
        flushSync();
        expect(shown(bubble)).toBe(true);
        expect(button.getAttribute("aria-expanded")).toBe("true");
        button.click();
        flushSync();
        expect(shown(bubble)).toBe(false);
        button.click();
        flushSync();
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        flushSync();
        expect(shown(bubble)).toBe(false);
    });
});
