import { ICE_BEARS_MM, ICE_SLIPS_MM } from "@workadventure/map-editor";

/**
 * Whether the ice the server keeps holds someone where they stand, for a thickness in mm: over water deep enough to
 * swim in, only an ice thick enough to bear them (thinner, it gives way: they swim); where they would walk anyway (a
 * puddle, a flooded ground), any ice they can slip on.
 */
export function iceHolds(mm: number, deepWater: boolean): boolean {
    if (!Number.isFinite(mm)) return false;
    return mm >= (deepWater ? ICE_BEARS_MM : ICE_SLIPS_MM);
}
