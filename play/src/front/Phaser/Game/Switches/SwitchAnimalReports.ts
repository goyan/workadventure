import { switchPresenceSenses } from "@workadventure/map-editor";
import type { SwitchTrigger } from "@workadventure/map-editor";

/** A report is repeated this often while an animal stays in a sensor: the server lets go of a report after 5 s. */
export const ANIMAL_REPORT_REPEAT_MS = 2000;

/** A presence sensor of the map, with the area it watches if it watches one. */
export interface AnimalSensor {
    id: string;
    x: number;
    y: number;
    elevation: number;
    trigger: Extract<SwitchTrigger, { type: "presence" }>;
    area: { x: number; y: number; width: number; height: number; elevation?: number } | undefined;
}

/**
 * The presence sensors a wandering animal stands in. The animals walk on the ground of the map: a sensor upstairs
 * does not sense them. Same rule as the server uses for the players (switchPresenceSenses).
 */
export function sensorsWithAnimals(
    sensors: readonly AnimalSensor[],
    animals: readonly { x: number; y: number }[],
): string[] {
    return sensors
        .filter((sensor) =>
            animals.some((animal) => switchPresenceSenses(sensor, sensor.trigger, sensor.area, animal, 0)),
        )
        .map((sensor) => sensor.id);
}

/**
 * Decides when to tell the server which sensors have an animal in them: at once when that changes (an empty list once
 * the last animal left), then every 2 s while one stays. Nothing is ever sent on a map whose animals keep away from
 * the sensors.
 */
export class SwitchAnimalReporter {
    private last: string[] = [];
    private sentAt = 0;

    /** The list to send now, or undefined when there is nothing to say. */
    public next(sensorIds: readonly string[], now: number): string[] | undefined {
        const sorted = [...sensorIds].sort();
        const same = sorted.length === this.last.length && sorted.every((id, index) => id === this.last[index]);
        if (same && (sorted.length === 0 || now - this.sentAt < ANIMAL_REPORT_REPEAT_MS)) {
            return undefined;
        }
        this.last = sorted;
        this.sentAt = now;
        return sorted;
    }
}
