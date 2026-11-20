import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import {
    armedCatastropheStore,
    catastrophePanelStore,
    disarmCatastrophe,
    toggleArmedCatastrophe,
} from "../../../src/front/Stores/CatastropheStore";
import { mapEditorModeStore } from "../../../src/front/Stores/MapEditorStore";

beforeEach(() => {
    disarmCatastrophe();
    mapEditorModeStore.switchMode(false);
    catastrophePanelStore.set(true);
    disarmCatastrophe();
});

describe("CatastropheStore", () => {
    it("arms the chosen catastrophe, and choosing it again disarms it", () => {
        toggleArmedCatastrophe("meteor");
        expect(get(armedCatastropheStore)).toBe("meteor");
        toggleArmedCatastrophe("meteor");
        expect(get(armedCatastropheStore)).toBeUndefined();
    });

    it("arms the fireball, apart from the comet", () => {
        toggleArmedCatastrophe("fireball");
        expect(get(armedCatastropheStore)).toBe("fireball");
        toggleArmedCatastrophe("meteor");
        expect(get(armedCatastropheStore)).toBe("meteor");
        toggleArmedCatastrophe("fireball");
        toggleArmedCatastrophe("fireball");
        expect(get(armedCatastropheStore)).toBeUndefined();
    });

    it("forgets the choice when the panel is closed, so reopening does not come back armed", () => {
        toggleArmedCatastrophe("meteor");
        catastrophePanelStore.set(false);
        expect(get(armedCatastropheStore)).toBeUndefined();
        catastrophePanelStore.set(true);
        expect(get(armedCatastropheStore)).toBeUndefined();
    });

    it("arms while the map editor is open, and stays armed when it closes", () => {
        mapEditorModeStore.switchMode(true);
        toggleArmedCatastrophe("meteor");
        expect(get(armedCatastropheStore)).toBe("meteor");
        mapEditorModeStore.switchMode(false);
        expect(get(armedCatastropheStore)).toBe("meteor");
    });

    it("does not arm while the panel is closed", () => {
        catastrophePanelStore.set(false);
        toggleArmedCatastrophe("meteor");
        expect(get(armedCatastropheStore)).toBeUndefined();
    });
});
