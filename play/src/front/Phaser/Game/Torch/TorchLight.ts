import type { PositionMessage_Direction } from "@workadventure/messages";
import { CHARACTER_BODY_HEIGHT, CHARACTER_BODY_OFFSET_Y } from "../../Entity/Character";
import { litPolygon, segmentsNearLight, type LightCone, type Point, type Segment } from "../Lamps/RgbLampGeometry";
import { obstacleSegments, type LightObstacles } from "../Lamps/RgbLampObstacles";
import { TORCH_RADIUS_TILES, torchFlamePose } from "./TorchProtocol";

/** Pulled back from a wall the flame reaches over, in map pixels: the light starts just on the avatar's side. */
const WALL_MARGIN_PX = 0.5;

/** Who holds a torch, and how. */
export interface TorchHolder {
    /** The position of the avatar (the centre of its sprite), in map pixels. */
    x: number;
    y: number;
    direction: PositionMessage_Direction;
    seated: boolean;
}

/**
 * The middle of the collision body of an avatar: it cannot stand in a wall, whereas the flame, held up in front of
 * the face, can reach over one when the avatar stands against it.
 */
export function torchAnchor(position: { x: number; y: number }): Point {
    // The container is the size of the body, centred on the position: its top is half a body above, the collision body
    // starts CHARACTER_BODY_OFFSET_Y lower, and its middle half a body lower again.
    const top = position.y - CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_Y;
    return { x: position.x, y: top + CHARACTER_BODY_HEIGHT / 2 };
}

/**
 * Where the light starts: the flame, unless something stops the light between the body and the flame. It then starts
 * just before the first such obstacle, on the body's side: a torch never lights the other side of a wall.
 */
export function torchLightOrigin(anchor: Point, flame: Point, segments: readonly Segment[]): Point {
    const dx = flame.x - anchor.x;
    const dy = flame.y - anchor.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
        return { ...flame };
    }
    let first = 1;
    for (const segment of segments) {
        const ex = segment.bx - segment.ax;
        const ey = segment.by - segment.ay;
        const cross = dx * ey - dy * ex;
        if (Math.abs(cross) < 1e-12) {
            continue;
        }
        const ox = segment.ax - anchor.x;
        const oy = segment.ay - anchor.y;
        const alongPath = (ox * ey - oy * ex) / cross;
        const alongSegment = (ox * dy - oy * dx) / cross;
        if (alongPath >= 0 && alongPath < first && alongSegment >= 0 && alongSegment <= 1) {
            first = alongPath;
        }
    }
    if (first === 1) {
        return { ...flame };
    }
    const back = Math.max(0, first - WALL_MARGIN_PX / length);
    return { x: anchor.x + dx * back, y: anchor.y + dy * back };
}

/** The light of a torch, the polygon it reaches (shadows included), and the segments that stop it. */
export function torchLightShape(
    holder: TorchHolder,
    obstacles: LightObstacles,
): { light: LightCone; polygon: Point[]; segments: Segment[] } {
    const pose = torchFlamePose(holder.direction, holder.seated);
    const flame = { x: holder.x + pose.x, y: holder.y + pose.y };
    const anchor = torchAnchor(holder);
    const radius = TORCH_RADIUS_TILES * obstacles.tileSize;
    // Read around the body, which stands in no wall: the cell or tall object the flame may reach into is kept.
    const segments = obstacleSegments(
        { x: anchor.x, y: anchor.y, radius: radius + Math.hypot(flame.x - anchor.x, flame.y - anchor.y) },
        obstacles,
    );
    const origin = torchLightOrigin(anchor, flame, segments);
    const light = { x: origin.x, y: origin.y, radius, direction: 90, angle: 360 };
    const near = segmentsNearLight(segments, light);
    return { light, polygon: litPolygon(light, near), segments: near };
}
