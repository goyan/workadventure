import * as Phaser from "phaser";
import type { EntityDimensions } from "@workadventure/map-editor";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../../Game/GameScene";
import { DEPTH_UI_INDEX } from "../../Game/DepthIndexes";
import { MAX_PLACED_IMAGE_DIMENSION } from "../../Game/MapEditor/PlacedImageResize";
import { isPointerInsideCanvas } from "../../Game/MapEditor/MapEditorPointer";
import { SizeAlteringSquarePosition } from "./SizeAlteringSquare";

/** A local preview only: the native resize command commits once, on release. */
export class PlacedImageResizeHandles {
    private readonly handles: { corner: SizeAlteringSquarePosition; square: Phaser.GameObjects.Rectangle }[] = [];
    private readonly outline: Phaser.GameObjects.Rectangle;
    private readonly preview: Phaser.GameObjects.Image;
    private readonly previousTopOnly: boolean;
    private drag:
        | { corner: SizeAlteringSquarePosition; pointerId: number; original: Phaser.Geom.Rectangle; alpha: number }
        | undefined;
    private bounds: Phaser.Geom.Rectangle;
    private previousVisualSignature = "";

    constructor(
        private readonly scene: GameScene,
        private readonly entity: Entity,
        private readonly keepProportions: () => boolean,
        private readonly busy: () => boolean,
        private readonly onPreview: (size: EntityDimensions) => void,
        private readonly onResize: (bounds: Phaser.Geom.Rectangle) => void,
    ) {
        this.previousTopOnly = scene.input.topOnly;
        // Phaser collects draggables before dispatching pointerdown. Limit that list to the top handle.
        scene.input.setTopOnly(true);
        this.bounds = this.getEntityBounds();
        this.preview = scene.add
            .image(entity.x, entity.y, entity.texture.key, entity.frame.name)
            .setOrigin(0)
            .setDepth(DEPTH_UI_INDEX)
            .setVisible(false);
        this.outline = scene.add
            .rectangle(0, 0, entity.width, entity.height)
            .setStrokeStyle(1, 0x00ffff)
            .setDepth(DEPTH_UI_INDEX + 1);
        for (const corner of [
            SizeAlteringSquarePosition.TopLeft,
            SizeAlteringSquarePosition.TopRight,
            SizeAlteringSquarePosition.BottomLeft,
            SizeAlteringSquarePosition.BottomRight,
        ]) {
            const square = scene.add
                .rectangle(0, 0, 10, 10, 0xffffff)
                .setStrokeStyle(1, 0x000000)
                .setDepth(DEPTH_UI_INDEX + 2)
                .setInteractive({
                    cursor:
                        corner === SizeAlteringSquarePosition.TopLeft ||
                        corner === SizeAlteringSquarePosition.BottomRight
                            ? "nwse-resize"
                            : "nesw-resize",
                });
            scene.input.setDraggable(square);
            square.on(
                Phaser.Input.Events.POINTER_DOWN,
                (pointer: Phaser.Input.Pointer, x: number, y: number, event: Phaser.Types.Input.EventData) => {
                    // Keep the handle click out of the placement/selection tools and the image's move gesture.
                    event.stopPropagation();
                },
            );
            square.on(Phaser.Input.Events.DRAG_START, (pointer: Phaser.Input.Pointer) => {
                if (!pointer.leftButtonDown() || this.busy() || !this.entity.canEdit) return;
                this.bounds = this.getEntityBounds();
                this.drag = {
                    corner,
                    pointerId: pointer.id,
                    original: Phaser.Geom.Rectangle.Clone(this.bounds),
                    alpha: this.entity.alpha,
                };
                this.entity.setAlpha(0);
                this.preview.setVisible(true);
                this.refresh();
            });
            square.on(Phaser.Input.Events.DRAG, this.move);
            square.on(Phaser.Input.Events.DRAG_END, this.release);
            this.handles.push({ corner, square });
        }
        scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.refresh);
        scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancel);
        scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.keyDown);
        window.addEventListener("blur", this.cancel);
        this.refresh();
    }

    public destroy(): void {
        this.cancel();
        this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.refresh);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.cancel);
        this.scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.keyDown);
        if (this.scene.input.topOnly) this.scene.input.setTopOnly(this.previousTopOnly);
        window.removeEventListener("blur", this.cancel);
        this.handles.forEach(({ square }) => square.destroy());
        this.preview.destroy();
        this.outline.destroy();
    }

    private getEntityBounds(): Phaser.Geom.Rectangle {
        return new Phaser.Geom.Rectangle(this.entity.x, this.entity.y, this.entity.width, this.entity.height);
    }

    private readonly move = (pointer: Phaser.Input.Pointer): void => {
        const drag = this.drag;
        if (!drag || drag.pointerId !== pointer.id) return;
        if (!this.entity.canEdit) {
            this.cancel();
            return;
        }
        const point = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const left =
            drag.corner === SizeAlteringSquarePosition.TopLeft || drag.corner === SizeAlteringSquarePosition.BottomLeft;
        const top =
            drag.corner === SizeAlteringSquarePosition.TopLeft || drag.corner === SizeAlteringSquarePosition.TopRight;
        const anchorX = left ? drag.original.right : drag.original.left;
        const anchorY = top ? drag.original.bottom : drag.original.top;
        let width = Math.max(1, Math.min(MAX_PLACED_IMAGE_DIMENSION, (point.x - anchorX) * (left ? -1 : 1)));
        let height = Math.max(1, Math.min(MAX_PLACED_IMAGE_DIMENSION, (point.y - anchorY) * (top ? -1 : 1)));
        if (this.keepProportions()) {
            // Project the pointer onto the original diagonal; the opposite corner stays fixed.
            const source = drag.original;
            const scale = Math.min(
                MAX_PLACED_IMAGE_DIMENSION / Math.max(source.width, source.height),
                Math.max(
                    1 / Math.min(source.width, source.height),
                    (width * source.width + height * source.height) /
                        (source.width * source.width + source.height * source.height),
                ),
            );
            width = source.width * scale;
            height = source.height * scale;
        }
        width = Math.round(width);
        height = Math.round(height);
        this.bounds.setTo(left ? anchorX - width : anchorX, top ? anchorY - height : anchorY, width, height);
        this.onPreview({ width, height });
        this.refresh();
    };

    private readonly release = (pointer: Phaser.Input.Pointer): void => {
        if (!this.drag || this.drag.pointerId !== pointer.id) return;
        const bounds = Phaser.Geom.Rectangle.Clone(this.bounds);
        const original = this.drag.original;
        this.cancel();
        if (isPointerInsideCanvas(this.scene, pointer) && !Phaser.Geom.Rectangle.Equals(bounds, original))
            this.onResize(bounds);
    };

    private readonly keyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") this.cancel();
    };

    private readonly cancel = (): void => {
        if (!this.drag) return;
        this.entity.setAlpha(this.drag.alpha);
        this.drag = undefined;
        this.preview.setVisible(false);
        this.bounds = this.getEntityBounds();
        this.onPreview({ width: this.bounds.width, height: this.bounds.height });
        this.refresh();
    };

    private readonly refresh = (): void => {
        if (
            this.drag &&
            (!this.entity.canEdit || this.entity.x !== this.drag.original.x || this.entity.y !== this.drag.original.y)
        ) {
            this.cancel();
            return;
        }
        if (!this.drag) this.bounds = this.getEntityBounds();
        const bounds = this.bounds;
        const zoom = this.scene.cameras.main.zoom;
        const visible = this.entity.visible && this.entity.canEdit && !this.busy();
        const signature = JSON.stringify([bounds.x, bounds.y, bounds.width, bounds.height, zoom, visible, !!this.drag]);
        if (signature === this.previousVisualSignature) return;
        this.previousVisualSignature = signature;
        this.outline
            .setPosition(bounds.centerX, bounds.centerY)
            .setSize(bounds.width, bounds.height)
            .setStrokeStyle(1 / zoom, 0x00ffff)
            .setVisible(visible);
        this.preview.setPosition(bounds.x, bounds.y).setDisplaySize(bounds.width, bounds.height);
        for (const { corner, square } of this.handles) {
            const left =
                corner === SizeAlteringSquarePosition.TopLeft || corner === SizeAlteringSquarePosition.BottomLeft;
            const top = corner === SizeAlteringSquarePosition.TopLeft || corner === SizeAlteringSquarePosition.TopRight;
            square
                .setPosition(left ? bounds.left : bounds.right, top ? bounds.top : bounds.bottom)
                .setScale(1 / zoom)
                .setVisible(visible);
            if (square.input) square.input.enabled = visible;
        }
        this.scene.markDirty();
    };
}
