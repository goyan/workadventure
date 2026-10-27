/**
 * The game zooms the *map* (camera zoom), never the web page. Without this guard, a trackpad pinch
 * or Ctrl+wheel performed over the DOM UI (buttons, bottom bar, chat...) is handled by the browser,
 * which zooms the whole page, UI included. Phaser only swallows wheel events that target the canvas.
 *
 * - Chrome/Firefox/Edge: pinch and Ctrl+wheel are delivered as "wheel" events with ctrlKey set.
 * - Safari (macOS trackpad, iOS): pinch is delivered as non standard "gesture*" events.
 *
 * Keyboard shortcuts (Ctrl +/-/0) are left untouched: the user keeps control of the browser zoom.
 */
export function preventBrowserPageZoom(): void {
    window.addEventListener(
        "wheel",
        (event: WheelEvent) => {
            if (event.ctrlKey) {
                event.preventDefault();
            }
        },
        { passive: false },
    );

    for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
        document.addEventListener(eventName, (event: Event) => event.preventDefault(), { passive: false });
    }
}
