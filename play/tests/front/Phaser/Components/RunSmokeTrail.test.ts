import * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import { RunSmokeTrail } from "../../../../src/front/Phaser/Components/RunSmokeTrail";
import { ON_A_FLOOR } from "../../../../src/front/Phaser/Game/Terrain/AvatarDrop";

function setup(): { emit: RunSmokeTrail; made: ReturnType<typeof vi.fn>; dropAt: ReturnType<typeof vi.fn> } {
    const puff = {
        y: 0,
        scale: 1,
        setDepth: () => puff,
        setAlpha: () => puff,
        setScale: () => puff,
    };
    const made = vi.fn(() => puff);
    const dropAt = vi.fn((_x: number, y: number) => -y / 2);
    const scene = {
        time: { now: 100 },
        textures: { exists: () => true },
        add: { image: made },
        tweens: { add: vi.fn() },
        groundDropAt: dropAt,
    } as unknown as GameScene;
    return { emit: new RunSmokeTrail(scene), made, dropAt };
}

describe("sprint smoke on relief", () => {
    it.each([
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
    ])("projects puffs behind a diagonal runner (%s, %s)", (dx, dy) => {
        const random = vi.spyOn(Phaser.Math, "FloatBetween").mockReturnValue(0);
        try {
            const { emit, made, dropAt } = setup();
            emit.emit(100, 200, dx, dy, 183, 0);
            const x = 100 - (dx * 8) / Math.SQRT2;
            const y = 200 - (dy * 8) / Math.SQRT2;
            expect(dropAt).toHaveBeenCalledWith(x, y);
            expect(made).toHaveBeenCalledWith(x, y / 2, "run-smoke-puff");
        } finally {
            random.mockRestore();
        }
    });

    it("keeps smoke on a raised floor above the relief", () => {
        const random = vi.spyOn(Phaser.Math, "FloatBetween").mockReturnValue(0);
        try {
            const { emit, made, dropAt } = setup();
            emit.emit(100, 200, 1, 0, 183, ON_A_FLOOR);
            expect(dropAt).not.toHaveBeenCalled();
            expect(made).toHaveBeenCalledWith(92, 200, "run-smoke-puff");
        } finally {
            random.mockRestore();
        }
    });
});
