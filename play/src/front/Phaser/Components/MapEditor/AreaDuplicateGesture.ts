type ModifierKeys = Pick<MouseEvent, "ctrlKey" | "metaKey" | "altKey">;

/**
 * Dragging an area with Ctrl, Cmd or Option held leaves a copy at its former place. Cmd and Option are read on the DOM
 * event: on a Mac, Ctrl+click opens the context menu, so Ctrl alone left Mac users without the gesture.
 */
export function isAreaDuplicateGesture(event: ModifierKeys | undefined, ctrlKeyDown: boolean): boolean {
    return ctrlKeyDown || event?.ctrlKey === true || event?.metaKey === true || event?.altKey === true;
}
