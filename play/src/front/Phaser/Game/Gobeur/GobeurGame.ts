import {
    GOBEUR_MASTER_TIMEOUT_MS,
    GOBEUR_STATE_INTERVAL_MS,
    olderStart,
    type GobeurEndMessage,
    type GobeurMessage,
    type GobeurStartMessage,
    type GobeurStateMessage,
} from "./GobeurProtocol";

export type GobeurRanking = GobeurEndMessage["ranking"];
export type GobeurEndReason = GobeurEndMessage["reason"];

export type GobeurEffect =
    | { kind: "send"; message: GobeurMessage }
    | { kind: "teleportToPrison" }
    | { kind: "showRanking"; ranking: GobeurRanking; reason: GobeurEndReason }
    | { kind: "announceStart" }
    | { kind: "ended" };

export type GobeurLocalStatus = "survivor" | "caught" | "spectator";

/**
 * Pure state machine following at most one Gobeur game at a time.
 * It never touches the network or Phaser: callers apply the returned effects.
 */
export class GobeurGame {
    private running = false;
    private master = false;
    private gameId: string | undefined;
    private masterUuid: string | undefined;
    private startMessage: GobeurStartMessage | undefined;
    private _survivors: string[] = [];
    private _caught: string[] = [];
    private left: string[] = [];
    private _endsAt = 0;
    private lastMasterMessageAt = 0;
    private lastStateSentAt = 0;
    private readonly endedGameIds = new Set<string>();

    constructor(private readonly localUuid: string) {}

    get isRunning(): boolean {
        return this.running;
    }

    get isMaster(): boolean {
        return this.master;
    }

    get survivors(): string[] {
        return [...this._survivors];
    }

    get caughtOrder(): string[] {
        return [...this._caught];
    }

    get endsAt(): number {
        return this._endsAt;
    }

    get localStatus(): GobeurLocalStatus {
        if (this._survivors.includes(this.localUuid)) {
            return "survivor";
        }
        if (this._caught.includes(this.localUuid)) {
            return "caught";
        }
        return "spectator";
    }

    startAsMaster(start: GobeurStartMessage, presentUuids: string[]): GobeurEffect[] {
        if (this.running) {
            return [];
        }
        const players = start.players.filter((uuid) => presentUuids.includes(uuid));
        const message: GobeurStartMessage = { ...start, players };
        this.adopt(message, true, start.startedAt);
        this.lastStateSentAt = start.startedAt;
        const effects: GobeurEffect[] = [
            { kind: "send", message },
            { kind: "send", message: this.stateMessage() },
        ];
        if (players.includes(this.localUuid)) {
            effects.push({ kind: "announceStart" });
        }
        return effects;
    }

    receive(message: GobeurMessage, senderUuid: string, now: number): GobeurEffect[] {
        if (this.master && senderUuid === this.localUuid) {
            return [];
        }
        switch (message.kind) {
            case "pos":
                if (this.isFromCurrentMaster(message.gameId, senderUuid)) {
                    this.lastMasterMessageAt = now;
                }
                return [];
            case "start":
                return this.receiveStart(message, senderUuid, now);
            case "state":
                return this.receiveState(message, senderUuid, now);
            case "caught":
            case "end":
                if (!this.isFromCurrentMaster(message.gameId, senderUuid)) {
                    return [];
                }
                this.lastMasterMessageAt = now;
                return message.kind === "caught" ? this.receiveCaught(message.uuid) : this.receiveEnd(message);
        }
    }

    catchPlayer(uuid: string, now: number): GobeurEffect[] {
        if (!this.running || !this.master || !this._survivors.includes(uuid)) {
            return [];
        }
        this._survivors = this._survivors.filter((u) => u !== uuid);
        this._caught.push(uuid);
        this.lastStateSentAt = now;
        const effects: GobeurEffect[] = [
            { kind: "send", message: { kind: "caught", gameId: this.currentGameId(), uuid } },
            { kind: "send", message: this.stateMessage() },
        ];
        if (uuid === this.localUuid) {
            effects.push({ kind: "teleportToPrison" });
        }
        if (this._survivors.length === 0) {
            effects.push(...this.finishAsMaster("allCaught"));
        }
        return effects;
    }

    tick(now: number, presentUuids: string[]): GobeurEffect[] {
        if (!this.running) {
            return [];
        }
        if (!this.master) {
            if (now - this.lastMasterMessageAt > GOBEUR_MASTER_TIMEOUT_MS) {
                return this.finishAsFollower("interrupted");
            }
            return [];
        }
        const absent = this._survivors.filter((uuid) => !presentUuids.includes(uuid));
        if (absent.length > 0) {
            this._survivors = this._survivors.filter((uuid) => !absent.includes(uuid));
            this.left.push(...absent);
        }
        if (this._survivors.length === 0) {
            return this.finishAsMaster("allCaught");
        }
        if (now >= this._endsAt) {
            return this.finishAsMaster("timeUp");
        }
        if (now - this.lastStateSentAt >= GOBEUR_STATE_INTERVAL_MS) {
            this.lastStateSentAt = now;
            return [{ kind: "send", message: this.stateMessage() }];
        }
        return [];
    }

