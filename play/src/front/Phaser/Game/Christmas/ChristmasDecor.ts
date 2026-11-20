import type { SeasonalDecor, SeasonalDecorDeps } from "../Seasonal/SeasonalDecor";
import type { OutdoorGrid } from "../Outdoor/OutdoorGrid";
import type { WalkerSample } from "./FootprintTrail";
import { SnowCaps, type SnowEntity } from "./SnowCaps";

/**
 * Winter outdoors (the theme once called Christmas): snow on top of objects. The snow on the ground is drawn by the
 * terrain (ReliefTiles) in the season of the theme, and the footprints all the year (Terrain/Footprints.ts).
 */
export class ChristmasDecor implements SeasonalDecor {
    private readonly caps: SnowCaps;

    constructor(scene: Phaser.Scene, deps: SeasonalDecorDeps) {
        this.caps = new SnowCaps(scene, deps.readPixels);
    }

    redrawGround(_grid: OutdoorGrid): void {
        // The snowy ground is the terrain's (ReliefTiles).
    }

    rebuildObjects(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void {
        this.caps.rebuild(entities, grid);
    }

    update(_time: number, _walkers: WalkerSample[]): boolean {
        // The footprints are the terrain's, all the year (Terrain/Footprints.ts).
        return false;
    }

    setVisible(visible: boolean): void {
        this.caps.setVisible(visible);
    }

    setAlpha(alpha: number): void {
        this.caps.setAlpha(alpha);
    }

    destroy(): void {
        this.caps.destroy();
    }
}
