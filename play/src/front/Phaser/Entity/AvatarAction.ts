export enum AvatarAction {
    Idle = "idle",
    Dance = "dance",
    Coffee = "coffee",
    Sleep = "sleep",
    Toilet = "toilet",
    Run = "run",
}

export const AVATAR_ACTION_VARIABLE = "_avatarAction";

/** Public player state is also writable by map scripts: accept only supported actions. */
export function readAvatarAction(value: unknown): AvatarAction {
    switch (value) {
        case AvatarAction.Dance:
        case AvatarAction.Coffee:
        case AvatarAction.Sleep:
        case AvatarAction.Toilet:
        case AvatarAction.Run:
            return value;
        default:
            return AvatarAction.Idle;
    }
}

/** Actions done on the object itself (in the bed, on the toilet, on the treadmill): the avatar first moves onto it. */
export function takesObjectPlace(action: AvatarAction): boolean {
    return action === AvatarAction.Sleep || action === AvatarAction.Toilet || action === AvatarAction.Run;
}
