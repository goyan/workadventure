import { tileSeed } from "./FlameShape";
import type { FlyingEmber } from "./TreeFireState";

/** A tree carries this many flames, by the width of its crown, and each is this many times a flame of the grass. */
export const TREE_MIN_FLAMES = 3;
export const TREE_MAX_FLAMES = 7;
const CROWN_PX_A_FLAME = 14;
const TREE_FLAME_SCALE: readonly [number, number] = [1.5, 2.5];
/** The crown of a tree is the top of its image, down to this share of its height; flames stand in its middle part. */
const CROWN_SHARE = 0.65;
const CROWN_TOP_SHARE = 0.25;
/** The flames at the top of the crown catch when the fire of the tree is this high: the fire climbs the tree. */
const TOP_CATCHES_AT = 0.8;
/** This many of the flames of a tree stand behind it: the tree seems to burn through. */
const FLAMES_BEHIND = 2;
/** An ember rises this share of its flight over the straight line, 160 map pixels at most. */
const EMBER_ARC_SHARE = 0.3;
const EMBER_ARC_MAX_PX = 160;

/** The image of a tree on the map: its top left corner and its size, in map pixels. */
export interface TreeBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A flame of a tree: where its foot stands (map pixels), how big it is, when it catches, on which side of the tree. */
export interface TreeFlame {
    x: number;
    y: number;
    scale: number;
    /** The fire of the tree from which this flame burns, from 0 to TOP_CATCHES_AT. */
    catchesAt: number;
    behind: boolean;
    /** Its own time, from 0 to 1: it does not move with its neighbours. */
    seed: number;
}

/** A stable number from 0 to 1 for a tree and one of its flames. */
function draw(seed: number, flame: number, salt: number): number {
    return tileSeed(Math.floor(seed * 100003) + flame * 31, salt * 17 + flame);
}

/**
 * The flames of a tree on fire, always the same for a tree (`seed`, 0 to 1): spread over its crown, bigger than the
 * flames of the grass, the lower ones catching first. Seen from `far`, one flame as wide as the crown.
 */
export function treeFlames(box: TreeBox, seed: number, far = false): TreeFlame[] {
    const crownHeight = box.height * CROWN_SHARE;
    if (far) {
        return [
            {
                x: box.x + box.width / 2,
                y: box.y + crownHeight * 0.6,
                scale: Math.max(TREE_FLAME_SCALE[0], Math.min(TREE_FLAME_SCALE[1] * 1.2, box.width / 32)),
                catchesAt: 0,
                behind: false,
                seed,
            },
        ];
    }
    const count = Math.max(TREE_MIN_FLAMES, Math.min(TREE_MAX_FLAMES, Math.round(box.width / CROWN_PX_A_FLAME)));
    const flames: TreeFlame[] = [];
    for (let flame = 0; flame < count; flame++) {
        // From the bottom of the crown to its top, each in its own column, a little off it.
        const up = count === 1 ? 0 : flame / (count - 1);
        const column = ((flame * 0.618034 + draw(seed, flame, 1)) % 1) - 0.5;
        // The crown is widest in its middle: the flames keep inside it.
        const reach = box.width * 0.42 * (1 - 0.6 * Math.abs(up - 0.4));
        flames.push({
            x: box.x + box.width / 2 + column * reach * 2 * 0.8,
            y: box.y + crownHeight * (1 - (1 - CROWN_TOP_SHARE) * up),
            scale: TREE_FLAME_SCALE[0] + (TREE_FLAME_SCALE[1] - TREE_FLAME_SCALE[0]) * draw(seed, flame, 2),
            catchesAt: TOP_CATCHES_AT * up,
            behind: flame % Math.ceil(count / FLAMES_BEHIND) === 1,
            seed: draw(seed, flame, 3),
        });
    }
    return flames;
}

/** How strong a flame of a tree burns for the fire of its tree (0 to 1): nothing until it catches, then it rises. */
export function treeFlameIntensity(flame: Pick<TreeFlame, "catchesAt">, fire: number): number {
    if (fire <= flame.catchesAt) return 0;
    return Math.min(1, (fire - flame.catchesAt) / (1 - TOP_CATCHES_AT));
}

/**
 * Where an ember is at `now` on its way (map pixels), and how far along it is (0 to 1): an arc from the tree to
 * where it falls. Undefined before it leaves and once it has landed.
 */
export function emberPoint(ember: FlyingEmber, now: number): { x: number; y: number; along: number } | undefined {
    const along = (now - ember.leftAt) / ember.flightMs;
    if (!(along >= 0) || along >= 1) return undefined;
    const far = Math.hypot(ember.toX - ember.fromX, ember.toY - ember.fromY);
    const lift = Math.min(EMBER_ARC_MAX_PX, far * EMBER_ARC_SHARE) * Math.sin(Math.PI * along);
    return {
        x: ember.fromX + (ember.toX - ember.fromX) * along,
        y: ember.fromY + (ember.toY - ember.fromY) * along - lift,
        along,
    };
}
