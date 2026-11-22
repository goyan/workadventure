/**
 * Whether a player perceives the world everyone shares, or a world of their own: Basique (no night, no weather, no
 * effects, see BasicModeStore) or the weather of a city they follow on their clock (NightMode.World, see
 * ChosenPlaceWeather), or fast water of their own (FastWaterStore). Shared as a public player variable, not saved, like the torch (no change to the protocol nor
 * the back). Nothing else is sent: neither the name nor the coordinates of the place followed.
 */
export const PERCEPTION_VARIABLE = "_perception";

/** `none`: the shared world; `basic`: Basique; `place`: the weather of another place; `water`: fast water. */
export type Perception = "none" | "basic" | "place" | "water";

/** The symbol drawn over a player whose perception is not the shared one. */
export type PerceptionMark = Exclude<Perception, "none">;

/** Another player's perception, from their player variable: anything but a known value (an older client) is `none`. */
export function decodePerception(value: unknown): Perception {
    return value === "basic" || value === "place" || value === "water" ? value : "none";
}

/**
 * The perception of the local player. Basique wins over a city followed: it hides the weather and the night
 * altogether, so the sky of that city is not drawn for them either. A city followed wins over fast water: its water is
 * the player's own already, and its sky says more.
 */
export function perceptionOf(state: { basic: boolean; place: boolean; fastWater?: boolean }): Perception {
    if (state.basic) return "basic";
    if (state.place) return "place";
    return state.fastWater ? "water" : "none";
}

/**
 * The symbol a viewer sees over a bearer: only a viewer who perceives the shared world (neither Basique nor another
 * place) sees it, never over their own avatar.
 */
export function shownPerceptionMark(viewer: Perception, bearer: Perception, self: boolean): PerceptionMark | undefined {
    if (self || viewer !== "none" || bearer === "none") return undefined;
    return bearer;
}
