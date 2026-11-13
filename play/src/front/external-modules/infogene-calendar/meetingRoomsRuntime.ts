import { get } from "svelte/store";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { AREA_POSITION_OFFSET_Y, type AreaData } from "@workadventure/map-editor";
import { asError } from "catch-unknown";
import { gameManager } from "../../Phaser/Game/GameManager";
import type { GameScene } from "../../Phaser/Game/GameScene";
import { DEPTH_DOOR_LOCK_INDEX } from "../../Phaser/Game/DepthIndexes";
import { WOKA_SPEED } from "../../Enum/EnvironmentVariable";
import { calendarEventsStore, goToMeetingStore, meetingKeyHereStore } from "../../Stores/CalendarStore";
import { askToOpenInTeams, calendarRemindersStore, remindAgain } from "../../Components/Calendar/CalendarReminder";
import { notifySystem } from "../../Notification/SystemNotifier";
import type { MeetingRoom } from "../../../common/MacCompanion";
import { claimMeetingRoom, listMeetingRooms } from "./CompanionApi";
import {
    goToMeeting,
    MeetingArrival,
    meetingKeyHere,
    meetingRoomLabels,
    meetingToOpenOnEntry,
    roomAt,
    vacantRooms,
} from "./meetingRooms";

/** The titles of the taken rooms are read again twice a minute, as the agenda's busy status. */
const LABELS_INTERVAL_MS = 30 * 1000;
/** Walking into a room is noticed within two seconds. */
const ENTRY_INTERVAL_MS = 2 * 1000;

function sceneAreas(scene: GameScene): AreaData[] {
    return [...(scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [])];
}

function currentScene(): GameScene | undefined {
    try {
        return gameManager.getCurrentGameScene();
    } catch {
        return undefined;
    }
}

/**
 * The Teams meeting rooms in the game: "Go there" on a reminder (walk to the room, then "Open in Teams?" on arrival),
 * the title of each taken room above it, and the reminder shown again to a player who walks into a room during their
 * meeting. Returns the function stopping it all.
 */
