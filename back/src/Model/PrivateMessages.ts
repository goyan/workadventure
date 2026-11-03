import { privateMessageEventName, privateMessageRequestSchema, type PrivateMessage } from "@workadventure/shared-utils";
import type { User } from "./User";

export class PrivateMessageRefusedError extends Error {}

export class PrivateMessages {
    private readonly rates = new WeakMap<User, { count: number; resetAt: number }>();

    public constructor(private readonly recipients: (uuid: string) => Iterable<User>) {}

    public send(sender: User, data: unknown): void {
        const request = privateMessageRequestSchema.parse(data);
        if (sender.uuid === request.recipientUuid) throw new PrivateMessageRefusedError("Cannot whisper to yourself");
        const targets = [...this.recipients(request.recipientUuid)];
        if (targets.length === 0)
            throw new PrivateMessageRefusedError("Private message recipient is no longer in this map");
        const now = Date.now();
        const rate = this.rates.get(sender);
        if (rate && rate.resetAt > now && rate.count >= 30)
            throw new PrivateMessageRefusedError("Too many private messages; try again later");
        this.rates.set(
            sender,
            rate && rate.resetAt > now
                ? { count: rate.count + 1, resetAt: rate.resetAt }
                : { count: 1, resetAt: now + 60000 },
        );
        const message: PrivateMessage = {
            ...request,
            sender: { uuid: sender.uuid, name: sender.name },
        };
        for (const target of targets) {
            target.emitInBatch({
                message: {
                    $case: "receivedEventMessage",
                    receivedEventMessage: { name: privateMessageEventName, data: message, senderId: sender.id },
                },
            });
        }
    }
}
