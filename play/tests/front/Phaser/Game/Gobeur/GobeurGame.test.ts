import { describe, expect, it } from "vitest";
import { GobeurGame, type GobeurEffect } from "../../../../../src/front/Phaser/Game/Gobeur/GobeurGame";
import type { GobeurMessage, GobeurStartMessage } from "../../../../../src/front/Phaser/Game/Gobeur/GobeurProtocol";

function startMsg(overrides: Partial<GobeurStartMessage> = {}): GobeurStartMessage {
    return {
        kind: "start",
        gameId: "g1",
        entityId: "e1",
        masterUuid: "m",
        startedAt: 1000,
        endsAt: 61_000,
        level: "beginner",
        prisonAreaId: "prison",
        players: ["m", "a", "b"],
        ...overrides,
    };
}

function sent(effects: GobeurEffect[]): GobeurMessage[] {
    return effects.flatMap((e) => (e.kind === "send" ? [e.message] : []));
}

function kinds(effects: GobeurEffect[]): string[] {
    return effects.map((e) => (e.kind === "send" ? `send:${e.message.kind}` : e.kind));
}

function master(players = ["m", "a", "b"]): GobeurGame {
    const g = new GobeurGame("m");
    g.startAsMaster(startMsg({ players }), players);
    return g;
}

function follower(local: string): GobeurGame {
    const g = new GobeurGame(local);
    g.receive(startMsg(), "m", 1000);
    return g;
}

