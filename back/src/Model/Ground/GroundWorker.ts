import { parentPort, workerData } from "node:worker_threads";
import { setWaterArrays, setWaterPassRunner, sharedWaterArrays, threadWaterLoads } from "@workadventure/map-editor";
import { GroundBands } from "./GroundBands";
import type { GroundCommand, GroundTold } from "./GroundProtocol";
import { HostedGround } from "./HostedGround";

/**
 * The share of the time between two steps the waters of this thread may take together before they ease their
 * fineness. On the thread of the rooms it is half (the players wait behind the water); here no one waits, the water
 * only has to keep its pace, so it may take most of the thread, the rest being left to the meadows and to the memory
 * that is cleaned. Measured with rooms like the map of the entry, flooded: at 0.9 eight of them keep the fineness
 * their map asks for (86 % of a core, ten steps a second each); at 0.8 they give a level up.
 */
const GROUND_THREAD_SHARE = 0.9;

/**
 * Entry point of a thread that computes the grounds of rooms (the water of their relief and their meadow), away from
 * the thread of the rooms: one HostedGround for each room it is given. The commands of a room are run one after the
 * other, in the order they were sent.
 */
// Nothing but grounds is computed here: their water may take most of the thread before it eases.
threadWaterLoads.mayTake(GROUND_THREAD_SHARE);

const port = parentPort;
if (!port) throw new Error("GroundWorker runs in a worker thread only");

// The bands of the water: threads that share with this one the passes of each move of its waters, when asked for.
const bands = Math.floor(Number((workerData as { bands?: number } | null)?.bands ?? 1));
if (bands > 1) {
    const group = new GroundBands(
        bands - 1,
        (reason, remaining) => {
            console.error(
                `A thread of the bands of the water was lost (${reason}): the water goes on with ${remaining + 1} band(s)`,
            );
            port.postMessage({ kind: "band", room: 0, reason, remaining } satisfies GroundTold);
        },
        (error) => {
            // A step half computed: this thread ends, and its rooms start again from the last copy of their water.
            console.error("A step of the water was lost to its bands: this thread of the grounds ends", error);
            setImmediate(() => {
                throw error;
            });
        },
    );
    setWaterArrays(sharedWaterArrays);
    setWaterPassRunner(group);
}

const grounds = new Map<number, { ground: HostedGround; last: Promise<void> }>();

port.on("message", (command: GroundCommand) => {
    let hosted = grounds.get(command.room);
    if (command.kind === "open") {
        hosted = {
            ground: new HostedGround(command.room, command, (told: GroundTold) => port.postMessage(told)),
            last: Promise.resolve(),
        };
        grounds.set(command.room, hosted);
        return;
    }
    if (!hosted) return;
    const { ground } = hosted;
    // One after the other: the start of the water awaits what was saved, and nothing must overtake it.
    hosted.last = hosted.last.then(() => ground.handle(command));
    if (command.kind === "close") grounds.delete(command.room);
});
