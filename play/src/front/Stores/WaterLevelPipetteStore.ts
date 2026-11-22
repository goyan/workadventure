import { get, writable } from "svelte/store";

/** What the panel of a source or a sink does with the point clicked: `ground` asks for the ground under the water. */
export type WaterLevelTake = (point: { x: number; y: number }, ground: boolean) => void;

/**
 * The pipette of the level a source or a sink holds, armed by its panel: the next click on the map (not a drag) gives
 * it the point clicked, and nothing else answers that click (the avatar, the objects, the tool of the editor).
 */
export const waterLevelPipetteStore = writable<WaterLevelTake | undefined>(undefined);

/** Whether the gesture under way was pressed while the pipette was armed: its drag end is still the pipette's. */
let pressOwned = false;

export function armWaterLevelPipette(take: WaterLevelTake): void {
    waterLevelPipetteStore.set(take);
}

export function disarmWaterLevelPipette(): void {
    waterLevelPipetteStore.set(undefined);
}

/** A press on the map begins a gesture: the pipette owns it if it is armed now. */
export function noteWaterLevelPress(): void {
    pressOwned = get(waterLevelPipetteStore) !== undefined;
}

/** Whether the pipette aims now: a press or a hover is the pipette's. */
export function waterLevelPipetteArmed(): boolean {
    return get(waterLevelPipetteStore) !== undefined;
}

/**
 * The gesture pressed while the pipette aimed has ended (pointer up): it stops owning the pointer once Phaser has
 * told all of that release (its drag end comes with it, in the same frame), so that the next press is free.
 */
export function endWaterLevelGesture(): void {
    if (!pressOwned) return;
    setTimeout(() => {
        pressOwned = false;
    }, 0);
}

/** Whether the pointer is the pipette's: while it is armed, and until the end of the gesture pressed then. */
export function waterLevelPipetteOwnsPointer(): boolean {
    return get(waterLevelPipetteStore) !== undefined || pressOwned;
}

/** Gives a click of the map to the armed pipette, and disarms it. False when none is armed. */
export function takeWaterLevel(point: { x: number; y: number }, ground: boolean): boolean {
    const take = get(waterLevelPipetteStore);
    if (!take) return false;
    waterLevelPipetteStore.set(undefined);
    take(point, ground);
    return true;
}
