import type { AlphaMask, SnowEntity } from "../Christmas/SnowCaps";
import type { WalkerSample } from "../Christmas/FootprintTrail";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";

/** What a seasonal theme draws outdoors. The manager decides when; the decor decides how. */
export interface SeasonalDecor {
    /** The outdoor cells changed (first draw, or a wall edited). */
    redrawGround(grid: OutdoorGrid): void;
    /** Objects were added, moved, or finished loading. */
    rebuildObjects(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void;
    /** Every frame; walkers is empty while editing. Returns true when the scene must redraw. */
    update(time: number, walkers: WalkerSample[]): boolean;
    setVisible(visible: boolean): void;
    /** Fades the whole decor (the map snow builds up and melts); 1 is fully shown. */
    setAlpha(alpha: number): void;
    destroy(): void;
}

/** The wind of the map and the date, as the leaves of autumn follow them. */
export interface LeafConditions {
    /** km/h, undefined without a real wind (a light breeze then). */
    windSpeed?: number;
    /** Where the wind comes from, degrees, 0 north; undefined without a real wind. */
    windFrom?: number;
    /** How far into autumn it is, 0 to 1. */
    progress: number;
}

export interface SeasonalDecorDeps {
    isOutdoor: (x: number, y: number) => boolean;
    readPixels: (entity: SnowEntity) => AlphaMask | undefined;
    /** Autumn: the wind and the date the leaves follow; without it a breeze at the end of autumn. */
    leafConditions?: () => LeafConditions;
    /** Whether a point is under water (the relief, a pool): nothing lies there. */
    isWet?: (x: number, y: number) => boolean;
    /** Changes when the water does. */
    waterVersion?: () => number;
}
