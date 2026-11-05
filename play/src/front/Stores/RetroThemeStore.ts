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

/** The palette applies to every menu using the theme (`.retro-theme`), wherever it is in the page. */
function applyPalette(palette: RetroPalette): void {
    if (typeof document !== "undefined") {
        document.documentElement.dataset.retroPalette = palette;
    }
}

function createRetroPaletteStore() {
    const initial = readStoredPalette();
    applyPalette(initial);
    const { subscribe, set } = writable<RetroPalette>(initial);
    return {
        subscribe,
        set: (palette: RetroPalette) => {
            set(palette);
            applyPalette(palette);
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