export function startMeetingRooms(): () => void {
    const labels = new Map<string, Phaser.GameObjects.Text>();
    let lastRoomId: string | undefined;
    let rooms: MeetingRoom[] = [];
    /** Meetings already offered on arrival with "Go there": being in their room does not remind them again. */
    const joined = new Set<string>();
    const arrival = new MeetingArrival();
    const abortController = new AbortController();

    const arrived = (event: CalendarEventInterface | undefined) => {
        if (!event) return;
        joined.add(event.id);
        askToOpenInTeams(event, "arrived");
    };

    // In an area by the feet, as the game's own area events (the sprite's position is its middle).
    const feet = (scene: GameScene) => ({
        x: scene.CurrentPlayer.x,
        y: scene.CurrentPlayer.y + AREA_POSITION_OFFSET_Y,
    });

    goToMeetingStore.set((event) => {
        const scene = currentScene();
        if (!scene) return;
        let walk: number | undefined;
        goToMeeting(event, {
            claim: (input) => claimMeetingRoom(input, abortController.signal),
            onRoom: (areaId) => {
                walk = arrival.expect(event, areaId, scene.roomUrl);
            },
            // The room is entered by the feet (see `feet`): a free point of the room is where the feet must go.
            reachablePointIn: (room) =>
                scene.nearestReachablePointIn(
                    { x: room.x, y: room.y, width: room.width, height: room.height },
                    { x: room.x + room.width / 2, y: room.y + room.height / 2 },
                ),
            standsIn: (room) => roomAt(feet(scene), [room]) !== undefined,
            walkTo: (point) => scene.moveTo(point, true, WOKA_SPEED * 2.5),
            mapUrl: scene.roomUrl,
            areas: () => sceneAreas(scene),
            // Every player of the map, this one included, by their feet.
            vacantAreaIds: () =>
                vacantRooms(sceneAreas(scene), [
                    feet(scene),
                    ...Array.from(scene.MapPlayersByKey.values(), (player) => ({
                        x: player.x,
                        y: player.y + AREA_POSITION_OFFSET_Y,
                    })),
                ]),
        })
            .then((outcome) => {
                if (abortController.signal.aborted) return;
                refreshLabels();
                if (outcome.kind === "claim-failed" || outcome.kind === "no-path") {
                    console.warn("Cannot go to the meeting room", outcome.kind, outcome.error);
                }
                // No room to walk to: the avatar stays, and Teams is offered at once, saying why.
                if (outcome.kind !== "walking") {
                    if (walk !== undefined) arrival.cancel();
                    askToOpenInTeams(event, outcome.kind);
                    return;
                }
                if (walk === undefined || abortController.signal.aborted) return;
                // Noticed as soon as the walk ends; a walk that never ends is caught by watchEntry.
                const current = currentScene();
                if (current?.CurrentPlayer) {
                    arrived(
                        arrival.walkEnded(walk, feet(current), sceneAreas(current), current.roomUrl, new Date()),
                    );
                }
            })
            .catch((e: unknown) => {
                if (abortController.signal.aborted) return;
                console.warn("Cannot go to the meeting room", asError(e).message);
                // An unexpected error (goToMeeting itself never rejects): the meeting can still be opened in Teams.
                if (walk !== undefined) arrival.cancel();
                askToOpenInTeams(event, "teams-only");
            });
    });

    const refreshLabels = () => {
        const scene = currentScene();
        if (!scene) return;
        listMeetingRooms(scene.roomUrl, abortController.signal)
            .then((list) => {
                rooms = list.rooms;
                const wanted = meetingRoomLabels(rooms, sceneAreas(scene));
                for (const [areaId, text] of labels) {
                    if (!wanted.some((label) => label.areaId === areaId)) {
                        text.destroy();
                        labels.delete(areaId);
                    }
                }
                for (const label of wanted) {
                    const existing = labels.get(label.areaId);
                    if (existing) {
                        existing.setText(label.text).setPosition(label.x, label.y - 4);
                        continue;
                    }
                    const text = scene.add
                        .text(label.x, label.y - 4, label.text, {
                            fontFamily: '"Press Start 2P"',
                            fontSize: "8px",
                            color: "#ffffff",
                            backgroundColor: "#1b2a41cc",
                            padding: { x: 4, y: 2 },
                        })
                        .setOrigin(0.5, 1)
                        .setResolution(2)
                        .setDepth(DEPTH_DOOR_LOCK_INDEX);
                    labels.set(label.areaId, text);
                }
            })
            .catch(() => undefined);
    };

    const watchEntry = () => {
        const scene = currentScene();
        const player = scene?.CurrentPlayer;
        if (!scene || !player) return;
        const areas = sceneAreas(scene);
        // "Go there" is hidden for the meeting whose room the player stands in.
        meetingKeyHereStore.set(meetingKeyHere(feet(scene), areas, rooms));
        // Before the entry below: arriving after "Go there" asks about Teams instead of reminding.
        arrived(arrival.check(feet(scene), areas, scene.roomUrl, new Date()));
        const room = roomAt(feet(scene), areas);
        if (room?.id === lastRoomId) return;
        lastRoomId = room?.id;
        // Out of every room: "Go there" only kept the arrival it caused quiet; coming back reminds again.
        if (!room) {
            joined.clear();
            return;
        }
        // The meeting walked to with "Go there" is not reminded on the way into its room.
        const pending = arrival.pendingEventId();
        const meeting = meetingToOpenOnEntry(
            get(calendarEventsStore).values(),
            new Date(),
            rooms.find((candidate) => candidate.areaId === room.id),
            pending === undefined ? joined : new Set([...joined, pending]),
        );
        if (meeting) remindAgain(meeting);
    };

    // A reminder that shows up while the tab is in the background also goes to the system (setting, permission).
    const notified = new Set<string>();
    const unsubscribeReminders = calendarRemindersStore.subscribe((reminders) => {
        for (const event of reminders) {
            if (notified.has(event.id)) continue;
            notified.add(event.id);
            notifySystem({
                kind: "meeting",
                title: event.title,
                body: event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                tag: `meeting:${event.id}`,
                onClick: () => window.focus(),
            });
        }
    });

    refreshLabels();
    const labelsTimer = setInterval(refreshLabels, LABELS_INTERVAL_MS);
    const entryTimer = setInterval(watchEntry, ENTRY_INTERVAL_MS);

    return () => {
        abortController.abort();
        arrival.cancel();
        unsubscribeReminders();
        clearInterval(labelsTimer);
        clearInterval(entryTimer);
        for (const text of labels.values()) text.destroy();
        labels.clear();
        goToMeetingStore.set(undefined);
        meetingKeyHereStore.set(undefined);
    };
}
