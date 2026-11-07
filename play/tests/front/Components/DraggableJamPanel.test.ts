import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { writable } from "svelte/store";
import DraggableJamPanelContent from "./DraggableJamPanelContent.svelte";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return { LL: readable({ spotify: { listeningZone: { resetPosition: () => "Reset position" } } }) };
});

const sidePanelOpen = writable(false);
const onAction = vi.fn();
const onLayout = vi.fn<(layout: { height: number; moved: boolean }) => void>();
let target: HTMLDivElement;
let panel: HTMLDivElement;
let handle: HTMLButtonElement;
let component: ReturnType<typeof mount> | undefined;
let panelHeight: number;

class TestResizeObserver implements ResizeObserver {
    static instances: TestResizeObserver[] = [];
    observe = vi.fn<(target: Element) => void>();
    unobserve = vi.fn<(target: Element) => void>();
    disconnect = vi.fn<() => void>();

    constructor(private readonly callback: ResizeObserverCallback) {
        TestResizeObserver.instances.push(this);
    }

    notify(): void {
        this.callback([], this);
    }
}

function pointer(target: EventTarget, type: string, options: PointerEventInit = {}): Event {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options });
    Object.defineProperties(event, {
        pointerId: { value: options.pointerId ?? 1 },
        isPrimary: { value: options.isPrimary ?? true },
        pointerType: { value: options.pointerType ?? "mouse" },
    });
    flushSync(() => target.dispatchEvent(event));
    return event;
}

