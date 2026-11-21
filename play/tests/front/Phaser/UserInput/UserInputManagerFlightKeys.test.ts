import * as Phaser from "phaser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { UserInputHandlerInterface } from "../../../../src/front/Interfaces/UserInputHandlerInterface";
import { UserInputEvent, UserInputManager } from "../../../../src/front/Phaser/UserInput/UserInputManager";

vi.mock("../../../../src/front/Touch/TouchScreenManager", () => ({
    touchScreenManager: { supportTouchScreen: false, primaryTouchDevice: false },
}));

/** The keys as the game sees them: real Phaser keys, pressed by real keyboard events. */
describe("the keys of the altitude, read at each game tick", () => {
    const keys = new Map<number, Phaser.Input.Keyboard.Key>();
    const flight = { active: false, climb: false };
    let manager: UserInputManager;

    const press = (code: number, init: KeyboardEventInit): void => {
        const key = keys.get(code);
        if (!key) throw new Error(`No key ${code}`);
        key.onDown(new KeyboardEvent("keydown", init));
    };

    beforeEach(() => {
        keys.clear();
        flight.active = false;
        flight.climb = false;
        const keyboard = mock<Phaser.Input.Keyboard.KeyboardPlugin>();
        keyboard.addKey.mockImplementation((code) => {
            const key = new Phaser.Input.Keyboard.Key(keyboard, Number(code));
            keys.set(Number(code), key);
            return key;
        });
        const input = mock<Phaser.Input.InputPlugin>();
        input.keyboard = keyboard;
        const scene = mock<Phaser.Scene>();
        Object.defineProperty(scene, "input", { configurable: true, value: input });
        Object.defineProperty(scene, "game", {
            configurable: true,
            value: { events: new Phaser.Events.EventEmitter() },
        });
        const handler = mock<UserInputHandlerInterface>({
            isAltitudeKeysActive: () => flight.active,
            isClimbPressed: () => flight.climb,
        });
        manager = new UserInputManager(scene, handler);
    });

    afterEach(() => {
        manager.destroy();
    });

    it("comes down with control in flight, and keeps steering with the arrow held before it", () => {
        flight.active = true;
        press(Phaser.Input.Keyboard.KeyCodes.RIGHT, { code: "ArrowRight", key: "ArrowRight" });
        press(Phaser.Input.Keyboard.KeyCodes.CTRL, { code: "ControlLeft", key: "Control", ctrlKey: true });
        // The arrow repeats while held: its events now carry the control key.
        press(Phaser.Input.Keyboard.KeyCodes.RIGHT, { code: "ArrowRight", key: "ArrowRight", ctrlKey: true });
        const events = manager.getEventListForGameTick();
        expect(events.get(UserInputEvent.Descend)).toBe(true);
        expect(events.get(UserInputEvent.MoveRight)).toBe(true);
    });

    it("leaves control a modifier on the ground: no descent, and a move held with it stops as before", () => {
        press(Phaser.Input.Keyboard.KeyCodes.RIGHT, { code: "ArrowRight", key: "ArrowRight" });
        press(Phaser.Input.Keyboard.KeyCodes.CTRL, { code: "ControlLeft", key: "Control", ctrlKey: true });
        press(Phaser.Input.Keyboard.KeyCodes.RIGHT, { code: "ArrowRight", key: "ArrowRight", ctrlKey: true });
        const events = manager.getEventListForGameTick();
        expect(events.get(UserInputEvent.Descend)).toBe(false);
        expect(events.get(UserInputEvent.MoveRight)).toBe(false);
    });

    it("does not come down while typing in a field", () => {
        flight.active = true;
        const field = document.createElement("input");
        document.body.appendChild(field);
        const typing = new KeyboardEvent("keydown", { code: "ControlLeft", key: "Control", ctrlKey: true });
        field.dispatchEvent(typing);
        keys.get(Phaser.Input.Keyboard.KeyCodes.CTRL)?.onDown(typing);
        expect(manager.getEventListForGameTick().get(UserInputEvent.Descend)).toBe(false);
        field.remove();
    });

    it("climbs with space only for a press the handler gave to the airplane", () => {
        press(Phaser.Input.Keyboard.KeyCodes.SPACE, { code: "Space", key: " " });
        expect(manager.getEventListForGameTick().get(UserInputEvent.Climb)).toBe(false);
        flight.climb = true;
        expect(manager.getEventListForGameTick().get(UserInputEvent.Climb)).toBe(true);
        keys.get(Phaser.Input.Keyboard.KeyCodes.SPACE)?.onUp(new KeyboardEvent("keyup", { code: "Space", key: " " }));
        expect(manager.getEventListForGameTick().get(UserInputEvent.Climb)).toBe(false);
    });

    it("reads nothing while the controls are disabled", () => {
        flight.active = true;
        flight.climb = true;
        press(Phaser.Input.Keyboard.KeyCodes.CTRL, { code: "ControlLeft", key: "Control", ctrlKey: true });
        press(Phaser.Input.Keyboard.KeyCodes.SPACE, { code: "Space", key: " " });
        manager.disableControls("store");
        const events = manager.getEventListForGameTick();
        expect(events.get(UserInputEvent.Descend)).toBe(false);
        expect(events.get(UserInputEvent.Climb)).toBe(false);
    });
});
