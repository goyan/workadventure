import { shadowOffset } from "./SkyShadowGeometry";
import type { ShadowLight } from "./SkyShadowGeometry";

/** The part of an oval shadow that stays under the body, against the width of the body. */
const OVAL_BODY_SHARE = 0.3;
/** How wide an oval shadow is, against the width of the body. */
const OVAL_WIDTH_SHARE = 0.6;

/**
 * How the silhouette of something standing `height` map pixels high lies on the ground, as an image whose bottom
 * middle is at its feet: turned by `rotation` (radians, clockwise on the screen) so that its top points away from the
 * light, as the shadows of the walls and of the clouds do, and `stretch` times as long as it is high (the length of
 * the shadow, within the limits of the light). Undefined with the light at or under the horizon.
 */
export function fallenShadowPose(
    height: number,
    light: ShadowLight,
): { rotation: number; stretch: number } | undefined {
    const offset = shadowOffset(height, light);
    if (!offset || height <= 0) return undefined;
    // The top of an unturned image points to (0, -1); turned by r, to (sin r, -cos r).
    return { rotation: Math.atan2(offset.x, -offset.y), stretch: Math.hypot(offset.x, offset.y) / height };
}

/** Something that walks (an animal): its feet, and the size of its body, in map pixels. */
export interface OvalShadowBody {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The oval shadow of something that walks: an oval `length` long and `width` wide, centred on (x, y), turned by
 * `rotation` as fallenShadowPose; it starts a little under the body and reaches where the top of the body falls. A
 * small oval under the body with the light overhead. Undefined with the light at or under the horizon.
 */
export function ovalShadowPose(
    body: OvalShadowBody,
    light: ShadowLight,
): { x: number; y: number; rotation: number; length: number; width: number } | undefined {
    const offset = shadowOffset(body.height, light);
    if (!offset) return undefined;
    const reach = Math.hypot(offset.x, offset.y);
    const under = body.width * OVAL_BODY_SHARE;
    const length = reach + under;
    // From `under / 2` behind the feet to the end of the shadow: its middle is this far from the feet.
    const middle = length / 2 - under / 2;
    const along = reach > 0 ? { x: offset.x / reach, y: offset.y / reach } : { x: 0, y: -1 };
    return {
        x: body.x + along.x * middle,
        y: body.y + along.y * middle,
        rotation: Math.atan2(along.x, -along.y),
        length,
        width: body.width * OVAL_WIDTH_SHARE,
    };
}
