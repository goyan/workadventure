export interface BodyBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SpriteTransform {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    displayOriginX: number;
    displayOriginY: number;
}

interface BodyShape {
    width: number;
    height: number;
    offset: { x: number; y: number };
}

/**
 * The box of an Arcade body, from the transform of its game object (the formula of Arcade.Body.updateBounds). The
 * physics only steps while something moves (DirtyScene): an avatar placed by code (spawn, teleport, slide, seat) and
 * standing still keeps the body where it was last synced. Its position must not be read from `body.x/y` then.
 */
export function bodyBoxFromSprite(sprite: SpriteTransform, body: BodyShape): BodyBox {
    return {
        x: sprite.x + sprite.scaleX * (body.offset.x - sprite.displayOriginX),
        y: sprite.y + sprite.scaleY * (body.offset.y - sprite.displayOriginY),
        width: body.width,
        height: body.height,
    };
}
