import * as Phaser from "phaser";
import { mock } from "vitest-mock-extended";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { AreaPreview } from "../../../../src/front/Phaser/Components/MapEditor/AreaPreview";
import { AreaEditorTool } from "../../../../src/front/Phaser/Game/MapEditor/Tools/AreaEditorTool";
import { isAreaDuplicateGesture } from "../../../../src/front/Phaser/Components/MapEditor/AreaDuplicateGesture";
import { mapEditorAreaModeStore, mapEditorSelectedAreaPreviewStore } from "../../../../src/front/Stores/MapEditorStore";

vi.mock("@wa-modals", () => ({ modals: { stack: [], open: vi.fn(), close: vi.fn() } }));

describe("AreaEditorTool", () => {
    let tool: AreaEditorTool;
    let shiftKey: Phaser.Input.Keyboard.Key;
    let ctrlKey: Phaser.Input.Keyboard.Key;

    beforeEach(() => {
        const keyboard = mock<Phaser.Input.Keyboard.KeyboardPlugin>();
        shiftKey = new Phaser.Input.Keyboard.Key(keyboard, Phaser.Input.Keyboard.KeyCodes.SHIFT);
        ctrlKey = new Phaser.Input.Keyboard.Key(keyboard, Phaser.Input.Keyboard.KeyCodes.CTRL);
        keyboard.addKey.mockImplementation((key) =>
            key === Phaser.Input.Keyboard.KeyCodes.SHIFT ? shiftKey : ctrlKey,
        );

        const scene = mock<GameScene>();
        const input = mock<Phaser.Input.InputPlugin>();
        input.keyboard = keyboard;
        input.setDefaultCursor.mockReturnValue(input);
        scene.input = input;
        const graphics = mock<Phaser.GameObjects.Graphics>();
        graphics.setDepth.mockReturnValue(graphics);
        graphics.clear.mockReturnValue(graphics);
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        factory.graphics.mockReturnValue(graphics);
        scene.add = factory;
        const gameMapFrontWrapper = mock<GameMapFrontWrapper>();
        gameMapFrontWrapper.getAreas.mockReturnValue(new Map());
        gameMapFrontWrapper.getEntitiesManager.mockReturnValue(mock<EntitiesManager>());
        scene.getGameMapFrontWrapper.mockReturnValue(gameMapFrontWrapper);

        const mapEditorModeManager = mock<MapEditorModeManager>();
        mapEditorModeManager.getScene.mockReturnValue(scene);
        tool = new AreaEditorTool(mapEditorModeManager);
    });

    afterEach(() => {
        mapEditorSelectedAreaPreviewStore.set(undefined);
        mapEditorAreaModeStore.set("ADD");
    });

    it("deselects the selected area on Escape", () => {
        tool.activate();
        mapEditorAreaModeStore.set("EDIT");
        mapEditorSelectedAreaPreviewStore.set(mock<AreaPreview>());

        tool.handleKeyDownEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(get(mapEditorAreaModeStore)).toBe("ADD");
        expect(get(mapEditorSelectedAreaPreviewStore)).toBeUndefined();
    });

    it("removes its Ctrl and Shift listeners when it is deactivated, and never stacks them", () => {
        tool.activate();
        tool.clear();
        expect(ctrlKey.listenerCount(Phaser.Input.Keyboard.Events.DOWN)).toBe(0);
        expect(ctrlKey.listenerCount(Phaser.Input.Keyboard.Events.UP)).toBe(0);
        expect(shiftKey.listenerCount(Phaser.Input.Keyboard.Events.DOWN)).toBe(0);

        tool.activate();
        expect(ctrlKey.listenerCount(Phaser.Input.Keyboard.Events.DOWN)).toBe(1);
        expect(ctrlKey.listenerCount(Phaser.Input.Keyboard.Events.UP)).toBe(1);
        expect(shiftKey.listenerCount(Phaser.Input.Keyboard.Events.UP)).toBe(1);
    });
});

describe("isAreaDuplicateGesture", () => {
    it("duplicates with Ctrl, Cmd or Option held at the end of the drag", () => {
        expect(isAreaDuplicateGesture(new MouseEvent("mouseup", { metaKey: true }), false)).toBe(true);
        expect(isAreaDuplicateGesture(new MouseEvent("mouseup", { altKey: true }), false)).toBe(true);
        expect(isAreaDuplicateGesture(new MouseEvent("mouseup", { ctrlKey: true }), false)).toBe(true);
        // The Phaser Ctrl key may be down while the DOM event does not say so.
        expect(isAreaDuplicateGesture(new MouseEvent("mouseup"), true)).toBe(true);
    });

    it("only moves the area without any of these keys", () => {
        expect(isAreaDuplicateGesture(new MouseEvent("mouseup", { shiftKey: true }), false)).toBe(false);
        expect(isAreaDuplicateGesture(undefined, false)).toBe(false);
    });
});
