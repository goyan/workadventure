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

describe("JungleCompanionFollower on raised floors", () => {
    /** The master walks 200 px on the ground, climbs a stair 64 px long up to 52 px, then walks on that floor. */
    function masterAt(travelled: number): Point {
        const z = Math.min(52, Math.max(0, ((travelled - 200) / 64) * 52));
        return z > 0 ? { x: travelled, y: 0, z } : { x: travelled, y: 0 };
    }

    it("climbs the stairs its master climbed: at each place of the way, the altitude its master had there", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        let nowMs = 0;
        let onStair = 0;
        let last = follower.poseAt(nowMs, masterAt(0), true);
        for (let travelled = 4; travelled <= 500; travelled += 4) {
            nowMs += FRAME_MS;
            last = follower.poseAt(nowMs, masterAt(travelled), true);
            const expected = masterAt(last.x).z ?? 0;
            expect(Math.abs((last.z ?? 0) - expected)).toBeLessThan(4);
            if (last.x > 210 && last.x < 254) onStair++;
        }
        expect(onStair).toBeGreaterThan(3);
        // Arrived two tiles behind its master, on the same floor.
        const settled = wait(follower, masterAt(500), nowMs, 2000);
        expect(settled.z).toBe(52);
    });

    it("stays on the ground behind a master on the ground: no altitude in its pose", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        const { nowMs } = walk(
            follower,
            [
                { x: 0, y: 0 },
                { x: 150, y: 0 },
            ],
            0,
        );
        expect(wait(follower, { x: 150, y: 0 }, nowMs, 1000).z).toBeUndefined();
    });

    it("jumps onto the floor of a master who went far away at once", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        const pose = follower.poseAt(16, { x: COMPANION_TELEPORT_PX + 100, y: 0, z: 52 }, true);
        expect(pose.z).toBe(52);
    });
});

