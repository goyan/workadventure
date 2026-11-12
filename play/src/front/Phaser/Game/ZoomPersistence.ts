/**
 * Keeps the user's camera zoom across page reloads.
 *
 * What is stored is WaScaleManager's zoom modifier: a factor applied on top of the default zoom, which itself depends
 * on the window size. The same modifier therefore frames the map alike on another screen or window size, and
 * HdpiManager still applies its limits (minimum of visible pixels, whole map visible) when it is restored.
 */

/** Saved values outside this range are no zoom a user could reach: they are ignored as corrupted. */
const MIN_STORED_ZOOM_MODIFIER = 0.01;
const MAX_STORED_ZOOM_MODIFIER = 100;

/** A wheel gesture or a zoom tween changes the zoom on every frame: only the zoom it settles on is written. */
export const ZOOM_SAVE_DELAY_MS = 300;

function isStorableZoomModifier(value: number): boolean {
    return Number.isFinite(value) && value >= MIN_STORED_ZOOM_MODIFIER && value <= MAX_STORED_ZOOM_MODIFIER;
}

/** Reads a saved zoom modifier; undefined (the default zoom) when missing or corrupted. */
export function parseStoredZoomModifier(raw: string | null | undefined): number | undefined {
    if (raw === null || raw === undefined || raw.trim() === "") {
        return undefined;
    }
    const value = Number(raw);
    return isStorableZoomModifier(value) ? value : undefined;
}

/** The text to save for a zoom modifier; undefined when it could not be read back. */
export function serializeZoomModifier(value: number): string | undefined {
    return isStorableZoomModifier(value) ? String(value) : undefined;
}

/** Writes the last scheduled zoom once no new zoom came for ZOOM_SAVE_DELAY_MS, or at once on flush. */
export class DebouncedZoomSaver {
    private pending: number | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;

    public constructor(
        private readonly write: (zoomModifier: number) => void,
        private readonly delayMs = ZOOM_SAVE_DELAY_MS,
    ) {}

    public schedule(zoomModifier: number): void {
        this.pending = zoomModifier;
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.delayMs);
    }

    public flush(): void {
        const pending = this.pending;
        this.cancel();
        if (pending !== undefined) this.write(pending);
    }

    public cancel(): void {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
        this.pending = undefined;
    }
}
