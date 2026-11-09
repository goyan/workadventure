import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import EntityViewChoice from "../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/EntityViewChoice.svelte";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            mapEditor: {
                entityEditor: {
                    views: {
                        label: () => "View",
                        front: () => "Front",
                        back: () => "Back",
                        left: () => "Left",
                        right: () => "Right",
                        taken: () => "already used",
                    },
                },
            },
        }),
    };
});

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.innerHTML = "";
});

function open(value: string, takenViews: string[]) {
    const onChange = vi.fn();
    flushSync(() => {
        component = mount(EntityViewChoice, { target, props: { value, takenViews, onChange } });
    });
    const radios = [...target.querySelectorAll<HTMLButtonElement>("button[role=radio]")];
    return { onChange, radios, radio: (label: string) => radios.find((r) => r.textContent?.includes(label)) };
}

describe("EntityViewChoice", () => {
    it("disables the views the object already has, says why, and keeps the free ones selectable", () => {
        const { onChange, radio } = open("Left", ["Right"]);
        expect(radio("Right")?.disabled).toBe(true);
        expect(radio("Right")?.textContent).toContain("already used");
        expect(radio("Left")?.getAttribute("aria-checked")).toBe("true");
        flushSync(() => radio("Right")?.click());
        expect(onChange).not.toHaveBeenCalled();
        flushSync(() => radio("Back")?.click());
        expect(onChange).toHaveBeenCalledWith("Up");
    });

    it("offers every view to an object with none taken", () => {
        const { radios } = open("Down", []);
        expect(radios.map((r) => r.disabled)).toEqual([false, false, false, false]);
    });
});
