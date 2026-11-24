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

    it("holds a mass of cold air where the server says, at its temperature, until the server stops telling it", () => {
        const relay = new LocalCatastropheRelay();
        const cold = told({ id: 6, kind: CatastropheKind.CATASTROPHE_COLD, impactInMs: 1000, radiusTiles: 3 });
        relay.receive({ ...cold, temperature: -60 }, 0);
        expect(relay.due(1)).toEqual([
            {
                kind: "catastrophes",
                downpours: [],
                drains: [],
                balls: [],
                colds: [{ id: 6, x: 320, y: 160, radiusTiles: 3, temperature: -60 }],
            },
        ]);
        // Let go: the local ground is told there is none held; it keeps the mass while it warms, by itself.
        expect(relay.due(1001)).toEqual([{ kind: "catastrophes", downpours: [], drains: [], balls: [] }]);
        // The cold snap of the room is stopped: the local ground dispels its cold air too, held or not.
        relay.receive({ ...cold, temperature: -60 }, 2000);
        expect(relay.receive({ ...cold, id: 77, impactInMs: 0, radiusTiles: 0 }, 2100)).toEqual([{ kind: "calm" }]);
        expect(relay.state()).toEqual({ kind: "catastrophes", downpours: [], drains: [], balls: [] });
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

    it("gives the local ground the tsunami the server tells, once while it is told again, and lets it end", () => {
        // The clock of this browser is a minute behind that of the server: the sea is set on its own clock.
        const relay = new LocalCatastropheRelay(() => 1_000_000 - 60_000);
        const tsunami = { metres: 8, minutes: 3, startedAt: 1_000_000, durationMs: 180_000 };
        const wave = told({ id: 4, kind: CatastropheKind.CATASTROPHE_TSUNAMI, impactInMs: 240_000, tsunami });
        relay.receive(wave, 0);
        const going = { id: 4, startedAt: 1_000_000 - 60_000, metres: 8, durationMs: 180_000 };
        expect(relay.due(10)).toEqual([{ kind: "catastrophes", downpours: [], drains: [], balls: [], tsunami: going }]);
        // Told again a second later: nothing new for the local ground.
        relay.receive({ ...wave, impactInMs: 239_000 }, 1000);
        expect(relay.due(1010)).toEqual([]);
        // Stopped: the local ground loses it.
        relay.receive({ ...wave, impactInMs: 0 }, 2000);
        expect(relay.due(2010)).toEqual([{ kind: "catastrophes", downpours: [], drains: [], balls: [] }]);
    });
});
