import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PatternDeleteButton from "../../../../src/front/Components/MapEditor/PatternDeleteButton.svelte";

vi.mock("../../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            mapEditor: {
                selection: {
                    deletePattern: ({ name }: { name: string }) => `Delete ${name}`,
                    deletePatternConfirm: () => "Delete for everyone?",
                    deletePatternYes: () => "Yes",
                    deletePatternNo: () => "No",
                },
            },
        }),
    };
});

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
const onConfirm = vi.fn();

function open(): void {
    flushSync(() => {
        component = mount(PatternDeleteButton, { target, props: { name: "Salle", disabled: false, onConfirm } });
    });
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
    return [...target.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
    );
}

function click(label: string): void {
    const button = buttonByLabel(label);
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

describe("PatternDeleteButton", () => {
    it("asks before deleting a shared pattern and deletes nothing on the first click", () => {
        open();
        click("Delete Salle");
        expect(onConfirm).not.toHaveBeenCalled();
        expect(target.textContent).toContain("Delete for everyone?");
    });

    it("deletes the pattern once Yes is chosen", () => {
        open();
        click("Delete Salle");
        click("Yes");
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("keeps the pattern and shows the trash button again when No is chosen", () => {
        open();
        click("Delete Salle");
        click("No");
        expect(onConfirm).not.toHaveBeenCalled();
        expect(buttonByLabel("Delete Salle")).toBeDefined();
        expect(target.textContent).not.toContain("Delete for everyone?");
    });
});
