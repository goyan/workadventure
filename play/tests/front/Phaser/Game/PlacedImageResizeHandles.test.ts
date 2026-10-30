import { afterEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { PlacedImageResizeHandles } from "../../../../src/front/Phaser/Components/MapEditor/PlacedImageResizeHandles";

const controllers: PlacedImageResizeHandles[] = [];

afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    vi.restoreAllMocks();
});

function fixture(keepProportions = true) {
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
    const rectangles: Phaser.GameObjects.Rectangle[] = [];
    factory.rectangle.mockImplementation((x, y, width, height, color) => {
        const rectangle = new Phaser.GameObjects.Rectangle(scene, x ?? 0, y ?? 0, width, height, color);
        rectangles.push(rectangle);
        return rectangle;
    });
    const preview = mock<Phaser.GameObjects.Image>();
    preview.setOrigin.mockReturnValue(preview);
    preview.setDepth.mockReturnValue(preview);
    preview.setPosition.mockReturnValue(preview);
    preview.setDisplaySize.mockReturnValue(preview);
    preview.setVisible.mockReturnValue(preview);
    factory.image.mockReturnValue(preview);
    const entity = mock<Entity>({
        x: 200,
        y: 150,
        width: 100,
        height: 50,
        visible: true,
        alpha: 0.8,
        texture: { key: "logo" },
        frame: { name: "__BASE" },
    });
    Object.defineProperty(entity, "canEdit", { value: true, configurable: true });
    entity.setAlpha.mockImplementation((alpha) => {
        entity.alpha = alpha ?? 1;
        return entity;
    });
    const onPreview = vi.fn();
    const onResize = vi.fn();
    let busy = false;
    const controller = new PlacedImageResizeHandles(
        scene,
        entity,
        () => keepProportions,
        () => busy,
        onPreview,
        onResize,
    );
    controllers.push(controller);
    const pointer = mock<Phaser.Input.Pointer>({ id: 0, x: 600, y: 400 });
    pointer.leftButtonDown.mockReturnValue(true);
    const squares = rectangles.slice(1);
    return {
        scene,
        entity,
        preview,
        onPreview,
        onResize,
        pointer,
        squares,
        keyboardEvents,
        controller,
        setBusy: () => {
            busy = true;
        },
    };
}

