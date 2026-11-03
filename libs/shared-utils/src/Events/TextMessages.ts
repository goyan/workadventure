import { z } from "zod";

export const textMessageSenderSchema = z.object({
    uuid: z.string().min(1),
    name: z.string(),
});

export const globalTextMessageSchema = z
    .object({
        ops: z.array(z.unknown()),
        sender: textMessageSenderSchema.optional(),
    })
    .passthrough();

/** Reserved native event: the room server supplies the sender and chooses the recipients. */
export const privateMessageEventName = "workadventure.private-message";

export const privateMessageRequestSchema = z
    .object({
        recipientUuid: z.string().min(1).max(512),
        text: z.string().trim().min(1).max(500),
    })
    .strict();

export const privateMessageSchema = privateMessageRequestSchema.extend({
    sender: textMessageSenderSchema,
});

export type PrivateMessage = z.infer<typeof privateMessageSchema>;
