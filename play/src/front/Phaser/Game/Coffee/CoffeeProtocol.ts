import { z } from "zod";

export const COFFEE_EVENT_NAME = "infogene.coffee";

const CoffeeMessageSchema = z.object({
    /** `start`: the sender just took a coffee; `end`: they went back to work (moved, changed action, left). */
    state: z.enum(["start", "end"]),
    at: z.number().finite(),
});

export type CoffeeMessage = z.infer<typeof CoffeeMessageSchema>;

export function encodeCoffee(message: CoffeeMessage): { name: string; data: unknown } {
    return { name: COFFEE_EVENT_NAME, data: message };
}

/** Returns undefined for any foreign event name or invalid payload. */
export function decodeCoffee(name: string, data: unknown): CoffeeMessage | undefined {
    if (name !== COFFEE_EVENT_NAME) {
        return undefined;
    }
    const parsed = CoffeeMessageSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}
