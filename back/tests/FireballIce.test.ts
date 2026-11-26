import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroundCommand, GroundPort, GroundTold } from "../src/Model/Ground/GroundProtocol";
import type { GroundThreads } from "../src/Model/Ground/GroundThreads";
import { HostedGround } from "../src/Model/Ground/HostedGround";
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

describe("a fireball on the ice of the ground of a room", () => {
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
        it(`melts the ice of its crater as a comet breaks it, ground ${name}`, async () => {
            const room = world(groundWam());
            const { ground, advance } = make(room.inputs);
            await ground.startWater();
            await ground.startMeadow();
            await frozenPond(ground, room.state, advance);
            const thickest = icyTiles(ground)[0];
            expect(thickest, "the cold snap froze the pond").toBeDefined();
            // The tile is 32 px wide; the crater is a tile and a half wide around the middle of the thickest ice.
            const x = thickest.tileX * 32 + 16;
            const y = thickest.tileY * 32 + 16;
            const crater = icyTiles(ground).filter(
                (tile) => (tile.tileX - thickest.tileX) ** 2 + (tile.tileY - thickest.tileY) ** 2 <= 4,
            );
            expect(crater.length).toBeGreaterThan(0);
            ground.burn(x, y, 2, 5);
            // The meadow tells the room at its next step (every two seconds).
            for (let tenth = 801; tenth < 830; tenth++) await advance(tenth);
            for (const tile of crater) {
                expect(ground.iceAt(tile.tileX, tile.tileY), `ice of the tile ${tile.tileX},${tile.tileY}`).toBe(0);
            }
            // Nor is it only the ground of the server that has it: the room is told the ice it left.
            const last = [...room.seen.told].reverse().find((told) => told.includes('"meadowMessage"'));
            const told = JSON.parse(last ?? "{}") as { message: { meadowMessage: { width: number; ice: string } } };
            const ice = new Uint8Array(gunzipSync(Buffer.from(told.message.meadowMessage.ice, "base64")));
            for (const tile of crater) {
                expect(
                    ice[tile.tileY * told.message.meadowMessage.width + tile.tileX],
                    `told ${tile.tileX},${tile.tileY}`,
                ).toBe(0);
            }
            ground.stop();
        }, 60_000);
    }
});
