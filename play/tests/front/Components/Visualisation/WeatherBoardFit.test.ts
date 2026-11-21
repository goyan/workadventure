import { describe, expect, it } from "vitest";
import {
    BOARD_BOTTOM_MARGIN_PX,
    BOARD_MIN_HEIGHT_PX,
    weatherBoardFit,
} from "../../../../src/front/Components/Visualisation/WeatherBoardFit";

describe("weatherBoardFit", () => {
    it("keeps the board in its place, as high as the room left down to the bottom of the window", () => {
        // A tall window, the board under the clock line and the visualisation tiles only.
        expect(weatherBoardFit(1000, 120, 48)).toEqual({
            overlay: false,
            maxHeight: 1000 - 120 - BOARD_BOTTOM_MARGIN_PX,
        });
    });

    it("never lets the board go past the bottom of the window in its place", () => {
        for (const top of [100, 300, 500, 700]) {
            const fit = weatherBoardFit(950, top, 48);
            if (!fit.overlay) expect(top + fit.maxHeight).toBeLessThanOrEqual(950 - BOARD_BOTTOM_MARGIN_PX);
        }
    });

    it("lays the board over the panels under the clock line when too little room is left under them", () => {
        // The case reported: a window of 950 points, two weather cards and the disasters above the board.
        const fit = weatherBoardFit(950, 830, 48);
        expect(fit).toEqual({ overlay: true, top: 48, maxHeight: 950 - 48 - BOARD_BOTTOM_MARGIN_PX });
        if (fit.overlay) expect(fit.top + fit.maxHeight).toBeLessThanOrEqual(950);
    });

    it("chooses the overlay just under the least height, its place from it", () => {
        const limit = 950 - BOARD_MIN_HEIGHT_PX - BOARD_BOTTOM_MARGIN_PX;
        expect(weatherBoardFit(950, limit, 48).overlay).toBe(false);
        expect(weatherBoardFit(950, limit + 1, 48).overlay).toBe(true);
    });

    it("keeps a readable board on the smallest windows, starting at the top at worst", () => {
        expect(weatherBoardFit(150, 140, 60)).toEqual({ overlay: true, top: 60, maxHeight: 120 });
        expect(weatherBoardFit(800, 900, -20)).toMatchObject({ overlay: true, top: 0 });
    });
});
