import { writable, type Readable } from "svelte/store";

/** Palettes of the interface theme (style/retro-theme.css). */
export const RETRO_PALETTES = ["night", "forest", "ember", "gameboy", "light"] as const;
export type RetroPalette = (typeof RETRO_PALETTES)[number];

/** Fonts of the whole interface (style/retro-theme.css): pixel, the system one, WorkAdventure's Roboto, arcade. */
export const UI_FONTS = ["pixel", "system", "classic", "arcade"] as const;
export type UiFont = (typeof UI_FONTS)[number];

interface StoredChoiceStore<Choice extends string> extends Readable<Choice> {
    set: (choice: Choice) => void;
}

/** The palette chosen by this user, remembered in this browser; set on <html> as `data-retro-palette`. */
export const retroPaletteStore = createStoredChoiceStore({
    storageKey: "mapEditorRetroPalette",
    choices: RETRO_PALETTES,
    fallback: "night",
    apply: (palette) => {
        document.documentElement.dataset.retroPalette = palette;
    },
});

/** The font chosen by this user, remembered in this browser; set on <html> as `data-ui-font`. */
export const uiFontStore = createStoredChoiceStore({
    storageKey: "uiFont",
    choices: UI_FONTS,
    fallback: "pixel",
    apply: (font) => {
        document.documentElement.dataset.uiFont = font;
    },
});

/** A choice among fixed values, applied to the page at once and remembered across reloads. */
function createStoredChoiceStore<Choice extends string>(options: {
    storageKey: string;
    choices: readonly Choice[];
    fallback: Choice;
    apply: (choice: Choice) => void;
}): StoredChoiceStore<Choice> {
    const { storageKey, choices, fallback } = options;
    const apply = (choice: Choice): void => {
        if (typeof document !== "undefined") options.apply(choice);
    };
    const readStored = (): Choice => {
        try {
            const stored = localStorage.getItem(storageKey);
            return choices.find((choice) => choice === stored) ?? fallback;
        } catch {
            // Storage may be blocked (private mode, sandbox): the default is fine.
            return fallback;
        }
    };

    const initial = readStored();
    apply(initial);
    const { subscribe, set } = writable<Choice>(initial);
    return {
        subscribe,
        set: (choice: Choice) => {
            set(choice);
            apply(choice);
            try {
                localStorage.setItem(storageKey, choice);
            } catch {
                // Not remembered across reloads when storage is blocked; the choice still applies now.
            }
        },
    };
}
