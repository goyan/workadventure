import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { MapListService } from "../map-storage/src/Services/MapListService.ts";

// Synthetic workload: measure retained completed reads while the final read remains pending.
assert.equal(typeof global.gc, "function", "Run Node with --expose-gc");
const count = 80;
const payload = JSON.stringify({
  version: "1.0.0",
  mapUrl: "map.tmj",
  entityCollections: [],
  entities: {},
  areas: Array.from({ length: 2000 }, (_, index) => ({
    id: String(index),
    name: `Area ${index}${" ".repeat(1000)}`,
    x: index,
    y: 0,
    width: 32,
    height: 32,
    visible: true,
    properties: [],
  })),
});
await setImmediate();
global.gc();
const start = process.memoryUsage().heapUsed;
let reads = 0;
let held = 0;
const catalogue = new MapListService(
  {
    listFiles: async () =>
      Array.from({ length: count }, (_, index) => `map-${index}.wam`),
    readFileAsString: async () => {
      if (++reads === count) {
        await setImmediate();
        global.gc();
        held = process.memoryUsage().heapUsed;
      }
      return payload;
    },
    writeStringAsFile: async (_path, content) => {
      assert.equal(Object.keys(JSON.parse(content).maps).length, count);
    },
  },
  { callWebHook: () => {} },
);
await catalogue.generateCacheFile("world");
process.stdout.write(
  `${JSON.stringify({
    maps: count,
    areasPerMap: 2000,
    startHeapMiB: start / 1024 / 1024,
    heldHeapMiB: held / 1024 / 1024,
    retainedHeapMiB: (held - start) / 1024 / 1024,
  })}\n`,
);
