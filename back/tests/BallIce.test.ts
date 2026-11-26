import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroundCommand, GroundPort, GroundTold } from "../src/Model/Ground/GroundProtocol";
import type { GroundThreads } from "../src/Model/Ground/GroundThreads";
import { HostedGround } from "../src/Model/Ground/HostedGround";
import { CatastropheManager } from "../src/Model/CatastropheManager";
import { InlineRoomGround } from "../src/Model/Ground/InlineRoomGround";
import { RemoteRoomGround } from "../src/Model/Ground/RemoteRoomGround";
import type { RoomGround } from "../src/Model/Ground/RoomGround";
import { groundWam, GROUND_NOW, GROUND_SEED, happenAt, world } from "./helpers/GroundScenario";

/** A thread that is none: the commands are copied as a thread copies them and handled later, in their order. */
function loopback(): Pick<GroundThreads, "assign"> {
    return {
        assign: () => {
            let hosted: HostedGround | undefined;
            let listener: ((told: GroundTold) => void) | undefined;
            let last = Promise.resolve();
            const port: GroundPort = {
                post: (command: GroundCommand) => {
                    const copy = structuredClone(command);
                    last = last.then(async () => {
                        if (copy.kind === "open") {
                            hosted = new HostedGround(copy.room, copy, (told) => {
                                const back = structuredClone(told);
                                last = last.then(() => listener?.(back));
                            });
                            return;
                        }
                        await hosted?.handle(copy);
                    });
                },
                listen: (_room, told) => {
                    listener = told;
                },
                forget: () => {
                    listener = undefined;
                },
            };
            return { room: 1, port };
        },
    };
}

/** The tiles of the 24 × 24 tiles of the scenario that hold ice, thickest first. */
function icyTiles(ground: RoomGround): { tileX: number; tileY: number; mm: number }[] {
    const tiles: { tileX: number; tileY: number; mm: number }[] = [];
    for (let tile = 0; tile < 24 * 24; tile++) {
        const tileX = tile % 24;
        const tileY = Math.floor(tile / 24);
        const mm = ground.iceAt(tileX, tileY);
        if (mm > 0) tiles.push({ tileX, tileY, mm });
    }
    return tiles.sort((a, b) => b.mm - a.mm);
}

/** Lives the scenario up to the cold snap that froze the pond, one tenth of a second after the other. */
async function frozenPond(
    ground: RoomGround,
    state: ReturnType<typeof world>["state"],
    advance: (tenth: number) => Promise<void>,
): Promise<void> {
    for (let tenth = 0; tenth <= 800; tenth++) {
        happenAt(tenth, ground, state, []);
        // eslint-disable-next-line no-await-in-loop
        await advance(tenth);
    }
}

describe("a ball dragged over the ice of the ground of a room", () => {
    beforeEach(() => {
        // The steps of a ground computed elsewhere are made by hand: only its clock is faked.
        vi.useFakeTimers({
            now: GROUND_NOW,
            toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
        });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const grounds: [
        string,
        (inputs: ReturnType<typeof world>["inputs"]) => {
            ground: RoomGround;
            advance: (tenth: number) => Promise<void>;
        },
    ][] = [
        [
            "on the thread of the rooms",
            (inputs) => ({
                ground: new InlineRoomGround(inputs),
                advance: async () => {
                    await vi.advanceTimersByTimeAsync(100);
                },
            }),
        ],
        [
            "computed elsewhere, its steps made by hand",
            (inputs) => {
                const ground = new RemoteRoomGround(inputs, loopback(), { seed: GROUND_SEED });
                return {
                    ground,
                    advance: async (tenth) => {
                        vi.setSystemTime(GROUND_NOW + tenth * 100);
                        await ground.stepByHand(1, tenth % 20 === 0 ? 1 : 0);
                    },
                };
            },
        ],
    ];

    for (const [name, make] of grounds) {
        it(`breaks the ice of the disc it cuts in the surface, along its way, ground ${name}`, async () => {
            const room = world(groundWam());
            const { ground, advance } = make(room.inputs);
            await ground.startWater();
            await ground.startMeadow();
            await frozenPond(ground, room.state, advance);
            const icy = icyTiles(ground);
            const thickest = icy[0];
            expect(thickest, "the cold snap froze the pond").toBeDefined();
            const manager = new CatastropheManager(
                room.inputs.room,
                () => ({ width: 768, height: 768 }),
                () => undefined,
            );
            manager.breakIceWith(ground.shatter.bind(ground));
            // A ball of 2 tiles (a tile of radius) dragged over the ice, a tile at each message.
            const x = thickest.tileX * 32 + 16;
            const y = thickest.tileY * 32 + 16;
            const way = [0, 1, 2].map((step) => ({ x: x + step * 32, y }));
            const touched = icy.filter((tile) =>
                way.some(
                    (at) => (tile.tileX - Math.floor(at.x / 32)) ** 2 + (tile.tileY - Math.floor(at.y / 32)) ** 2 <= 1,
                ),
            );
            expect(touched.length).toBeGreaterThan(0);
            let tenth = 801;
            for (const at of way) {
                manager.ball(7, at.x, at.y, 2);
                // eslint-disable-next-line no-await-in-loop
                await advance(tenth++);
            }
            // The meadow tells the room at its next step (every two seconds).
            for (let more = 0; more < (name.startsWith("computed") ? 25 : 0); more++) {
                // eslint-disable-next-line no-await-in-loop
                await advance(tenth++);
            }
            for (const tile of touched) {
                // What took again in the two seconds since is a film, not the sheet.
                expect(ground.iceAt(tile.tileX, tile.tileY), `ice of ${tile.tileX},${tile.tileY}`).toBeLessThan(
                    tile.mm / 2,
                );
            }
            ground.stop();
        }, 60_000);
    }
});