describe("GobeurGame master", () => {
    it("filters absent players at start and sends start then state", () => {
        const g = new GobeurGame("m");
        const effects = g.startAsMaster(startMsg(), ["m", "a"]);
        expect(kinds(effects)).toEqual(["send:start", "send:state", "announceStart"]);
        const start = sent(effects)[0] as GobeurStartMessage;
        expect(start.players).toEqual(["m", "a"]);
        expect(g.isRunning).toBe(true);
        expect(g.isMaster).toBe(true);
        expect(g.survivors).toEqual(["m", "a"]);
    });

    it("does not announce when master is not a player", () => {
        const g = new GobeurGame("m");
        const effects = g.startAsMaster(startMsg({ players: ["a"] }), ["a"]);
        expect(kinds(effects)).toEqual(["send:start", "send:state"]);
        expect(g.localStatus).toBe("spectator");
    });

    it("ends allCaught with ranking last caught first", () => {
        const g = master();
        g.catchPlayer("a", 2000);
        g.catchPlayer("b", 3000);
        const effects = g.catchPlayer("m", 4000);
        const end = sent(effects).find((m) => m.kind === "end");
        expect(end).toEqual({
            kind: "end",
            gameId: "g1",
            reason: "allCaught",
            ranking: [
                { uuid: "m", status: "caught" },
                { uuid: "b", status: "caught" },
                { uuid: "a", status: "caught" },
            ],
        });
        expect(kinds(effects).slice(-2)).toEqual(["showRanking", "ended"]);
        expect(g.isRunning).toBe(false);
    });

    it("sends caught then state, ignores non survivors", () => {
        const g = master();
        expect(kinds(g.catchPlayer("a", 2000))).toEqual(["send:caught", "send:state"]);
        expect(g.catchPlayer("a", 2100)).toEqual([]);
        expect(g.catchPlayer("zzz", 2100)).toEqual([]);
        expect(g.caughtOrder).toEqual(["a"]);
    });

    it("teleports locally when master is caught and the game goes on", () => {
        const g = master();
        const effects = g.catchPlayer("m", 2000);
        expect(kinds(effects)).toContain("teleportToPrison");
        expect(g.isRunning).toBe(true);
        expect(g.localStatus).toBe("caught");
    });

    it("ends timeUp with survivors first", () => {
        const g = master();
        g.catchPlayer("a", 2000);
        const effects = g.tick(61_000, ["m", "a", "b"]);
        const end = sent(effects).find((m) => m.kind === "end");
        expect(end).toMatchObject({
            reason: "timeUp",
            ranking: [
                { uuid: "m", status: "survivor" },
                { uuid: "b", status: "survivor" },
                { uuid: "a", status: "caught" },
            ],
        });
        expect(kinds(effects).slice(-2)).toEqual(["showRanking", "ended"]);
    });

    it("moves absent players to left, last in ranking", () => {
        const g = master();
        g.tick(5000, ["m", "a"]);
        expect(g.survivors).toEqual(["m", "a"]);
        g.catchPlayer("a", 6000);
        const effects = g.stop("stopped");
        const end = sent(effects).find((m) => m.kind === "end");
        expect(end).toMatchObject({
            reason: "stopped",
            ranking: [
                { uuid: "m", status: "survivor" },
                { uuid: "a", status: "caught" },
                { uuid: "b", status: "left" },
            ],
        });
    });

    it("ends allCaught when every survivor left", () => {
        const g = master(["m", "a"]);
        const effects = g.tick(2000, []);
        expect(sent(effects).find((m) => m.kind === "end")).toMatchObject({ reason: "allCaught" });
    });

    it("sends start then state every 5000 ms", () => {
        const g = master();
        expect(g.tick(3000, ["m", "a", "b"])).toEqual([]);
        expect(kinds(g.tick(6000, ["m", "a", "b"]))).toEqual(["send:start", "send:state"]);
        expect(g.tick(8000, ["m", "a", "b"])).toEqual([]);
        const effects = g.tick(11_000, ["m", "a", "b"]);
        expect(kinds(effects)).toEqual(["send:start", "send:state"]);
        expect(sent(effects)[0]).toEqual(startMsg());
    });

    it("periodic start is ignored by a follower and adopted by a late joiner", () => {
        const g = master();
        g.catchPlayer("a", 2000);
        const periodic = sent(g.tick(7000, ["m", "a", "b"]));
        expect(periodic.map((m) => m.kind)).toEqual(["start", "state"]);

        const already = follower("b");
        expect(already.receive(periodic[0], "m", 7000)).toEqual([]);
        expect(already.receive(periodic[1], "m", 7000)).toEqual([]);
        expect(already.caughtOrder).toEqual(["a"]);

        const late = new GobeurGame("a");
        expect(kinds(late.receive(periodic[0], "m", 7000))).toEqual(["announceStart"]);
        expect(late.isRunning).toBe(true);
        expect(kinds(late.receive(periodic[1], "m", 7000))).toEqual(["teleportToPrison"]);
        expect(late.receive(periodic[1], "m", 12_000)).toEqual([]);
        expect(late.localStatus).toBe("caught");
    });

    it("sends state on playerJoined", () => {
        expect(kinds(master().playerJoined("c"))).toEqual(["send:start", "send:state"]);
    });

    it("ignores its own echoed messages", () => {
        const g = master();
        expect(g.receive({ kind: "caught", gameId: "g1", uuid: "a" }, "m", 2000)).toEqual([]);
        expect(g.survivors).toEqual(["m", "a", "b"]);
    });

    it("stops with stopped: end, showRanking, ended", () => {
        expect(kinds(master().stop("stopped"))).toEqual(["send:end", "showRanking", "ended"]);
    });
});

