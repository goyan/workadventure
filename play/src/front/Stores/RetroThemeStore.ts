import { writable } from "svelte/store";

/** Palettes of the 16-bit theme of the map editor (style/retro-theme.css). */
export const RETRO_PALETTES = ["night", "forest", "ember", "gameboy"] as const;
export type RetroPalette = (typeof RETRO_PALETTES)[number];

const STORAGE_KEY = "mapEditorRetroPalette";

function readStoredPalette(): RetroPalette {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return RETRO_PALETTES.find((palette) => palette === stored) ?? "night";
    } catch {
        // Storage may be blocked (private mode, sandbox): the default palette is fine.
        return "night";
    }
}

function createRetroPaletteStore() {
    const { subscribe, set } = writable<RetroPalette>(readStoredPalette());
    return {
        subscribe,
        set: (palette: RetroPalette) => {
            set(palette);
            try {
                localStorage.setItem(STORAGE_KEY, palette);
            } catch {
                // Not remembered across reloads when storage is blocked; the choice still applies now.
            }
        },
    };
}

/** The palette chosen by this user, remembered in this browser. */
export const retroPaletteStore = createRetroPaletteStore();
