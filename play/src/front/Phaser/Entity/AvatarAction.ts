export enum AvatarAction {
    Idle = "idle",
    Dance = "dance",
    Coffee = "coffee",
    Sleep = "sleep",
    Toilet = "toilet",
}

export const AVATAR_ACTION_VARIABLE = "_avatarAction";

/** Public player state is also writable by map scripts: accept only supported actions. */
export function readAvatarAction(value: unknown): AvatarAction {
    switch (value) {
        case AvatarAction.Dance:
        case AvatarAction.Coffee:
        case AvatarAction.Sleep:
        case AvatarAction.Toilet:
            return value;
        default:
            return AvatarAction.Idle;
    }
}