describe("GobeurGame follower", () => {
    it("announces start when local is a player", () => {
        const g = new GobeurGame("a");
        expect(kinds(g.receive(startMsg(), "m", 1000))).toEqual(["announceStart"]);
        expect(g.isRunning).toBe(true);
        expect(g.isMaster).toBe(false);
        expect(g.localStatus).toBe("survivor");
    });

    it("is spectator when not a player and does not announce", () => {
        const g = new GobeurGame("x");
        expect(g.receive(startMsg(), "m", 1000)).toEqual([]);
        expect(g.localStatus).toBe("spectator");
        expect(g.isRunning).toBe(true);
    });

    it("ignores messages from a sender other than the master", () => {
        const g = follower("a");
        const state: GobeurMessage = {
            kind: "state",
            gameId: "g1",
            survivors: ["m"],
            caught: ["a", "b"],
            left: [],
            endsAt: 5,
        };
        expect(g.receive(state, "intruder", 2000)).toEqual([]);
        expect(g.localStatus).toBe("survivor");
    });

    it("ignores messages for another gameId", () => {
        const g = follower("a");
        const state: GobeurMessage = {
            kind: "state",
            gameId: "other",
            survivors: ["m"],
            caught: ["a"],
            left: [],
            endsAt: 5,
        };
        expect(g.receive(state, "m", 2000)).toEqual([]);
        expect(g.localStatus).toBe("survivor");
    });

    it("teleports once when caught message arrives, not again on state", () => {
        const g = follower("a");
        expect(kinds(g.receive({ kind: "caught", gameId: "g1", uuid: "a" }, "m", 2000))).toEqual(["teleportToPrison"]);
        const state: GobeurMessage = {
            kind: "state",
            gameId: "g1",
            survivors: ["m", "b"],
            caught: ["a"],
            left: [],
            endsAt: 61_000,
        };
        expect(g.receive(state, "m", 2500)).toEqual([]);
        expect(g.receive(state, "m", 3000)).toEqual([]);
        expect(g.localStatus).toBe("caught");
    });

    it("teleports exactly once after reload: start then state listing local caught", () => {
        const g = new GobeurGame("a");
        expect(kinds(g.receive(startMsg(), "m", 9000))).toEqual(["announceStart"]);
        const state: GobeurMessage = {
            kind: "state",
            gameId: "g1",
            survivors: ["m", "b"],
            caught: ["a"],
            left: [],
            endsAt: 61_000,
        };
        expect(kinds(g.receive(state, "m", 9000))).toEqual(["teleportToPrison"]);
        expect(g.receive(state, "m", 9500)).toEqual([]);
        expect(g.isRunning).toBe(true);
    });

    it("idle instance ignores a lone state", () => {
        const g = new GobeurGame("a");
        const state: GobeurMessage = {
            kind: "state",
            gameId: "g1",
            survivors: ["m", "b"],
            caught: ["a"],
            left: [],
            endsAt: 61_000,
        };
        expect(g.receive(state, "m", 9000)).toEqual([]);
        expect(g.isRunning).toBe(false);
    });

    it("ignores a repeated start of the followed game", () => {
        const g = follower("a");
        expect(g.receive(startMsg(), "m", 2000)).toEqual([]);
    });

    it("pos messages from the master refresh the timeout", () => {
        const g = follower("x");
        g.receive(
            { kind: "state", gameId: "g1", survivors: ["m", "a", "b"], caught: [], left: [], endsAt: 61_000 },
            "m",
            5000,
        );
        const pos: GobeurMessage = { kind: "pos", gameId: "g1", x: 1, y: 2, direction: "down", at: 9000 };
        expect(g.receive(pos, "m", 9000)).toEqual([]);
        expect(g.tick(10_001, [])).toEqual([]);
    });

    it("ignores a start whose sender is not its masterUuid", () => {
        const g = new GobeurGame("a");
        expect(g.receive(startMsg(), "intruder", 1000)).toEqual([]);
        expect(g.isRunning).toBe(false);
    });

    it("teleports when a follower's state lists local caught without prior caught message", () => {
        const g = follower("a");
        const state: GobeurMessage = {
            kind: "state",
            gameId: "g1",
            survivors: ["m", "b"],
            caught: ["a"],
            left: [],
            endsAt: 70_000,
        };
        expect(kinds(g.receive(state, "m", 2000))).toEqual(["teleportToPrison"]);
        expect(g.endsAt).toBe(70_000);
    });

    it("shows ranking then ended on end message", () => {
        const g = follower("a");
        const ranking = [{ uuid: "m", status: "survivor" as const }];
        const effects = g.receive({ kind: "end", gameId: "g1", reason: "timeUp", ranking }, "m", 3000);
        expect(effects).toEqual([{ kind: "showRanking", ranking, reason: "timeUp" }, { kind: "ended" }]);
        expect(g.isRunning).toBe(false);
        expect(g.receive({ kind: "caught", gameId: "g1", uuid: "a" }, "m", 3100)).toEqual([]);
    });

    it("is interrupted after more than 5000 ms without master message", () => {
        const g = follower("x");
        expect(g.tick(6000, [])).toEqual([]);
        const effects = g.tick(6001, []);
        expect(effects).toEqual([
            {
                kind: "showRanking",
                ranking: [
                    { uuid: "m", status: "survivor" },
                    { uuid: "a", status: "survivor" },
                    { uuid: "b", status: "survivor" },
                ],
                reason: "interrupted",
            },
            { kind: "ended" },
        ]);
        expect(g.isRunning).toBe(false);
    });

    it("master messages refresh the timeout", () => {
        const g = follower("x");
        g.receive(
            { kind: "state", gameId: "g1", survivors: ["m", "a", "b"], caught: [], left: [], endsAt: 61_000 },
            "m",
            5000,
        );
        expect(g.tick(9999, [])).toEqual([]);
        expect(kinds(g.tick(10_001, []))).toEqual(["showRanking", "ended"]);
    });

    it("stop(interrupted) on follower shows ranking and ends without sending", () => {
        expect(kinds(follower("a").stop("interrupted"))).toEqual(["showRanking", "ended"]);
    });
});

