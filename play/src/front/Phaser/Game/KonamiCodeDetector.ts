import { isTextEditingTarget } from "./MapEditor/isTextEditingTarget";

export const KONAMI_CODE = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
];

/**
 * Letters are compared by the character typed (not by physical position) so that the code works on any keyboard
 * layout, e.g. AZERTY.
 */
function normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key;
}

/**
 * Feeds the given key into the progress of the sequence and returns the new progress.
 * The progress is reset to 0 (or 1 if the key restarts the sequence) when the key does not match.
 */
export function advanceKonamiProgress(progress: number, key: string): number {
    if (key === KONAMI_CODE[progress]) {
        return progress + 1;
    }
    return key === KONAMI_CODE[0] ? 1 : 0;
}

/**
 * Listens to the keyboard and calls the callback each time the Konami code is entered.
 */
export class KonamiCodeDetector {
    private progress = 0;
    private readonly keyDownListener = (event: KeyboardEvent): void => {
        if (event.repeat || isTextEditingTarget(event.target)) {
            return;
        }
        this.progress = advanceKonamiProgress(this.progress, normalizeKey(event.key));
        if (this.progress === KONAMI_CODE.length) {
            this.progress = 0;
            this.onKonamiCode();
        }
    };

    constructor(private readonly onKonamiCode: () => void) {
        window.addEventListener("keydown", this.keyDownListener);
    }

    destroy(): void {
        window.removeEventListener("keydown", this.keyDownListener);
    }
}
