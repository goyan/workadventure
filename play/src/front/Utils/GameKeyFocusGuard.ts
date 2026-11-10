const BUTTON_SELECTOR = 'button, [role="button"]';
/** Space is a character in these, and the arrows set their value: they keep their keys. */
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
/** An open popup owns the keyboard: its buttons keep their keys. */
const POPUP_SELECTOR = '[role="dialog"]';
/** The keys that move the focus from one control to the next. */
const NAVIGATION_KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

/** The key events whose button gave the focus back: they are the game's, though they still target the button. */
const handedToGame = new WeakSet<Event>();

export function isKeyHandedToGame(event: Event): boolean {
    return handedToGame.has(event);
}

export interface GameKeyFocusGuardOptions {
    /** False while something else takes the keyboard (a menu, the chat): the guard then stays out of the way. */
    gameListens: () => boolean;
}

/**
 * Space and Enter belong to the button that holds the focus (isKeyFromInteractiveElement): with the keyboard, the
 * interface stays usable. But a button clicked with the mouse keeps the focus too, and so does the button a closing
 * popup focuses again: Space, meant to run, swim or activate an object, then clicked it once more (the microphone,
 * the bubble lock, the personal desk...).
 *
 * A button reached with the keyboard (Tab, or the arrows of a menu) keeps its keys. Any other button gives the focus
 * back as Space or Enter goes down, so that the game gets the key. The key event is never cancelled: Phaser drops
 * cancelled key events.
 *
 * @returns what uninstalls the guard.
 */
export function installGameKeyFocusGuard(target: Window, options: GameKeyFocusGuardOptions): () => void {
    const reachedWithKeyboard = new WeakSet<Element>();
    let navigating = false;
    let released: Element | undefined;

    const onPointerDown = (event: PointerEvent): void => {
        navigating = false;
        const button = event.target instanceof Element ? event.target.closest(BUTTON_SELECTOR) : null;
        if (button) reachedWithKeyboard.delete(button);
    };

    const onFocusIn = (event: FocusEvent): void => {
        if (navigating && event.target instanceof Element) reachedWithKeyboard.add(event.target);
        navigating = false;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        released = undefined;
        if (NAVIGATION_KEYS.has(event.key)) {
            navigating = true;
            return;
        }
        navigating = false;
        if (event.key !== " " && event.key !== "Enter") return;
        if (event.ctrlKey || event.altKey || event.metaKey || !options.gameListens()) return;

        const focused = event.target;
        if (!(focused instanceof HTMLElement) || focused.matches(FIELD_SELECTOR)) return;
        const button = focused.closest(BUTTON_SELECTOR);
        if (!button || button.closest(POPUP_SELECTOR) || reachedWithKeyboard.has(button)) return;

        focused.blur();
        released = focused;
        handedToGame.add(event);
    };

    // The browser clicks a focused button with Enter as the key press's default action, even once the focus has gone.
    const onKeyPress = (event: KeyboardEvent): void => {
        if (released !== undefined && event.target === released) event.preventDefault();
    };

    target.addEventListener("pointerdown", onPointerDown, true);
    target.addEventListener("focusin", onFocusIn, true);
    target.addEventListener("keydown", onKeyDown, true);
    target.addEventListener("keypress", onKeyPress, true);
    return () => {
        target.removeEventListener("pointerdown", onPointerDown, true);
        target.removeEventListener("focusin", onFocusIn, true);
        target.removeEventListener("keydown", onKeyDown, true);
        target.removeEventListener("keypress", onKeyPress, true);
    };
}
