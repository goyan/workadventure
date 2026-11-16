import { describe, expect, it } from "vitest";
import {
    COMPANION_FOLLOW_PX,
    COMPANION_SLOTS,
    COMPANION_TELEPORT_PX,
    JungleCompanionFollower,
} from "../../../../../src/front/Phaser/Game/Jungle/JungleCompanionFollow";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const FRAME_MS = 16;

/** The master walks along `points` at 4 px per frame; the follower is asked for its pose every frame. */
function walk(
    follower: JungleCompanionFollower,
    points: Point[],
    startMs: number,
    record: (point: Point) => boolean = () => true,
): { poses: Point[]; nowMs: number } {
    const poses: Point[] = [];
    let nowMs = startMs;
    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        for (let travelled = 4; travelled <= length; travelled += 4) {
            const master = {
                x: from.x + ((to.x - from.x) * travelled) / length,
                y: from.y + ((to.y - from.y) * travelled) / length,
            };
            nowMs += FRAME_MS;
            const pose = follower.poseAt(nowMs, master, record(master));
            poses.push({ x: pose.x, y: pose.y });
        }
    }
    return { poses, nowMs };
}

/** The master stands still at `master` for `ms`. */
function wait(follower: JungleCompanionFollower, master: Point, nowMs: number, ms: number, record = true) {
    let pose = follower.poseAt(nowMs, master, record);
    for (let t = FRAME_MS; t <= ms; t += FRAME_MS) pose = follower.poseAt(nowMs + t, master, record);
    return pose;
}

describe("JungleCompanionFollower", () => {
    it("five companions make a small group two tiles behind their master, side by side, without overlapping", () => {
        expect(COMPANION_SLOTS).toHaveLength(5);
        const followers = COMPANION_SLOTS.map(() => new JungleCompanionFollower({ x: 0, y: 0 }, 0));
        const master = { x: 0, y: 0 };
        let nowMs = 0;
        const poses = followers.map((follower, slot) => follower.poseAt(nowMs, master, true, slot));
        // The master walks right, along a wide street, then stops.
        for (let x = 4; x <= 400; x += 4) {
            nowMs += FRAME_MS;
            master.x = x;
            followers.forEach((follower, slot) => (poses[slot] = follower.poseAt(nowMs, master, true, slot)));
        }
        for (let t = 0; t < 4000; t += FRAME_MS) {
            nowMs += FRAME_MS;
            followers.forEach((follower, slot) => (poses[slot] = follower.poseAt(nowMs, master, true, slot)));
        }
        for (const pose of poses) {
            expect(pose.moving).toBe(false);
            // Behind the master, about two tiles away: between 1.5 and 4 tiles.
            expect(pose.x).toBeLessThan(400);
            const distance = Math.hypot(pose.x - 400, pose.y);
            expect(distance).toBeGreaterThanOrEqual(48);
            expect(distance).toBeLessThanOrEqual(128);
        }
        for (let a = 0; a < poses.length; a++) {
            for (let b = a + 1; b < poses.length; b++) {
                expect(Math.hypot(poses[a].x - poses[b].x, poses[a].y - poses[b].y)).toBeGreaterThanOrEqual(31.5);
            }
        }
        // The first one right behind, the next two on either side.
        expect(poses[0].x).toBeCloseTo(400 - COMPANION_FOLLOW_PX, 0);
        expect(poses[0].y).toBeCloseTo(0, 0);
        expect(Math.sign(poses[1].y)).toBe(-Math.sign(poses[2].y));
    });

    it("a master walking back to a companion of the group comes within a tile and a half of it", () => {
        for (const slot of [0, 3]) {
            const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
            const master = { x: 0, y: 0 };
            let nowMs = 0;
            let closest = Number.POSITIVE_INFINITY;
            const step = () => {
                nowMs += FRAME_MS;
                const pose = follower.poseAt(nowMs, master, true, slot);
                closest = Math.min(closest, Math.hypot(pose.x - master.x, pose.y - master.y));
            };
            for (; master.x < 300; master.x += 4) step();
            for (let t = 0; t < 3000; t += FRAME_MS) step();
            closest = Number.POSITIVE_INFINITY;
            // Back the way it came, at a walk.
            for (; master.x > 0; master.x -= 2) step();
            expect(closest).toBeLessThanOrEqual(48);
        }
    });

    it("stays where it is while its master is within two tiles", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        const pose = wait(follower, { x: 40, y: 0 }, 0, 1000);
        expect(pose).toMatchObject({ x: 0, y: 0, moving: false });
        expect(COMPANION_FOLLOW_PX).toBe(64);
    });

    it("walks the way its master went, two tiles behind, without cutting corners", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        // Down then right, around a corner: a straight line would go through the wall in the corner.
        const { poses, nowMs } = walk(
            follower,
            [
                { x: 0, y: 0 },
                { x: 0, y: 200 },
                { x: 200, y: 200 },
            ],
            0,
        );
        for (const pose of poses) {
            expect(pose.x < 0.5 || pose.y > 199.5).toBe(true);
        }
        const pose = wait(follower, { x: 200, y: 200 }, nowMs, 3000);
        expect(pose.moving).toBe(false);
        expect(pose.x).toBeCloseTo(200 - COMPANION_FOLLOW_PX, 0);
        expect(pose.y).toBeCloseTo(200, 0);
        expect(pose.direction).toBe("right");
    });

    it("walks with its walk animation and counts the pause once stopped", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        const moving = follower.poseAt(100, { x: 0, y: 200 }, true);
        expect(moving.moving).toBe(true);
        expect(moving.direction).toBe("down");
        expect(moving.pausedMs).toBe(0);
        const stopped = wait(follower, { x: 0, y: 200 }, 100, 5000);
        expect(stopped.moving).toBe(false);
        expect(stopped.pausedMs).toBeGreaterThan(1000);
    });

    it("jumps next to its master when it is more than ten tiles away (a teleport)", () => {
        expect(COMPANION_TELEPORT_PX).toBe(320);
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        const pose = follower.poseAt(16, { x: 1000, y: 0 }, true);
        expect(pose).toMatchObject({ x: 1000, y: 0, moving: false });
    });

    it("waits at the shore while its master swims", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        // The water starts at x = 150: those positions are not followed.
        const { nowMs } = walk(
            follower,
            [
                { x: 0, y: 0 },
                { x: 250, y: 0 },
            ],
            0,
            (point) => point.x < 150,
        );
        const pose = wait(follower, { x: 250, y: 0 }, nowMs, 3000, false);
        expect(pose.moving).toBe(false);
        expect(pose.x).toBeLessThan(150);
    });
});
