import { PERCEPTION_BASIC, PERCEPTION_VARIABLE } from "@workadventure/map-editor";

/** The altitude a browser publishes for a plane in flight (AIRPLANE_AREA_LEVEL of play): no floor, it flies over. */
const IN_FLIGHT_Z = 2000;

/**
 * Whether a player plays in Basique, by their public player variable PERCEPTION_VARIABLE (values serialized as JSON,
 * as the front sends them):
 * for them no horde of zombies exists, so it neither runs to them nor bumps into them.
 */
export function playsBasic(variables: ReadonlyMap<string, { value: string }> | undefined): boolean {
    const told = variables?.get(PERCEPTION_VARIABLE)?.value;
    if (told === undefined) return false;
    try {
        return JSON.parse(told) === PERCEPTION_BASIC;
    } catch {
        return false;
    }
}

/**
 * Where the avatars of the room stand, each by the id of its user: what a horde of zombies runs to and bumps into.
 * Not those who play in Basique: the horde does not exist for them, and the others would see it gather round someone
 * it never reaches. Filtered here, in what the server tells every browser, so that all step the same crowd.
 * On a raised floor (the deck of a bridge, `getFloorZ` px up) an avatar is drawn that much further north than the
 * ground under it, where the horde runs: told at that ground. Not a plane in flight, which is drawn where it is.
 */
export function zombieAvatarsOf(
    users: Iterable<{
        id: number;
        disconnected?: boolean;
        getPosition(): { x: number; y: number };
        getFloorZ(): number;
        getVariables(): { getVariables(): ReadonlyMap<string, { value: string }> | undefined };
    }>,
): { key: number; x: number; y: number }[] {
    const avatars: { key: number; x: number; y: number }[] = [];
    for (const user of users) {
        if (user.disconnected === true || playsBasic(user.getVariables().getVariables())) continue;
        const { x, y } = user.getPosition();
        const floorZ = user.getFloorZ();
        avatars.push({ key: user.id, x, y: floorZ < IN_FLIGHT_Z ? y + floorZ : y });
    }
    return avatars;
}
