import { ICE_BEARS_MM, ICE_SLIPS_MM } from "@workadventure/map-editor";

/**
 * The ice under someone, for a thickness of the ice the server keeps in mm: none (open water), thin (it bears them a
 * moment over deep water, then cracks and gives way, IceBreaks) or solid. Over deep water it bears a walker from
 * ICE_BEARS_MM; where they would walk anyway (a puddle, a flooded ground) any ice they can slip on holds.
 */
export type IceState = "none" | "thin" | "solid";

export function iceOfThickness(mm: number, deepWater: boolean): IceState {
    if (mm >= (deepWater ? ICE_BEARS_MM : ICE_SLIPS_MM)) return "solid";
    return deepWater && mm >= ICE_SLIPS_MM ? "thin" : "none";
}
