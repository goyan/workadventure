import { ballRadiusPx } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { LocalCatastropheRelay } from "@wa/front/Phaser/Game/Terrain/LocalCatastropheRelay";

/** A message of the server, as the room tells it. */
const told = (message: Partial<CatastropheMessage> & Pick<CatastropheMessage, "kind">): CatastropheMessage => ({
    id: 1,
    x: 320,
    y: 160,
    impactInMs: 0,
    radiusTiles: 2,
    wholeMap: false,
    ...message,
});

describe("LocalCatastropheRelay", () => {
    it("strikes the local water when the meteor lands, not when it is launched", () => {
        const relay = new LocalCatastropheRelay();
        expect(relay.receive(told({ kind: CatastropheKind.CATASTROPHE_METEOR, impactInMs: 1500 }), 1000)).toEqual([]);
        expect(relay.due(2000)).toEqual([]);
        expect(relay.due(2500)).toEqual([{ kind: "strike", x: 320, y: 160, radiusTiles: 2 }]);
        expect(relay.due(3000)).toEqual([]);
    });

    it("burns where a fireball lands, with its id", () => {
        const relay = new LocalCatastropheRelay();
        relay.receive(told({ id: 7, kind: CatastropheKind.CATASTROPHE_FIREBALL, impactInMs: 100 }), 0);
        expect(relay.due(100)).toEqual([{ kind: "burn", x: 320, y: 160, radiusTiles: 2, id: 7 }]);
    });

    it("breaks the ice and sets the fire at once", () => {
        const relay = new LocalCatastropheRelay();
        expect(relay.receive(told({ kind: CatastropheKind.CATASTROPHE_ICE_BREAK, radiusTiles: 1 }), 0)).toEqual([
            { kind: "shatter", x: 320, y: 160, radiusTiles: 1 },
        ]);
        expect(relay.receive(told({ kind: CatastropheKind.CATASTROPHE_FIRE, impactInMs: 9000 }), 0)).toEqual([
            { kind: "ignite", x: 320, y: 160, radiusTiles: 2 },
        ]);
    });

    it("keeps a downpour falling while the server tells it, soaks the meadow at each word, and lets it end", () => {
        const relay = new LocalCatastropheRelay();
        const rain = told({ id: 3, kind: CatastropheKind.CATASTROPHE_DOWNPOUR, impactInMs: 2000, wholeMap: true });
        expect(relay.receive(rain, 0)).toEqual([
            { kind: "soak", downpour: { x: 320, y: 160, radiusTiles: 2, wholeMap: true } },
        ]);
        expect(relay.due(10)).toEqual([
            {
                kind: "catastrophes",
                downpours: [{ id: 3, x: 320, y: 160, radiusTiles: 2, wholeMap: true }],
                drains: [],
                balls: [],
            },
        ]);
        // Nothing changed: nothing told again.
        expect(relay.due(1000)).toEqual([]);
        expect(relay.due(2001)).toEqual([{ kind: "catastrophes", downpours: [], drains: [], balls: [] }]);
    });

    it("holds a drain and a ball where the server says, and lets the ball go at once", () => {
        const relay = new LocalCatastropheRelay();
        relay.receive(told({ id: 4, kind: CatastropheKind.CATASTROPHE_DRAIN, impactInMs: 2000, radiusTiles: 3 }), 0);
        relay.receive(told({ id: 5, kind: CatastropheKind.CATASTROPHE_BALL, impactInMs: 2000, radiusTiles: 4 }), 0);
        expect(relay.due(1)).toEqual([
            {
                kind: "catastrophes",
                downpours: [],
                drains: [{ id: 4, x: 320, y: 160, radiusTiles: 3 }],
                balls: [{ id: 5, x: 320, y: 160, radiusPx: ballRadiusPx(4) }],
            },
        ]);
        relay.receive(told({ id: 5, kind: CatastropheKind.CATASTROPHE_BALL, impactInMs: 0, radiusTiles: 4 }), 5);
        expect(relay.due(6)).toEqual([
            {
                kind: "catastrophes",
                downpours: [],
                drains: [{ id: 4, x: 320, y: 160, radiusTiles: 3 }],
                balls: [],
            },
        ]);
    });

    it("tells all that is going on to a local ground that starts", () => {
        const relay = new LocalCatastropheRelay();
        relay.receive(told({ id: 4, kind: CatastropheKind.CATASTROPHE_DRAIN, impactInMs: 2000 }), 0);
        relay.due(1);
        expect(relay.state()).toEqual({
            kind: "catastrophes",
            downpours: [],
            drains: [{ id: 4, x: 320, y: 160, radiusTiles: 2 }],
            balls: [],
        });
    });
});
