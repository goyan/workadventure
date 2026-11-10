/** What tells whether a character walks: it does not on a vehicle, nor on the ice of a rink. */
export interface StepTaker {
    isRidingVehicle(): boolean;
    isOnIce(): boolean;
}

/** Whether the character takes steps, with their sound and their footprints: a skater glides, a rider rolls. */
export function takesSteps(character: StepTaker): boolean {
    return !character.isRidingVehicle() && !character.isOnIce();
}
