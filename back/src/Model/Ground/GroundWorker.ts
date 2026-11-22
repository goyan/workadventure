import { parentPort } from "node:worker_threads";
import type { GroundCommand, GroundTold } from "./GroundProtocol";
import { HostedGround } from "./HostedGround";

/**
 * Entry point of a thread that computes the grounds of rooms (the water of their relief and their meadow), away from
 * the thread of the rooms: one HostedGround for each room it is given. The commands of a room are run one after the
 * other, in the order they were sent.
 */
const port = parentPort;
if (!port) throw new Error("GroundWorker runs in a worker thread only");

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
