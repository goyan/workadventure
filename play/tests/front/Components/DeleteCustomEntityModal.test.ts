import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import DeleteCustomEntityModal from "../../../src/front/Components/MapEditor/EntityEditor/DeleteCustomEntityModal.svelte";

const mocks = vi.hoisted(() => ({ close: vi.fn() }));
vi.mock("@wa-modals", () => ({ modals: { stack: [], open: vi.fn(), close: mocks.close } }));
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            mapEditor: {
                entityEditor: {
                    deleteCustomEntity: {
                        title: ({ name }: { name: string }) => `Delete ${name}?`,
                        description: ({ count }: { count: number }) => `${count} placed here`,
                        confirm: () => "Delete",
                    },
                },
            },
            actionbar: { cancel: () => "Cancel" },
        }),
    };
});

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
const onConfirm = vi.fn();

function open(placedCount = 3): void {
    flushSync(() => {
        component = mount(DeleteCustomEntityModal, {
            target,
            props: { isOpen: true, name: "sofa.png", placedCount, onConfirm },
        });
    });
}

function click(label: string): void {
    const button = [...target.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    flushSync(() => button.click());
}

beforeEach(() => {
    vi.clearAllMocks();
    document.body.appendChild(target);
});

afterEach(async () => {
    const mountedComponent = component;
    component = undefined;
    if (mountedComponent) await unmount(mountedComponent, { outro: false });
    target.replaceChildren();
    target.remove();
});

describe("DeleteCustomEntityModal", () => {
    it("names the image and tells how many copies are placed on this map", () => {
        open(3);
        expect(target.textContent).toContain("Delete sofa.png?");
        expect(target.textContent).toContain("3 placed here");
    });

    it("deletes nothing when cancelled", () => {
        open();
        click("Cancel");
        expect(mocks.close).toHaveBeenCalledOnce();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("closes on Escape without deleting, and keeps the key from the map editor (it would drop the selection)", () => {
        open();
        const editorListener = vi.fn();
        window.addEventListener("keydown", editorListener);
        flushSync(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        window.removeEventListener("keydown", editorListener);
        expect(mocks.close).toHaveBeenCalledOnce();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(editorListener).not.toHaveBeenCalled();
    });

    it("deletes once, even when the button is clicked twice", () => {
        open();
        click("Delete");
        click("Delete");
        expect(onConfirm).toHaveBeenCalledOnce();
        expect(mocks.close).toHaveBeenCalledOnce();
    });
});
