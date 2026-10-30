import type { GameScene } from "../GameScene";

export function isPointerInsideCanvas(
    scene: Pick<GameScene, "game" | "scale">,
    pointer: Phaser.Input.Pointer,
): boolean {
    if (pointer.event instanceof MouseEvent) {
        const bounds = scene.game.canvas.getBoundingClientRect();
        return (
            pointer.event.clientX >= bounds.left &&
            pointer.event.clientX < bounds.right &&
            pointer.event.clientY >= bounds.top &&
            pointer.event.clientY < bounds.bottom
        );
    }

    return pointer.x >= 0 && pointer.y >= 0 && pointer.x < scene.scale.width && pointer.y < scene.scale.height;
}
