/*export enum PlayerAnimationDirections {
    Down = "down",
    Left = "left",
    Up = "up",
    Right = "right",
}*/
export enum PlayerAnimationTypes {
    Walk = "walk",
    Idle = "idle",
    /** On the ice: a long glide on each foot, with a quick step between the two. */
    IceSkate = "iceSkate",
}

/** Frames per second of the skating animation: each glide holds its frame three times as long as the step. */
export const ICE_SKATE_FRAME_RATE = 8;

// Running plays the walking animation twice as fast
export const RUN_ANIMATION_SPEED = 2;

export interface AnimationData {
    key: string;
    frameRate: number;
    repeat: number;
    frameModel: string; //todo use an enum
    frames: number[];
}

export function getPlayerAnimations(name: string): AnimationData[] {
    return [
        {
            key: `${name}-down-${PlayerAnimationTypes.Walk}`,
            frameModel: name,
            frames: [0, 1, 2, 1],
            frameRate: 10,
            repeat: -1,
        },
        {
            key: `${name}-left-${PlayerAnimationTypes.Walk}`,
            frameModel: name,
            frames: [3, 4, 5, 4],
            frameRate: 10,
            repeat: -1,
        },
        {
            key: `${name}-right-${PlayerAnimationTypes.Walk}`,
            frameModel: name,
            frames: [6, 7, 8, 7],
            frameRate: 10,
            repeat: -1,
        },
        {
            key: `${name}-up-${PlayerAnimationTypes.Walk}`,
            frameModel: name,
            frames: [9, 10, 11, 10],
            frameRate: 10,
            repeat: -1,
        },
        {
            key: `${name}-down-${PlayerAnimationTypes.Idle}`,
            frameModel: name,
            frames: [1],
            frameRate: 10,
            repeat: 1,
        },
        {
            key: `${name}-left-${PlayerAnimationTypes.Idle}`,
            frameModel: name,
            frames: [4],
            frameRate: 10,
            repeat: 1,
        },
        {
            key: `${name}-right-${PlayerAnimationTypes.Idle}`,
            frameModel: name,
            frames: [7],
            frameRate: 10,
            repeat: 1,
        },
        {
            key: `${name}-up-${PlayerAnimationTypes.Idle}`,
            frameModel: name,
            frames: [10],
            frameRate: 10,
            repeat: 1,
        },
        {
            key: `${name}-down-${PlayerAnimationTypes.IceSkate}`,
            frameModel: name,
            frames: [0, 0, 0, 1, 2, 2, 2, 1],
            frameRate: ICE_SKATE_FRAME_RATE,
            repeat: -1,
        },
        {
            key: `${name}-left-${PlayerAnimationTypes.IceSkate}`,
            frameModel: name,
            frames: [3, 3, 3, 4, 5, 5, 5, 4],
            frameRate: ICE_SKATE_FRAME_RATE,
            repeat: -1,
        },
        {
            key: `${name}-right-${PlayerAnimationTypes.IceSkate}`,
            frameModel: name,
            frames: [6, 6, 6, 7, 8, 8, 8, 7],
            frameRate: ICE_SKATE_FRAME_RATE,
            repeat: -1,
        },
        {
            key: `${name}-up-${PlayerAnimationTypes.IceSkate}`,
            frameModel: name,
            frames: [9, 9, 9, 10, 11, 11, 11, 10],
            frameRate: ICE_SKATE_FRAME_RATE,
            repeat: -1,
        },
    ];
}
