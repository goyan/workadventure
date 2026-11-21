import { get, type Writable } from "svelte/store";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";
import { isBasicActive } from "./BasicModeStore";

/**
 * The effects that had no switch of their own: each person may turn each of them off on their own computer (the
 * other effects have theirs: weather, clouds, night, sky lights and shadows, lamps, animals, tile animations).
 * Turned off, an effect is not drawn (or not heard); what it stands for still happens (the water of a downpour, a
 * fire burning the grass).
 */
export const EFFECTS = [
    "meteor",
    "downpour",
    "fire",
    "treeSway",
    "windowLight",
    "waterFlow",
    "karaokeSpotlight",
    "wanderers",
    "callRing",
] as const;
export type EffectName = (typeof EFFECTS)[number];

export const effectShownStores: Readonly<Record<EffectName, Writable<boolean>>> = Object.fromEntries(
    EFFECTS.map((name) => [name, createPersistedSwitchStore(`effectShown.${name}`, true)]),
) as Record<EffectName, Writable<boolean>>;

/**
 * The flames of a fire as this person wants them: detailed (a pixel-art fire, more frames, drawn more often) or the
 * quick ones (fewer frames, lighter to draw). Detailed by default.
 */
export const detailedFlamesStore = createPersistedSwitchStore("fireDetailedFlames", true);

/**
 * The relief seen in 3/4, its ground in pixel art (ReliefTiles), as this person wants it. Off by default: the ground,
 * the relief and the water are then drawn flat by the other engine (TerrainView), which alone draws the painted pools,
 * the ice and the frost. Never in the map editor nor in Basique, whatever this says (projectionShown).
 */
export const pixelReliefStore = createPersistedSwitchStore("terrainPixelRelief", false);

/** Shown when its own switch wants it and Basique does not apply. */
export function isEffectShown(name: EffectName): boolean {
    return get(effectShownStores[name]) && !isBasicActive();
}
