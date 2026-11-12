import * as Phaser from "phaser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { RgbLampSettings } from "../../../../src/front/Phaser/Game/Lamps/RgbLampSettings";
import { RgbLampHandles } from "../../../../src/front/Phaser/Components/MapEditor/RgbLampHandles";

const controllers: RgbLampHandles[] = [];

afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    vi.restoreAllMocks();
});

/** A lamp of 32 px at (200, 150): its light comes from (216, 166). The camera shows the world at twice its size. */
function fixture(initial: Partial<RgbLampSettings> = {}) {
    const scene = mock<GameScene>();
    const systems = mock<Phaser.Scenes.Systems>();
    systems.game = mock<Phaser.Game>();
    systems.game.input = mock<Phaser.Input.InputManager>();
    systems.events = new Phaser.Events.EventEmitter();
    systems.displayList = mock<Phaser.GameObjects.DisplayList>();
    systems.updateList = mock<Phaser.GameObjects.UpdateList>();
    systems.settings = mock<Phaser.Types.Scenes.SettingsObject>();
    systems.canInput.mockReturnValue(true);
    Object.defineProperty(scene, "sys", { value: systems });
    scene.events = new Phaser.Events.EventEmitter();
    scene.input = new Phaser.Input.InputPlugin(scene);
    Object.defineProperty(systems, "input", { value: scene.input });
    const keyboard = mock<Phaser.Input.Keyboard.KeyboardPlugin>();
    scene.input.keyboard = keyboard;
    const keyboardEvents = new Phaser.Events.EventEmitter();
    keyboard.on.mockImplementation((name, listener) => {
        keyboardEvents.on(name, listener);
        return keyboard;
    });
    keyboard.off.mockImplementation((name, listener) => {
        keyboardEvents.off(name, listener);
        return keyboard;
    });
    scene.input.setTopOnly(false);
    scene.scale = mock<Phaser.Scale.ScaleManager>({ width: 2000, height: 2000 });
    scene.cameras = mock<Phaser.Cameras.Scene2D.CameraManager>();
    const camera = mock<Phaser.Cameras.Scene2D.Camera>({ zoom: 2 });
    scene.cameras.main = camera;
    camera.getWorldPoint.mockImplementation((x, y) => new Phaser.Math.Vector2(x / 2 + 100, y / 2 + 50));
    const factory = mock<Phaser.GameObjects.GameObjectFactory>();
    scene.add = factory;
    const squares: Phaser.GameObjects.Rectangle[] = [];
    factory.rectangle.mockImplementation((x, y, width, height, color) => {
        const rectangle = new Phaser.GameObjects.Rectangle(scene, x ?? 0, y ?? 0, width, height, color);
        squares.push(rectangle);
        return rectangle;
    });
    const entity = mock<Entity>({
        x: 200,
        y: 150,
        width: 32,
        height: 32,
        displayWidth: 32,
        displayHeight: 32,
        visible: true,
    });
    entity.getPrefab.mockReturnValue(
        mock<ReturnType<Entity["getPrefab"]>>({ lamp: { kind: "rgb", anchor: undefined } }),
    );
    Object.defineProperty(entity, "canEdit", { value: true, configurable: true });
    const entityEvents = new Phaser.Events.EventEmitter();
    entity.on.mockImplementation((name, listener) => {
        entityEvents.on(name, listener);
        return entity;
    });
    entity.off.mockImplementation((name, listener) => {
        entityEvents.off(name, listener);
        return entity;
    });
    let settings: RgbLampSettings = { color: "#ffd9a0", radius: 2, direction: 0, angle: 90, ...initial };
    const onPreview = vi.fn((next: RgbLampSettings) => {
        settings = next;
    });
    const onChange = vi.fn();
    const controller = new RgbLampHandles(scene, entity, 32, () => settings, onPreview, onChange);
    controllers.push(controller);
    const pointer = mock<Phaser.Input.Pointer>({ id: 0, x: 0, y: 0 });
    pointer.leftButtonDown.mockReturnValue(true);
    /** Puts the pointer on a point of the world, through the camera. */
    const pointAt = (x: number, y: number): void => {
        pointer.x = (x - 100) * 2;
        pointer.y = (y - 50) * 2;
    };
    const [tip, firstEdge, secondEdge] = squares;
    return {
        scene,
        entity,
        entityEvents,
        keyboardEvents,
        onPreview,
        onChange,
        pointer,
        pointAt,
        tip,
        firstEdge,
        secondEdge,
        controller,
    };
}