describe("GobeurGame concurrent starts", () => {
    it("master of the newer game ends and adopts the older one", () => {
        const g = new GobeurGame("m");
        g.startAsMaster(startMsg({ startedAt: 2000 }), ["m", "a", "b"]);
        const older = startMsg({ gameId: "g0", masterUuid: "z", startedAt: 1500, players: ["m", "a"] });
        const effects = g.receive(older, "z", 2100);
        expect(kinds(effects)).toEqual(["ended", "announceStart"]);
        expect(g.isMaster).toBe(false);
        expect(g.isRunning).toBe(true);
        expect(g.survivors).toEqual(["m", "a"]);
    });

    it("keeps the older current game and ignores a newer start", () => {
        const g = new GobeurGame("m");
        g.startAsMaster(startMsg({ startedAt: 1000 }), ["m", "a", "b"]);
        const newer = startMsg({ gameId: "g2", masterUuid: "z", startedAt: 1500 });
        expect(g.receive(newer, "z", 2000)).toEqual([]);
        expect(g.isMaster).toBe(true);
        expect(g.isRunning).toBe(true);
    });

    it("follower switches to an older game", () => {
        const g = follower("a");
        const older = startMsg({ gameId: "g0", masterUuid: "z", startedAt: 500, players: ["a"] });
        expect(kinds(g.receive(older, "z", 2000))).toEqual(["announceStart"]);
        expect(g.receive({ kind: "caught", gameId: "g0", uuid: "a" }, "z", 2100)).toEqual([
            { kind: "teleportToPrison" },
        ]);
    });

    it("resolves a tied startedAt by gameId", () => {
        const g = new GobeurGame("m");
        g.startAsMaster(startMsg({ gameId: "g2", startedAt: 2000 }), ["m", "a", "b"]);
        const tiedOlder = startMsg({ gameId: "g1", masterUuid: "z", startedAt: 2000 });
        expect(kinds(g.receive(tiedOlder, "z", 2100))).toEqual(["ended", "announceStart"]);
        const g2 = new GobeurGame("m");
        g2.startAsMaster(startMsg({ gameId: "g1", startedAt: 2000 }), ["m", "a", "b"]);
        const tiedNewer = startMsg({ gameId: "g2", masterUuid: "z", startedAt: 2000 });
        expect(g2.receive(tiedNewer, "z", 2100)).toEqual([]);
        expect(g2.isMaster).toBe(true);
    });
});

describe("GobeurGame guards and late joiners", () => {
    it("startAsMaster is a no-op while running", () => {
        const g = master();
        expect(g.startAsMaster(startMsg({ gameId: "other" }), ["m"])).toEqual([]);
        expect(g.survivors).toEqual(["m", "a", "b"]);
        const f = follower("a");
        expect(f.startAsMaster(startMsg({ gameId: "other" }), ["a"])).toEqual([]);
        expect(f.isMaster).toBe(false);
    });

    it("playerJoined sends the current start then state", () => {
        const g = master();
        const effects = g.playerJoined("c");
        expect(kinds(effects)).toEqual(["send:start", "send:state"]);
        expect(sent(effects)[0]).toMatchObject({ gameId: "g1", players: ["m", "a", "b"] });
    });
});
