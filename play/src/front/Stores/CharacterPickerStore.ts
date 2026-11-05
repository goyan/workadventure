import { writable } from "svelte/store";
import type { PictureStore } from "./PictureStore";

/** A character under the pointer, offered when one click hits several overlapping wokas. */
export interface CharacterPickerCandidate {
    key: string;
    name: string;
    pictureStore: PictureStore;
    isSelf: boolean;
    select: () => void;
}

/** Characters stacked under the last click, front-most first; undefined when no choice is pending. */
export const characterPickerStore = writable<CharacterPickerCandidate[] | undefined>(undefined);
