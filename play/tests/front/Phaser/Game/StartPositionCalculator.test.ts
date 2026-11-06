import { describe, expect, it, vi } from "vitest";
import type { AreaData, WAMFileFormat } from "@workadventure/map-editor";
import { GameMapAreas } from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { computeStartPosition } from "../../../../src/front/Phaser/Game/StartPositionCalculator";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";

vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "me" }) },
}));

const lobby: AreaData = {
    id: "lobby",
    name: "lobby",
    x: 0,
    y: 0,
    width: 96,
    height: 96,
    visible: true,
    properties: [{ id: "lobby-start", type: "start", isDefault: true }],
};

// The reported setup: a restricted area that is also a "Use if URL contains #class5b" start area.
const class5b: AreaData = {
    id: "class5b",
    name: "class5b",
    x: 200,
    y: 200,
    width: 160,
    height: 160,
    visible: true,
    properties: [
        { id: "class5b-start", type: "start", isDefault: false },
        { id: "class5b-rights", type: "restrictedRightsPropertyData", writeTags: ["teacher"], readTags: ["class5b"] },
    ],
};

const mapFile = { width: 20, height: 20, tilewidth: 32, tileheight: 32 } as ITiledMap;

function computeStartPositionFor(areas: AreaData[], userTags: string[], startPositionName?: string) {
    const gameMapAreas = new GameMapAreas({ areas } as unknown as WAMFileFormat);
    const gameMapFrontWrapper = {
        getAreaByName: (name: string) => gameMapAreas.getAreaByName(name),
        getAreas: () => gameMapAreas.getAreas(),
        dynamicAreas: new Map(),
        getFlatLayers: () => [],
        hasStartTile: () => false,
    } as unknown as GameMapFrontWrapper;
    const isPositionAllowed = (position: { x: number; y: number }) =>
        gameMapAreas.getForbiddenAreasOnPosition(position, userTags).length === 0;

    return {
        position: computeStartPosition(gameMapFrontWrapper, mapFile, undefined, startPositionName, isPositionAllowed),
        isPositionAllowed,
        isInside: (position: { x: number; y: number }, areaId: string) =>
            gameMapAreas.isPlayerInsideArea(areaId, position),
    };
}

describe("computeStartPosition", () => {
    it("keeps the last position instead of a personal desk or default start", () => {
        const position = { x: 400, y: 336 };
        const getGameMap = vi.fn();
        const wrapper = { getGameMap, getAreas: vi.fn() } as unknown as GameMapFrontWrapper;
        expect(computeStartPosition(wrapper, mapFile, position, undefined, () => true)).toEqual(position);
        expect(getGameMap).not.toHaveBeenCalled();
    });

    it("uses the default start instead of a personal desk without a last position", () => {
        const desk = { x: 400, y: 400, width: 64, height: 64 };
        const wrapper = {
            getAreas: () => new Map([[lobby.id, lobby]]),
            getGameMap: () => ({ getWamFile: () => ({ getGameMapAreas: () => ({ findPersonalArea: () => desk }) }) }),
        } as unknown as GameMapFrontWrapper;
        const position = computeStartPosition(wrapper, mapFile, undefined, undefined, () => true);
        expect(position.x).toBeLessThanOrEqual(lobby.width);
        expect(position.y).toBeLessThanOrEqual(lobby.height);
    });

    it("falls back to a start area when a saved position is outside the updated map", () => {
        const wrapper = { getAreas: () => new Map([[lobby.id, lobby]]) } as unknown as GameMapFrontWrapper;
        const position = computeStartPosition(wrapper, mapFile, { x: 10000, y: 336 }, undefined, () => true);
        expect(position.x).toBeLessThanOrEqual(lobby.width);
        expect(position.y).toBeLessThanOrEqual(lobby.height);
    });

    it("spawns in the start area named in the URL when the user has access to it", () => {
        const { position, isInside } = computeStartPositionFor([lobby, class5b], ["class5b"], "class5b");

        expect(isInside(position, "class5b")).toBe(true);
    });

    it("falls back to the default start area when the user has no access to the start area named in the URL", () => {
        for (let i = 0; i < 20; i++) {
            const { position, isPositionAllowed, isInside } = computeStartPositionFor([lobby, class5b], [], "class5b");

            expect(isInside(position, "class5b")).toBe(false);
            expect(isPositionAllowed(position)).toBe(true);
            expect(position.x).toBeGreaterThanOrEqual(lobby.x);
            expect(position.x).toBeLessThanOrEqual(lobby.x + lobby.width);
            expect(position.y).toBeGreaterThanOrEqual(lobby.y);
            expect(position.y).toBeLessThanOrEqual(lobby.y + lobby.height);
        }
    });

    it("keeps the forbidden start position when the map has no other one", () => {
        const { position, isInside } = computeStartPositionFor([class5b], [], "class5b");

        expect(isInside(position, "class5b")).toBe(true);
    });
});
