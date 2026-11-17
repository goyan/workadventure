import { writable, type Readable } from "svelte/store";

export enum JamTheme {
    Wa = "wa",
    Dark = "dark",
    Light = "light",
}

export enum JamStyle {
    Spotify = "spotify",
    AppleMusic = "apple-music",
}

export const jamThemeStore = storedChoice("jamAppearance", Object.values(JamTheme), JamTheme.Wa);
export const jamStyleStore = storedChoice("jamStyle", Object.values(JamStyle), JamStyle.Spotify);

function storedChoice<Choice extends string>(
    storageKey: string,
    choices: readonly Choice[],
    fallback: Choice,
): Readable<Choice> & { set: (choice: Choice) => void } {
    let initial = fallback;
    try {
        const stored = localStorage.getItem(storageKey);
        initial = choices.find((choice) => choice === stored) ?? fallback;
    } catch {
        // Follow the default when browser storage is unavailable.
    }
    const { subscribe, set } = writable(initial);
    return {
        subscribe,
        set(choice): void {
            set(choice);
            try {
                localStorage.setItem(storageKey, choice);
            } catch {
                // The choice still applies to this session.
            }
        },
    };
}
