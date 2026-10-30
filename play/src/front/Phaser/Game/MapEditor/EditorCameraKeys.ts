import { get } from "svelte/store";
import { enableUserInputsStore } from "../../../Stores/UserInputStore";
import { waScaleManager } from "../../Services/WaScaleManager";
import type { GameScene } from "../GameScene";

export type MapScrollDirection = "up" | "down" | "left" | "right";

// Distance scrolled per frame, in screen pixels (divided by the zoom to get game pixels).
const SCROLL_STEP = 10;

/**
 * Maps a key to the direction the map scrolls in. Arrows plus ZQSD / WASD (AZERTY and QWERTY layouts).
 * Shortcuts with a modifier (Ctrl+Z to undo, Ctrl+D...) are left to the editor.
 */
export function getMapScrollDirection(
    event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
): MapScrollDirection | undefined {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return undefined;
    }
    switch (event.key.toLowerCase()) {
        case "arrowup":
        case "w":
        case "z":
            return "up";
        case "arrowdown":
        case "s":
            return "down";
        case "arrowleft":
        case "a":
        case "q":
            return "left";
        case "arrowright":
        case "d":
            return "right";
        default:
            return undefined;
    }
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target.isContentEditable)
    );
}

export function shouldScrollMapOnKeyDown(inputsEnabled: boolean, target: EventTarget | null): boolean {
    return inputsEnabled && !isTextEditingTarget(target);
}

export function getMapScrollDelta(
    pressed: ReadonlySet<MapScrollDirection>,
    zoomModifier: number,
): { x: number; y: number } {
    const step = SCROLL_STEP / zoomModifier;
    return {
        x: ((pressed.has("right") ? 1 : 0) - (pressed.has("left") ? 1 : 0)) * step,
        y: ((pressed.has("down") ? 1 : 0) - (pressed.has("up") ? 1 : 0)) * step,
    };
}

/**
 * Scrolls the map with the keyboard while the map editor is open, whatever the active tool.
 */
export class EditorCameraKeys {
    private readonly pressed = new Set<MapScrollDirection>();

    private readonly keyDownHandler = (event: KeyboardEvent) => {
        const direction = getMapScrollDirection(event);
        if (direction && shouldScrollMapOnKeyDown(get(enableUserInputsStore), event.target)) {
            this.pressed.add(direction);
        }
    };

    // A key is always released, even when the focus moved to an input meanwhile, so that the map never keeps scrolling.
    private readonly keyUpHandler = (event: KeyboardEvent) => {
        const direction = getMapScrollDirection(event);
        if (direction) {
            this.pressed.delete(direction);
        }
    };

    constructor(private readonly scene: GameScene) {}

    public start(): void {
        this.scene.input.keyboard?.on("keydown", this.keyDownHandler);
        this.scene.input.keyboard?.on("keyup", this.keyUpHandler);
    }

    public stop(): void {
        this.scene.input.keyboard?.off("keydown", this.keyDownHandler);
        this.scene.input.keyboard?.off("keyup", this.keyUpHandler);
        this.pressed.clear();
    }

    public update(): void {
        if (this.pressed.size === 0) {
            return;
        }
        if (!get(enableUserInputsStore)) {
            this.pressed.clear();
            return;
        }
        const { x, y } = getMapScrollDelta(this.pressed, waScaleManager.zoomModifier);
        if (x !== 0 || y !== 0) {
            this.scene.getCameraManager().scrollEditorCamera(x, y);
        }
    }
}
