import { parentPort, workerData } from "node:worker_threads";
import {
    setWaterKernel,
    setWaterPassRunner,
    threadWaterLoads,
    WaterBandsLead,
    waterKernelInUse,
    waterKernelNamed,
} from "@workadventure/map-editor";
import { GroundBands } from "./GroundBands";
import type { GroundCommand, GroundTold } from "./GroundProtocol";
import { threadGroundTimings } from "./GroundTimings";
import { HostedGround } from "./HostedGround";

/**
 * The share of the time between two steps the waters of this thread may take together before they ease their
 * fineness. On the thread of the rooms it is half (the players wait behind the water); here no one waits, the water
 * only has to keep its pace, so it may take most of the thread, the rest being left to the meadows and to the memory
 * that is cleaned. Measured with rooms like the map of the entry, flooded: at 0.9 eight of them keep the fineness
 * their map asks for (86 % of a core, ten steps a second each); at 0.8 they give a level up.
 */
const GROUND_THREAD_SHARE = 0.9;
/** How often this thread tells how long its steps took (ms). */
const TIMINGS_TOLD_MS = 1000;

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
const asked = workerData as { bands?: number; patientBands?: number } | null;
const bands = Math.floor(Number(asked?.bands ?? 1));
let group: GroundBands | undefined;
if (bands > 1) {
    // For the tests that must see the threads of the bands at work whatever the machine does: one pass in
    // `patientBands`, this thread waits at its opening until a slice of it is claimed by another (five seconds at
    // most). Once none came, it never waits again: threads that do not start must not hold the water back, pass
    // after pass. Never asked for by the server.
    const every = Math.floor(Number(asked?.patientBands ?? 0));
    let passes = 0;
    let alone = false;
    const patient: WaterBandsLead | undefined =
        every > 0
            ? new WaterBandsLead(bands - 1, undefined, undefined, undefined, () => {
                  if (!alone && passes++ % every === 0) alone = patient?.waitForAClaim(5000) === false;
              })
            : undefined;
    group = new GroundBands(
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
        undefined,
        patient,
    );
    setWaterPassRunner(group);
}
// The kernel of the water of the server (ServerWaterKernel), read here from the environment this thread inherits:
// the variables of the server are checked on its own thread, not here. With bands, the arrays of the grids are in
// a memory the threads share, whatever computes their passes.
setWaterKernel(waterKernelNamed(process.env.WATER_KERNEL), bands > 1);
if (process.env.WATER_KERNEL === "wasm") {
    const inUse = waterKernelInUse();
    console.info(
        inUse.kernel === "wasm"
            ? "A thread of the ground computes its water with the WebAssembly kernel"
            : `A thread of the ground computes its water with the TypeScript kernel: the WebAssembly one could not be loaded (${inUse.fallback ?? "unknown"})`,
    );
}

const grounds = new Map<number, { ground: HostedGround; last: Promise<void> }>();

// How long the steps took, for the metrics of the server: once a second, while this thread has a room. What is not
// told meanwhile is kept: the next telling spans it.
let timings: ReturnType<typeof setInterval> | undefined;
function tellTimings(told: (told: GroundTold) => void): void {
    timings ??= setInterval(() => {
        if (grounds.size === 0) return;
        told({ kind: "timings", room: 0, batch: threadGroundTimings.take() });
    }, TIMINGS_TOLD_MS);
}

port.on("message", (command: GroundCommand) => {
    let hosted = grounds.get(command.room);
    if (command.kind === "open") {
        hosted = {
            ground: new HostedGround(command.room, command, (told: GroundTold) => port.postMessage(told)),
            last: Promise.resolve(),
        };
        grounds.set(command.room, hosted);
        tellTimings((told) => port.postMessage(told));
        return;
    }
    if (!hosted) return;
    const { ground } = hosted;
    // One after the other: the start of the water awaits what was saved, and nothing must overtake it.
    const shared = command.kind === "close" ? group : undefined;
    if (shared) {
        // How the passes of the waters were shared, for who started this thread: told before the room says it closed.
        hosted.last = hosted.last.then(() =>
            port.postMessage({ kind: "slices", room: 0, ...shared.computed() } satisfies GroundTold),
        );
    }
    hosted.last = hosted.last.then(() => ground.handle(command));
    if (command.kind === "close") grounds.delete(command.room);
});