describe("Direct placed image resizing", () => {
    it.each([
        [0, 0, 100, { x: 100, y: 100, width: 200, height: 100 }],
        [1, 600, 100, { x: 200, y: 100, width: 200, height: 100 }],
        [2, 0, 400, { x: 100, y: 150, width: 200, height: 100 }],
        [3, 600, 400, { x: 200, y: 150, width: 200, height: 100 }],
    ])("keeps the opposite corner fixed with camera zoom and pan: %s", (index, x, y, expected) => {
        const f = fixture();
        f.pointer.x = x;
        f.pointer.y = y;
        f.squares[index].emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.squares[index].emit(Phaser.Input.Events.DRAG, f.pointer);
        expect(f.preview.setDisplaySize.mock.calls.at(-1)).toEqual([200, 100]);
        expect(f.onResize).not.toHaveBeenCalled();
        expect({ x: f.entity.x, y: f.entity.y, width: f.entity.width, height: f.entity.height }).toEqual({
            x: 200,
            y: 150,
            width: 100,
            height: 50,
        });
        f.squares[index].emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onResize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(expected));
        expect(f.entity.alpha).toBe(0.8);
    });

    it("permits independent dimensions with the proportions switch off", () => {
        const f = fixture(false);
        f.pointer.x = 600;
        f.pointer.y = 600;
        f.squares[3].emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG, f.pointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onResize).toHaveBeenCalledWith(expect.objectContaining({ x: 200, y: 150, width: 200, height: 200 }));
    });

    it("keeps the active gesture when another pointer tries to grab a second corner", () => {
        const f = fixture();
        f.squares[3].emit(Phaser.Input.Events.DRAG_START, f.pointer);
        const otherPointer = mock<Phaser.Input.Pointer>({ id: 1, x: 100, y: 100 });
        otherPointer.leftButtonDown.mockReturnValue(true);
        f.squares[0].emit(Phaser.Input.Events.DRAG_START, otherPointer);
        f.squares[0].emit(Phaser.Input.Events.DRAG_END, otherPointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG, f.pointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onResize).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ x: 200, y: 150, width: 200, height: 100 }),
        );
        expect(f.entity.alpha).toBe(0.8);
    });

    it("uses the real Phaser pointer dispatcher to prevent a handle click reaching placement or the image", () => {
        const f = fixture();
        const placementDown = vi.fn();
        f.scene.input.on(Phaser.Input.Events.POINTER_DOWN, placementDown);
        f.entity.input = mock<Phaser.Types.Input.InteractiveObject>({ enabled: true, draggable: true, dragState: 0 });
        Object.defineProperty(f.pointer, "primaryDown", { value: true });
        f.pointer.camera = f.scene.cameras.main;
        f.scene.cameras.main.renderList = [f.entity, ...f.squares];
        f.scene.input.setDragState(f.pointer, 0);
        // InputPlugin's private dispatcher is the runtime boundary between object and scene events.
        Reflect.set(f.scene.input, "_temp", [f.squares[3], f.entity]);
        Reflect.apply(Reflect.get(f.scene.input, "processDragDownEvent"), f.scene.input, [f.pointer]);
        Reflect.apply(Reflect.get(f.scene.input, "processDownEvents"), f.scene.input, [f.pointer]);
        expect(placementDown).not.toHaveBeenCalled();
        expect(f.entity.emit.mock.calls).toHaveLength(0);
        expect(f.entity.alpha).toBe(0);
        expect(f.scene.input.topOnly).toBe(true);
        f.scene.input.off(Phaser.Input.Events.POINTER_DOWN, placementDown);
    });

    it.each(["escape", "blur", "outside", "destroy", "collaborator"])("cancels an unfinished gesture: %s", (reason) => {
        const f = fixture();
        f.squares[3].emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG, f.pointer);
        if (reason === "escape")
            f.keyboardEvents.emit(
                Phaser.Input.Keyboard.Events.ANY_KEY_DOWN,
                new KeyboardEvent("keydown", { key: "Escape" }),
            );
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
        if (reason === "outside") f.scene.input.emit(Phaser.Input.Events.POINTER_UP_OUTSIDE, f.pointer);
        if (reason === "destroy") {
            f.controller.destroy();
            controllers.pop();
        }
        if (reason === "collaborator") {
            f.entity.x = 300;
            f.scene.events.emit(Phaser.Scenes.Events.PRE_UPDATE);
        }
        f.squares[3].emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onResize).not.toHaveBeenCalled();
        expect(f.entity.alpha).toBe(0.8);
        expect(f.onPreview.mock.calls.at(-1)).toEqual([{ width: 100, height: 50 }]);
    });

    it("does not save when Phaser ends the drag outside before dispatching pointerupoutside", () => {
        const f = fixture();
        f.squares[3].emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.pointer.x = 2500;
        f.squares[3].emit(Phaser.Input.Events.DRAG, f.pointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onResize).not.toHaveBeenCalled();
        expect(f.entity.alpha).toBe(0.8);
    });

    it("disables handles while saving and cleans up listeners and input configuration", () => {
        const f = fixture();
        f.setBusy();
        f.scene.events.emit(Phaser.Scenes.Events.PRE_UPDATE);
        expect(f.squares.every((square) => !square.visible && !square.input?.enabled)).toBe(true);
        f.squares[3].emit(Phaser.Input.Events.DRAG_START, f.pointer);
        f.squares[3].emit(Phaser.Input.Events.DRAG_END, f.pointer);
        expect(f.onResize).not.toHaveBeenCalled();
        f.controller.destroy();
        controllers.pop();
        expect(f.scene.input.topOnly).toBe(false);
        expect(f.scene.events.listenerCount(Phaser.Scenes.Events.PRE_UPDATE)).toBe(0);
        expect(f.scene.input.listenerCount(Phaser.Input.Events.POINTER_UP_OUTSIDE)).toBe(0);
        expect(f.keyboardEvents.listenerCount(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN)).toBe(0);
        expect(f.squares.every((square) => !square.scene)).toBe(true);
    });
});
