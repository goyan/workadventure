import * as Phaser from "phaser";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../../Game/GameScene";
import { DEPTH_UI_INDEX } from "../../Game/DepthIndexes";
import { lampSource } from "../../Game/Lamps/LampReconcile";
import { coneFromTip, coneOpeningFromEdge, coneTip, type RgbLampSettings } from "../../Game/Lamps/RgbLampSettings";
import { isPointerInsideCanvas } from "../../Game/MapEditor/MapEditorPointer";

type HandleKind = "tip" | "firstEdge" | "secondEdge";

/** The handles of the edges stand this far along the reach of the cone: clear of the lamp and of the tip. */
const EDGE_HANDLE_REACH = 0.6;
const HANDLE_COLOUR = 0xffffff;
const EDGE_HANDLE_COLOUR = 0x00ffff;

/**
 * The handles of the RGB lamp selected in the map editor: one at the tip of its cone, dragged to turn the cone and set
 * its reach in one gesture, and one on each edge of the cone, dragged to open or close it. A local preview only (the
 * lamp shows it): the settings are saved once, on release.
 */
export class RgbLampHandles {
    private readonly handles: { kind: HandleKind; square: Phaser.GameObjects.Rectangle }[] = [];
    private readonly previousTopOnly: boolean;
    private drag: { kind: HandleKind; pointerId: number; original: RgbLampSettings; x: number; y: number } | undefined;
    private previousVisualSignature = "";
    private destroyed = false;

    constructor(
        private readonly scene: GameScene,
        private readonly entity: Entity,
        private readonly tileSize: number,
        /** The settings shown now: those saved, or those being dragged. */
        private readonly settings: () => RgbLampSettings,
        private readonly onPreview: (settings: RgbLampSettings) => void,
        private readonly onChange: (settings: RgbLampSettings) => void,
    ) {
        this.previousTopOnly = scene.input.topOnly;
        // Phaser collects draggables before dispatching pointerdown. Limit that list to the top handle.
        scene.input.setTopOnly(true);
        for (const kind of ["tip", "firstEdge", "secondEdge"] as const) {
            const tip = kind === "tip";
            const square = scene.add
                .rectangle(0, 0, tip ? 12 : 9, tip ? 12 : 9, tip ? HANDLE_COLOUR : EDGE_HANDLE_COLOUR)
                .setStrokeStyle(1, 0x000000)
                // The handles of the edges are diamonds: told from the tip at a glance.
                .setAngle(tip ? 0 : 45)
                .setDepth(DEPTH_UI_INDEX + 2)
                .setInteractive({ cursor: tip ? "move" : "ew-resize" });
            scene.input.setDraggable(square);
            square.on(
                Phaser.Input.Events.POINTER_DOWN,
                (pointer: Phaser.Input.Pointer, x: number, y: number, event: Phaser.Types.Input.EventData) => {
                    // Keep the handle click out of the placement/selection tools and the object's move gesture.
                    event.stopPropagation();
                },
            );
            square.on(Phaser.Input.Events.DRAG_START, (pointer: Phaser.Input.Pointer) => {
                if (this.drag || !pointer.leftButtonDown() || !this.entity.canEdit) return;
                this.drag = {
                    kind,
                    pointerId: pointer.id,
                    original: { ...this.settings() },
                    x: this.entity.x,
                    y: this.entity.y,
                };
            });
            square.on(Phaser.Input.Events.DRAG, this.move);
            square.on(Phaser.Input.Events.DRAG_END, this.release);
            this.handles.push({ kind, square });
        }
        scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.refresh);
        scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancel);
        scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.keyDown);
        entity.on(Phaser.GameObjects.Events.DESTROY, this.entityDestroyed);
        window.addEventListener("blur", this.cancel);
        this.refresh();
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.cancel();
        this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.refresh);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancel);
        this.scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.keyDown);
        if (this.scene.input.topOnly) this.scene.input.setTopOnly(this.previousTopOnly);
        window.removeEventListener("blur", this.cancel);
        this.entity.off(Phaser.GameObjects.Events.DESTROY, this.entityDestroyed);
        this.handles.forEach(({ square }) => square.destroy());
        this.scene.markDirty();
    }

    private readonly entityDestroyed = (): void => {
        this.destroy();
    };

    /** The point the light comes from. */
    private source(): { x: number; y: number } {
        return lampSource(this.entity, this.entity.getPrefab().lamp?.anchor);
    }

    private readonly move = (pointer: Phaser.Input.Pointer): void => {
        const drag = this.drag;
        if (!drag || drag.pointerId !== pointer.id) return;
        if (!this.entity.canEdit) {
            this.cancel();
            return;
        }
        const point = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const source = this.source();
        const current = this.settings();
        this.onPreview(
            drag.kind === "tip"
                ? { ...current, ...coneFromTip(source, point, this.tileSize) }
                : { ...current, angle: coneOpeningFromEdge(source, point, current.direction) },
        );
        this.refresh();
    };

    private readonly release = (pointer: Phaser.Input.Pointer): void => {
        const drag = this.drag;
        if (!drag || drag.pointerId !== pointer.id) return;
        const dragged = this.settings();
        const { original } = drag;
        const changed =
            dragged.radius !== original.radius ||
            dragged.direction !== original.direction ||
            dragged.angle !== original.angle;
        if (isPointerInsideCanvas(this.scene, pointer) && changed) {
            this.drag = undefined;
            this.onChange(dragged);
            this.refresh();
        } else {
            this.cancel();
        }
    };

    private readonly keyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") this.cancel();
    };

    private readonly cancel = (): void => {
        if (!this.drag) return;
        const { original } = this.drag;
        this.drag = undefined;
        this.onPreview(original);
        this.refresh();
    };

    private readonly refresh = (): void => {
        if (this.destroyed) return;
        // The lamp was moved under the gesture (another editor, an undo): the gesture is dropped.
        if (this.drag && (!this.entity.canEdit || this.entity.x !== this.drag.x || this.entity.y !== this.drag.y)) {
            this.cancel();
            return;
        }
        const source = this.source();
        const settings = this.settings();
        const zoom = this.scene.cameras.main.zoom;
        const visible = this.entity.visible && this.entity.canEdit;
        const signature = JSON.stringify([
            source.x,
            source.y,
            settings.radius,
            settings.direction,
            settings.angle,
            zoom,
            visible,
        ]);
        if (signature === this.previousVisualSignature) return;
        this.previousVisualSignature = signature;
        for (const { kind, square } of this.handles) {
            const side = kind === "firstEdge" ? -1 : 1;
            const position =
                kind === "tip"
                    ? coneTip(source, settings, this.tileSize)
                    : coneTip(
                          source,
                          {
                              radius: settings.radius * EDGE_HANDLE_REACH,
                              direction: settings.direction + (side * settings.angle) / 2,
                          },
                          this.tileSize,
                      );
            square
                .setPosition(position.x, position.y)
                .setScale(1 / zoom)
                .setVisible(visible);
            if (square.input) square.input.enabled = visible;
        }
        this.scene.markDirty();
    };
}
