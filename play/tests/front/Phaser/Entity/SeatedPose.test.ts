import { PositionMessage_Direction } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { drawSeatedFrame } from "../../../../src/front/Phaser/Entity/SeatedPose";

describe("seated profile", () => {
    it.each([PositionMessage_Direction.LEFT, PositionMessage_Direction.RIGHT])(
        "keeps the head and torso intact facing %s and bends only below the hips",
        (direction) => {
            const context = mock<CanvasRenderingContext2D>();
            const image = mock<HTMLCanvasElement>();
            drawSeatedFrame(context, image, 32, 64, 0, direction);
            expect(context.drawImage.mock.calls[0]).toEqual([image, 32, 64, 32, 26, 0, 0, 32, 26]);
            expect(context.rotate.mock.calls).toHaveLength(0);
            expect(context.drawImage.mock.calls.slice(1).every((call) => Number(call[6]) >= 26)).toBe(true);
        },
    );
});
