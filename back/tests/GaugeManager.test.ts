import { afterEach, describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { register } from "prom-client";
import type { Space } from "../src/Model/Space";
import { clientEventsEmitter } from "../src/Services/ClientEventsEmitter";
import { gaugeManager } from "../src/Services/GaugeManager";

const spaces = new Set<Space>();
function publish(name: string, world: string, publishers: number, watchers: number): Space {
    const space = mock<Space>({ name, world, nbPublishers: publishers, nbWatchers: watchers });
    spaces.add(space);
    clientEventsEmitter.spaceUpdatedSubject.next(space);
    return space;
}

afterEach(() => {
    for (const space of spaces) clientEventsEmitter.deleteSpaceSubject.next(space);
    spaces.clear();
    register.resetMetrics();
});

describe("space metrics lifecycle", () => {
    it("releases transient space statistics and metric labels after churn", async () => {
        for (let index = 0; index < 1000; index++) {
            const space = publish(`world-${index}.bubble`, `world-${index}`, 2, 1);
            clientEventsEmitter.deleteSpaceSubject.next(space);
            spaces.delete(space);
        }
        expect(gaugeManager).toHaveProperty("worldStats.size", 0);
        expect(gaugeManager).toHaveProperty("spaceStats.size", 0);
        expect((await register.getSingleMetric("workadventure_nb_publishers_per_space")?.get())?.values).toEqual([]);
        expect((await register.getSingleMetric("workadventure_nb_watchers_per_world")?.get())?.values).toEqual([]);
    });

    it("keeps the total of the remaining spaces when one space becomes empty or is deleted", async () => {
        const first = publish("world.first", "world", 2, 1);
        const second = publish("world.second", "world", 3, 4);
        const publishers = register.getSingleMetric("workadventure_nb_publishers_per_space");
        expect((await publishers?.get())?.values).toMatchObject([{ labels: { world: "world" }, value: 5 }]);
        publish("world.first", "world", 0, 0);
        expect((await publishers?.get())?.values).toMatchObject([{ labels: { world: "world" }, value: 3 }]);
        clientEventsEmitter.deleteSpaceSubject.next(first);
        expect((await publishers?.get())?.values).toMatchObject([{ labels: { world: "world" }, value: 3 }]);
        clientEventsEmitter.deleteSpaceSubject.next(second);
        expect((await publishers?.get())?.values).toEqual([]);
        expect(gaugeManager).toHaveProperty("worldStats.size", 0);
        expect(gaugeManager).toHaveProperty("spaceStats.size", 0);
    });
});
