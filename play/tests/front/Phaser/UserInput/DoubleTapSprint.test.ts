import { describe, expect, it } from "vitest";
import { UserInputEvent } from "../../../../src/front/Phaser/UserInput/UserInputManager";
import { DoubleTapSprint } from "../../../../src/front/Phaser/UserInput/DoubleTapSprint";

const keys =
    (...down: UserInputEvent[]) =>
    (event: UserInputEvent) =>
        down.includes(event);

describe("DoubleTapSprint", () => {
    it("sprints after two quick presses of the same direction, until the keys are released", () => {
        const sprint = new DoubleTapSprint();
        expect(sprint.update(keys(UserInputEvent.MoveRight), 0)).toBe(false);
        expect(sprint.update(keys(), 100)).toBe(false);
        expect(sprint.update(keys(UserInputEvent.MoveRight), 200)).toBe(true);
        expect(sprint.update(keys(UserInputEvent.MoveRight, UserInputEvent.MoveUp), 900)).toBe(true);
        expect(sprint.update(keys(), 1000)).toBe(false);
    });

    it("does not sprint on slow presses nor on two different directions", () => {
        const sprint = new DoubleTapSprint();
        sprint.update(keys(UserInputEvent.MoveRight), 0);
        sprint.update(keys(), 100);
        expect(sprint.update(keys(UserInputEvent.MoveRight), 600)).toBe(false);
        sprint.update(keys(), 650);
        expect(sprint.update(keys(UserInputEvent.MoveLeft), 700)).toBe(false);
    });

    it("does not count a key held down as a second press", () => {
        const sprint = new DoubleTapSprint();
        sprint.update(keys(UserInputEvent.MoveDown), 0);
        expect(sprint.update(keys(UserInputEvent.MoveDown), 100)).toBe(false);
    });
});