describe("JungleCompanionFollower and a master who flies", () => {
    /** A companion settled two tiles behind a master standing at (200, 0). */
    function settled() {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        const { nowMs } = walk(
            follower,
            [
                { x: 0, y: 0 },
                { x: 200, y: 0 },
            ],
            0,
        );
        const pose = wait(follower, { x: 200, y: 0 }, nowMs, 1000);
        return { follower, nowMs: nowMs + 1000, place: { x: pose.x, y: pose.y } };
    }

    /** The master flies along `points`; the poses of the companion meanwhile. */
    function fly(follower: JungleCompanionFollower, points: Point[], startMs: number) {
        const poses = [];
        let nowMs = startMs;
        for (const master of points) {
            nowMs += FRAME_MS;
            poses.push(follower.poseAt(nowMs, master, true, 0, true));
        }
        return { poses, nowMs };
    }

    const flight = (from: number, to: number): Point[] =>
        Array.from({ length: (to - from) / 20 + 1 }, (_, i) => ({ x: from + i * 20, y: -300 }));

    it("stays on the ground where it was while its master flies, however far: no walk, no jump", () => {
        const { follower, nowMs, place } = settled();
        const { poses } = fly(follower, flight(200, 200 + 3 * COMPANION_TELEPORT_PX), nowMs);
        for (const pose of poses) {
            expect(pose.moving).toBe(false);
            expect(Math.hypot(pose.x - place.x, pose.y - place.y)).toBeLessThan(1);
            expect(pose.z).toBeUndefined();
        }
        // Resting since the take-off: the time of its rest goes on (it sits, then lies down).
        expect(poses.at(-1)?.pausedMs).toBeGreaterThan(poses[0].pausedMs);
    });

    it("stops at once when its master takes off, instead of finishing the way to them", () => {
        const follower = new JungleCompanionFollower({ x: 0, y: 0 }, 0);
        // Far behind a master who ran: it has a long way left when they take off.
        const { nowMs } = walk(
            follower,
            [
                { x: 0, y: 0 },
                { x: 300, y: 0 },
            ],
            0,
        );
        const before = follower.poseAt(nowMs + FRAME_MS, { x: 300, y: 0 }, true, 0, true);
        const { poses } = fly(follower, flight(300, 700), nowMs + FRAME_MS);
        expect(Math.hypot((poses.at(-1)?.x ?? 0) - before.x, (poses.at(-1)?.y ?? 0) - before.y)).toBeLessThan(1);
    });

    it("waits after the landing until a way on the ground is given, then walks it without a jump", () => {
        const { follower, nowMs, place } = settled();
        const landed = { x: 200 + 3 * COMPANION_TELEPORT_PX, y: 0 };
        let now = fly(follower, flight(200, landed.x), nowMs).nowMs;
        // Landed far away: it still waits, and tells from where a way is needed.
        const waiting = follower.poseAt(now + FRAME_MS, landed, true);
        expect(waiting.moving).toBe(false);
        expect(Math.hypot(waiting.x - place.x, waiting.y - place.y)).toBeLessThan(1);
        expect(follower.waitingPlace()).toBeDefined();
        // The way goes round a wall: by (400, 200).
        follower.rejoin([{ x: 400, y: 200 }, landed]);
        expect(follower.waitingPlace()).toBeUndefined();
        let previous = waiting;
        let lowest = 0;
        now += FRAME_MS;
        for (let t = 0; t < 8000; t += FRAME_MS) {
            now += FRAME_MS;
            const pose = follower.poseAt(now, landed, true);
            // Never faster than a run: no jump to its master.
            expect(Math.hypot(pose.x - previous.x, pose.y - previous.y)).toBeLessThan(16);
            lowest = Math.max(lowest, pose.y);
            previous = pose;
        }
        expect(lowest).toBeGreaterThan(150);
        expect(Math.hypot(previous.x - landed.x, previous.y - landed.y)).toBeLessThan(COMPANION_FOLLOW_PX + 2);
        expect(previous.moving).toBe(false);
    });

    it("looks for its way back every two seconds, until there is one", async () => {
        const { follower, nowMs } = settled();
        const landed = { x: 900, y: 0 };
        const now = fly(follower, flight(200, 900), nowMs).nowMs + FRAME_MS;
        follower.poseAt(now, landed, true);
        const asked: Point[][] = [];
        let answer: Point[] = [];
        const findPath = (from: Point, to: Point): Promise<Point[]> => {
            asked.push([from, to]);
            return Promise.resolve(answer);
        };
        follower.seekWayBack(now, landed, findPath);
        follower.seekWayBack(now + 500, landed, findPath);
        await Promise.resolve();
        await Promise.resolve();
        // No way (an island): asked once, still waiting.
        expect(asked).toHaveLength(1);
        expect(asked[0][1]).toEqual(landed);
        expect(follower.waitingPlace()).toBeDefined();
        follower.seekWayBack(now + 1900, landed, findPath);
        expect(asked).toHaveLength(1);
        answer = [landed];
        follower.seekWayBack(now + 2000, landed, findPath);
        await Promise.resolve();
        await Promise.resolve();
        expect(asked).toHaveLength(2);
        expect(follower.waitingPlace()).toBeUndefined();
        // Following again: nothing more is asked.
        follower.seekWayBack(now + 9000, landed, findPath);
        expect(asked).toHaveLength(2);
    });

    it("a way found while its master took off again is dropped", async () => {
        const { follower, nowMs } = settled();
        const landed = { x: 900, y: 0 };
        const now = fly(follower, flight(200, 900), nowMs).nowMs + FRAME_MS;
        follower.poseAt(now, landed, true);
        follower.seekWayBack(now, landed, () => Promise.resolve([landed]));
        // Off again before the answer.
        follower.poseAt(now + FRAME_MS, landed, true, 0, true);
        await Promise.resolve();
        await Promise.resolve();
        expect(follower.poseAt(now + 2 * FRAME_MS, landed, true).moving).toBe(false);
        expect(follower.waitingPlace()).toBeDefined();
    });
});