describe("Handles of an RGB lamp", () => {
    it("puts a handle at the tip of the cone, and one on each of its edges", () => {
        const f = fixture();
        // Two tiles to the east of the source.
        expect({ x: f.tip.x, y: f.tip.y }).toEqual({ x: 280, y: 166 });
        // The edges are 45 degrees on each side of the direction, at 60 % of the reach.
        const along = Math.cos(Math.PI / 4) * 64 * 0.6;
        expect(f.firstEdge.x).toBeCloseTo(216 + along, 6);
        expect(f.firstEdge.y).toBeCloseTo(166 - along, 6);
        expect(f.secondEdge.x).toBeCloseTo(216 + along, 6);
        expect(f.secondEdge.y).toBeCloseTo(166 + along, 6);
    });

    it("turns the cone and sets its reach by dragging its tip, shown at once and saved on release", () => {
        const f = fixture();
        // Three tiles under the source.
        f.pointAt(216, 166 + 96);
        f.tip.emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.tip.emit(Phaser.Input.Events.DRAG, f.pointer);
        const dragged = { color: "#ffd9a0", radius: 3, direction: 90, angle: 90 };
        expect(f.onPreview.mock.calls.at(-1)).toEqual([dragged]);
        expect(f.onChange.mock.calls).toHaveLength(0);
        f.tip.emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onChange.mock.calls).toEqual([[dragged]]);
    });

    it.each([0, 1])("opens the cone by dragging one of its edges: %s", (edge) => {
        const f = fixture({ direction: 90 });
        const handle = edge === 0 ? f.firstEdge : f.secondEdge;
        // 30 degrees beside the direction (downwards), on either side: an opening of 60 degrees.
        const side = edge === 0 ? -1 : 1;
        f.pointAt(216 + side * 50 * Math.tan(Math.PI / 6), 166 + 50);
        handle.emit(Phaser.Input.Events.DRAG_START, f.pointer);
        handle.emit(Phaser.Input.Events.DRAG, f.pointer);
        handle.emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onChange.mock.calls).toEqual([[{ color: "#ffd9a0", radius: 2, direction: 90, angle: 60 }]]);
    });

    it("follows the settings and the lamp: the handles are put back at every image", () => {
        const f = fixture();
        f.onPreview({ color: "#ffd9a0", radius: 4, direction: 180, angle: 90 });
        f.entity.x = 300;
        f.scene.events.emit(Phaser.Scenes.Events.PRE_UPDATE);
        expect(f.tip.x).toBeCloseTo(316 - 128, 6);
        expect(f.tip.y).toBeCloseTo(166, 6);
    });

    it.each(["escape", "blur", "outside", "collaborator"])("cancels an unfinished gesture: %s", (reason) => {
        const f = fixture();
        f.pointAt(216, 166 + 96);
        f.tip.emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.tip.emit(Phaser.Input.Events.DRAG, f.pointer);
        if (reason === "escape")
            f.keyboardEvents.emit(
                Phaser.Input.Keyboard.Events.ANY_KEY_DOWN,
                new KeyboardEvent("keydown", { key: "Escape" }),
            );
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
        if (reason === "outside") f.scene.input.emit(Phaser.Input.Events.POINTER_UP_OUTSIDE, f.pointer);
        if (reason === "collaborator") {
            f.entity.x = 300;
            f.scene.events.emit(Phaser.Scenes.Events.PRE_UPDATE);
        }
        f.tip.emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onChange.mock.calls).toHaveLength(0);
        expect(f.onPreview.mock.calls.at(-1)).toEqual([{ color: "#ffd9a0", radius: 2, direction: 0, angle: 90 }]);
    });

    it("does not save a gesture that ends out of the game", () => {
        const f = fixture();
        f.tip.emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.pointer.x = 2500;
        f.tip.emit(Phaser.Input.Events.DRAG, f.pointer);
        f.tip.emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onChange.mock.calls).toHaveLength(0);
    });

    it("leaves the lamp of someone who cannot edit it alone", () => {
        const f = fixture();
        Object.defineProperty(f.entity, "canEdit", { value: false, configurable: true });
        f.pointAt(216, 166 + 96);
        f.tip.emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.tip.emit(Phaser.Input.Events.DRAG, f.pointer);
        f.tip.emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onPreview.mock.calls).toHaveLength(0);
        expect(f.onChange.mock.calls).toHaveLength(0);
    });

    it("keeps a click on a handle out of the tools of the editor", () => {
        const f = fixture();
        const event = { stopPropagation: vi.fn() };
        f.tip.emit(Phaser.Input.Events.POINTER_DOWN, f.pointer, 0, 0, event);
        expect(event.stopPropagation.mock.calls).toHaveLength(1);
    });

    it("removes its handles and gives the input back when it goes, or when the lamp is deleted", () => {
        const f = fixture();
        expect(f.scene.input.topOnly).toBe(true);
        f.entityEvents.emit(Phaser.GameObjects.Events.DESTROY);
        expect(f.tip.scene).toBeUndefined();
        expect(f.scene.input.topOnly).toBe(false);
        expect(f.scene.events.listenerCount(Phaser.Scenes.Events.PRE_UPDATE)).toBe(0);
    });
});
