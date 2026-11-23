import { setWaterKernel, waterKernelInUse, waterKernelNamed } from "@workadventure/map-editor";
import { WATER_KERNEL } from "../../Enum/EnvironmentVariable";

/**
 * The kernel that computes the water of the rooms of this server, as WATER_KERNEL says (the TypeScript one when it
 * says nothing): set once, when the first room is made. The threads that compute the ground of the rooms away from
 * the thread of the rooms read the same variable (GroundWorker).
 */
setWaterKernel(waterKernelNamed(WATER_KERNEL));
const inUse = waterKernelInUse();
console.info(
    inUse.kernel === "wasm"
        ? "The water of the rooms is computed by the WebAssembly kernel (WATER_KERNEL)"
        : inUse.fallback === undefined
          ? "The water of the rooms is computed by the TypeScript kernel"
          : `The water of the rooms is computed by the TypeScript kernel: the WebAssembly one could not be loaded (${inUse.fallback})`,
);
