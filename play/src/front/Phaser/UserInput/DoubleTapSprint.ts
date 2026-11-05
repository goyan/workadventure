import { UserInputEvent } from "./UserInputManager";

// Read at use time: UserInputManager imports this file, so its enum is not defined yet when this module loads.
function moves(): UserInputEvent[] {
    return [UserInputEvent.MoveUp, UserInputEvent.MoveDown, UserInputEvent.MoveLeft, UserInputEvent.MoveRight];
}
/** Two presses of the same direction within this delay start sprinting. */
export const DOUBLE_TAP_DELAY_MS = 300;

/**
 * Double tap on a direction key to sprint, like in many games: pressing the same direction twice quickly runs
 * until every direction key is released. Fed with the direction keys down at each game tick.
 */
export class DoubleTapSprint {
    private readonly lastPressAt = new Map<UserInputEvent, number>();
    private wasDown = new Set<UserInputEvent>();
    private sprinting = false;

    public update(isDown: (event: UserInputEvent) => boolean, now: number): boolean {
        const down = new Set(moves().filter(isDown));
        for (const event of down) {
            if (this.wasDown.has(event)) continue;
            const last = this.lastPressAt.get(event);
            if (last !== undefined && now - last <= DOUBLE_TAP_DELAY_MS) {
                this.sprinting = true;
            }
            this.lastPressAt.set(event, now);
        }
        this.wasDown = down;
        if (down.size === 0) {
            this.sprinting = false;
        }
        return this.sprinting;
    }
}
