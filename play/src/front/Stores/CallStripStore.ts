import { writable } from "svelte/store";

/**
 * The players of the discussion of the local player whose avatar is out of the view of the map (far away, or the
 * view looks at another place), by space user id: the call strip shows them, so that one still sees who is in the call,
 * whether they talk, and whether their microphone and camera are on. Set by the game scene (updateDiscussionMarks).
 */
export const offscreenCallUsersStore = writable<ReadonlySet<string>>(new Set());

/** How far inside the view an avatar must come back before it counts as shown again: no blinking at the edge. */
export const CALL_STRIP_INSET_PX = 32;

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Whether an avatar (the point of its video bubble, over its head) is out of the view. One that was out comes back
 * only once well inside the view; one that was in goes out as soon as it leaves the view.
 */
export function isOffscreen(wasOffscreen: boolean, point: { x: number; y: number }, view: Rect): boolean {
    const inset = wasOffscreen ? CALL_STRIP_INSET_PX : 0;
    const inside =
        point.x >= view.x + inset &&
        point.x <= view.x + view.width - inset &&
        point.y >= view.y + inset &&
        point.y <= view.y + view.height - inset;
    return !inside;
}