beforeEach(() => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 600);
    sidePanelOpen.set(false);
    panelHeight = 200;
    target = document.createElement("div");
    document.body.append(target);
    flushSync(() => {
        component = mount(DraggableJamPanelContent, { target, props: { sidePanelOpen, onAction, onLayout } });
    });
    const renderedPanel = target.querySelector<HTMLDivElement>('[data-testid="draggable-jam-panel"]');
    const renderedHandle = target.querySelector<HTMLButtonElement>('[data-testid="drag-handle"]');
    if (!renderedPanel || !renderedHandle) throw new Error("Jam panel did not render");
    panel = renderedPanel;
    handle = renderedHandle;
    // jsdom has no layout. The panel initially sits at the right edge of an 800 × 600 viewport.
    Object.defineProperties(panel, {
        offsetWidth: { get: () => 320, configurable: true },
        offsetHeight: { get: () => panelHeight, configurable: true },
    });
    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(
        () =>
            new DOMRect(
                Number.parseFloat(panel.style.left || "480"),
                Number.parseFloat(panel.style.top || "0"),
                320,
                panelHeight,
            ),
    );
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    TestResizeObserver.instances.length = 0;
    target.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("DraggableJamPanel", () => {
    it("moves only from the header and leaves Jam actions usable", () => {
        const action = target.querySelector<HTMLButtonElement>('[data-testid="jam-action"]');
        if (!action) throw new Error("Jam action did not render");
        pointer(action, "pointerdown", { clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { clientX: 400, clientY: 120 });
        flushSync(() => action.click());
        expect(panel.style.left).toBe("");
        expect(onAction).toHaveBeenCalledOnce();

        const down = pointer(handle, "pointerdown", { clientX: 500, clientY: 20 });
        expect(down.defaultPrevented).toBe(true);
        pointer(window, "pointermove", { clientX: 400, clientY: 120 });
        expect(panel.style.left).toBe("380px");
        expect(panel.style.top).toBe("100px");
        expect(onLayout).toHaveBeenLastCalledWith({ height: 200, moved: true });
    });

    it("keeps the whole panel inside the viewport", () => {
        pointer(handle, "pointerdown", { clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { clientX: 2000, clientY: 2000 });
        expect(panel.style.left).toBe("480px");
        expect(panel.style.top).toBe("400px");
        pointer(window, "pointermove", { clientX: -2000, clientY: -2000 });
        expect(panel.style.left).toBe("0px");
        expect(panel.style.top).toBe("0px");
    });

    it("supports touch and ignores other fingers and the secondary mouse button", () => {
        pointer(handle, "pointerdown", { button: 2 });
        pointer(window, "pointermove", { clientX: 20 });
        expect(panel.style.left).toBe("");
        pointer(handle, "pointerdown", { pointerId: 7, pointerType: "touch", clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { pointerId: 8, clientX: 300, clientY: 200 });
        pointer(window, "pointerup", { pointerId: 8 });
        expect(panel.style.left).toBe("");
        pointer(window, "pointermove", { pointerId: 7, clientX: 400, clientY: 120 });
        expect(panel.style.left).toBe("380px");
    });

    it.each(["pointerup", "pointercancel", "lostpointercapture", "blur"])("ends the drag on %s", (type) => {
        pointer(handle, "pointerdown", { clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { clientX: 400, clientY: 120 });
        if (type === "blur") flushSync(() => window.dispatchEvent(new Event("blur")));
        else pointer(window, type);
        pointer(window, "pointermove", { clientX: 300, clientY: 200 });
        expect(panel.style.left).toBe("380px");
        expect(panel.style.top).toBe("100px");
    });

    it("keeps its position when the participant side panel opens", () => {
        pointer(handle, "pointerdown", { clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { clientX: 400, clientY: 120 });
        pointer(window, "pointerup");
        flushSync(() => sidePanelOpen.set(true));
        expect(target.querySelector('[data-testid="draggable-jam-panel"]')).toBe(panel);
        expect(panel.style.left).toBe("380px");
        expect(panel.style.top).toBe("100px");
    });

    it("follows the default anchor until the user moves it", () => {
        flushSync(() => sidePanelOpen.set(true));
        expect(panel.style.top).toBe("100px");
        expect(panel.style.left).toBe("");
    });

    it("resets to the current anchor and stops an active drag", () => {
        expect(target.querySelector('[data-testid="reset-jam-position"]')).toBeNull();
        pointer(handle, "pointerdown", { clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { clientX: 400, clientY: 120 });
        flushSync(() => sidePanelOpen.set(true));
        const reset = target.querySelector<HTMLButtonElement>('[data-testid="reset-jam-position"]');
        if (!reset) throw new Error("Missing reset action");
        flushSync(() => reset.click());
        expect(panel.style.left).toBe("");
        expect(panel.style.top).toBe("100px");
        pointer(window, "pointermove", { clientX: 200, clientY: 200 });
        expect(panel.style.left).toBe("");
        expect(target.querySelector('[data-testid="reset-jam-position"]')).toBeNull();
        expect(onLayout).toHaveBeenLastCalledWith({ height: 200, moved: false });
        flushSync(() => sidePanelOpen.set(false));
        expect(panel.style.top).toBe("0px");
    });

    it("reclamps after viewport resize and content growth", () => {
        pointer(handle, "pointerdown", { clientX: 500, clientY: 20 });
        pointer(window, "pointermove", { clientX: 2000, clientY: 2000 });
        pointer(window, "pointerup");
        vi.stubGlobal("innerWidth", 500);
        vi.stubGlobal("innerHeight", 300);
        flushSync(() => window.dispatchEvent(new Event("resize")));
        expect(panel.style.left).toBe("180px");
        expect(panel.style.top).toBe("100px");
        panelHeight = 250;
        flushSync(() => TestResizeObserver.instances.at(-1)?.notify());
        expect(panel.style.top).toBe("50px");
    });

    it("moves from a focused header with the arrow keys", () => {
        handle.focus();
        const key = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
        flushSync(() => handle.dispatchEvent(key));
        expect(key.defaultPrevented).toBe(true);
        expect(panel.style.left).toBe("460px");
        const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
        flushSync(() => handle.dispatchEvent(enter));
        expect(enter.defaultPrevented).toBe(false);
    });

    it("stops observing and dragging after unmount", async () => {
        pointer(handle, "pointerdown");
        const activeObserver = TestResizeObserver.instances.at(-1);
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        onLayout.mockClear();
        pointer(window, "pointermove", { clientX: 50, clientY: 50 });
        expect(onLayout).not.toHaveBeenCalled();
        expect(activeObserver?.disconnect).toHaveBeenCalledOnce();
    });
});
