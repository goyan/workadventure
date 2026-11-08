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
    destroy(): void;
}

export interface SeasonalDecorDeps {
    isOutdoor: (x: number, y: number) => boolean;
    readPixels: (entity: SnowEntity) => AlphaMask | undefined;
}
