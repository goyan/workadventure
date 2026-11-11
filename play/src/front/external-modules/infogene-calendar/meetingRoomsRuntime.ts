import { get } from "svelte/store";
import type { AreaData } from "@workadventure/map-editor";
import { asError } from "catch-unknown";
import { gameManager } from "../../Phaser/Game/GameManager";
import type { GameScene } from "../../Phaser/Game/GameScene";
import { DEPTH_DOOR_LOCK_INDEX } from "../../Phaser/Game/DepthIndexes";
import { WOKA_SPEED } from "../../Enum/EnvironmentVariable";
import { calendarEventsStore, goToMeetingStore } from "../../Stores/CalendarStore";
import { calendarRemindersStore, remindAgain } from "../../Components/Calendar/CalendarReminder";
import { notifySystem } from "../../Notification/SystemNotifier";
import { scriptUtils } from "../../Api/ScriptUtils";
import type { MeetingRoom } from "../../../common/MacCompanion";
import { claimMeetingRoom, listMeetingRooms } from "./CompanionApi";
import { goToMeeting, meetingRoomLabels, meetingToOpenOnEntry, roomAt } from "./meetingRooms";

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
 * The Teams meeting rooms in the game: "Go there" on a reminder, the title of each taken room above it, and the
 * reminder shown again to a player who walks into a room during their meeting. Returns the function stopping it all.
 */
export function startMeetingRooms(): () => void {
    const labels = new Map<string, Phaser.GameObjects.Text>();
    let lastRoomId: string | undefined;
    let rooms: MeetingRoom[] = [];
    /** Meetings the player went to with "Go there": walking into their room does not remind them again. */
    const joined = new Set<string>();
    const abortController = new AbortController();

    goToMeetingStore.set((event) => {
        const scene = currentScene();
        if (!scene) return;
        joined.add(event.id);
        goToMeeting(event, {
            // A new tab, as the agenda's Join button: the game window must never navigate away.
            openUrl: (url) => scriptUtils.openTab(url),
            claim: (input) => claimMeetingRoom(input, abortController.signal),
            walkTo: (point) => scene.moveTo(point, true, WOKA_SPEED * 2.5).then(() => undefined),
            mapUrl: scene.roomUrl,
            areas: () => sceneAreas(scene),
        })
            .then(() => refreshLabels())
            .catch((e: unknown) => console.warn("Cannot go to the meeting room", asError(e).message));
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
        const room = roomAt({ x: player.x, y: player.y }, sceneAreas(scene));
        if (room?.id === lastRoomId) return;
        lastRoomId = room?.id;
        if (!room) return;
        const meeting = meetingToOpenOnEntry(
            get(calendarEventsStore).values(),
            new Date(),
            rooms.find((candidate) => candidate.areaId === room.id),
            joined,
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
        unsubscribeReminders();
        clearInterval(labelsTimer);
        clearInterval(entryTimer);
        for (const text of labels.values()) text.destroy();
        labels.clear();
        goToMeetingStore.set(undefined);
    };
}