    playerJoined(_uuid: string): GobeurEffect[] {
        if (!this.running || !this.master || !this.startMessage) {
            return [];
        }
        return [
            { kind: "send", message: this.startMessage },
            { kind: "send", message: this.stateMessage() },
        ];
    }

    stop(reason: "stopped" | "interrupted"): GobeurEffect[] {
        if (!this.running) {
            return [];
        }
        return this.master ? this.finishAsMaster(reason) : this.finishAsFollower(reason);
    }

    private currentGameId(): string {
        return this.gameId ?? "";
    }

    private isFromCurrentMaster(gameId: string, senderUuid: string): boolean {
        return this.running && !this.master && gameId === this.gameId && senderUuid === this.masterUuid;
    }

    private adopt(start: GobeurStartMessage, asMaster: boolean, now: number): void {
        this.running = true;
        this.master = asMaster;
        this.gameId = start.gameId;
        this.masterUuid = start.masterUuid;
        this.startMessage = start;
        this._survivors = [...start.players];
        this._caught = [];
        this.left = [];
        this._endsAt = start.endsAt;
        this.lastMasterMessageAt = now;
    }

    private stateMessage(): GobeurStateMessage {
        return {
            kind: "state",
            gameId: this.currentGameId(),
            survivors: [...this._survivors],
            caught: [...this._caught],
            left: [...this.left],
            endsAt: this._endsAt,
        };
    }

    private ranking(): GobeurRanking {
        return [
            ...this._survivors.map((uuid) => ({ uuid, status: "survivor" as const })),
            ...[...this._caught].reverse().map((uuid) => ({ uuid, status: "caught" as const })),
            ...this.left.map((uuid) => ({ uuid, status: "left" as const })),
        ];
    }

    private markEnded(): void {
        this.running = false;
        if (this.gameId !== undefined) {
            this.endedGameIds.add(this.gameId);
        }
    }

    private finishAsMaster(reason: GobeurEndReason): GobeurEffect[] {
        const ranking = this.ranking();
        this.markEnded();
        return [
            { kind: "send", message: { kind: "end", gameId: this.currentGameId(), reason, ranking } },
            { kind: "showRanking", ranking, reason },
            { kind: "ended" },
        ];
    }

    private finishAsFollower(reason: GobeurEndReason): GobeurEffect[] {
        const ranking = this.ranking();
        this.markEnded();
        return [{ kind: "showRanking", ranking, reason }, { kind: "ended" }];
    }

    private receiveStart(start: GobeurStartMessage, senderUuid: string, now: number): GobeurEffect[] {
        if (senderUuid !== start.masterUuid || this.endedGameIds.has(start.gameId)) {
            return [];
        }
        const effects: GobeurEffect[] = [];
        if (this.running) {
            if (start.gameId === this.gameId || !this.startMessage) {
                return [];
            }
            if (olderStart(this.startMessage, start) !== start) {
                return [];
            }
            if (this.master) {
                this.markEnded();
                effects.push({ kind: "ended" });
            }
        }
        this.adopt(start, false, now);
        if (start.players.includes(this.localUuid)) {
            effects.push({ kind: "announceStart" });
        }
        return effects;
    }

    private receiveState(state: GobeurStateMessage, senderUuid: string, now: number): GobeurEffect[] {
        if (!this.isFromCurrentMaster(state.gameId, senderUuid)) {
            return [];
        }
        const before = this.localStatus;
        this.lastMasterMessageAt = now;
        this._survivors = [...state.survivors];
        this._caught = [...state.caught];
        this.left = [...state.left];
        this._endsAt = state.endsAt;
        return this.teleportIfNewlyCaught(before);
    }

    private receiveCaught(uuid: string): GobeurEffect[] {
        const before = this.localStatus;
        if (this._survivors.includes(uuid)) {
            this._survivors = this._survivors.filter((u) => u !== uuid);
            this._caught.push(uuid);
        }
        return this.teleportIfNewlyCaught(before);
    }

    private receiveEnd(end: GobeurEndMessage): GobeurEffect[] {
        this.markEnded();
        return [{ kind: "showRanking", ranking: end.ranking, reason: end.reason }, { kind: "ended" }];
    }

    private teleportIfNewlyCaught(before: GobeurLocalStatus): GobeurEffect[] {
        return before !== "caught" && this.localStatus === "caught" ? [{ kind: "teleportToPrison" }] : [];
    }
}
