import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { writable } from "svelte/store";
import { mock } from "vitest-mock-extended";
import type { Character } from "../../Phaser/Entity/Character";
import type { GameScene } from "../../Phaser/Game/GameScene";
import type { UsernameDomLayer } from "../../Phaser/Game/UsernameDomLayer";
import type { VideoBox } from "../../Space/VideoBox";
import type { Streamable } from "../../Space/Streamable";

vi.mock("phaser", () => ({ Scenes: { Events: { RENDER: "render" } } }));
vi.mock("./MediaBox.svelte", () => ({ default: (): void => undefined }));

import AvatarVideoBubble from "./AvatarVideoBubble.svelte";

describe("avatar video bubble lifecycle", () => {
    afterEach(() => document.body.replaceChildren());

    it("follows Phaser positions, restores the name when the camera stops, and removes its render listener", async () => {
        const layer = document.createElement("div");
        const target = document.createElement("div");
        document.body.append(layer, target);
        let render: (() => void) | undefined;
        const events = mock<GameScene["events"]>();
        events.on.mockImplementation((_event, callback) => {
            render = () => callback();
            return events;
        });
        const scene = Object.assign(mock<GameScene>(), {
            events,
            usernameDomLayer: mock<UsernameDomLayer>({ addUsername: (node) => layer.append(node) }),
        });
        const character = Object.assign(mock<Character>(), { scene, x: 100, y: 200, depth: 200, playerName: "Alice" });
        const hasVideo = writable(true);
        const streamable = Object.assign(mock<Streamable>(), {
            hasVideo,
            media: {
                type: "webrtc",
                isBlocked: writable(false),
                streamStore: writable(undefined),
                setDimensions: () => undefined,
            },
        });
        const videoBox = Object.assign(mock<VideoBox>(), {
            uniqueId: "room_7",
            streamable: writable(streamable),
            statusStore: writable("connected"),
        });
        const component = mount(AvatarVideoBubble, { target, props: { videoBox, character } });
        flushSync();
        const node = layer.querySelector<HTMLDivElement>(".avatar-video-bubble");
        expect(node?.style.transform).toContain("100px, 172px");
        expect(character.setVideoBubbleVisible.mock.lastCall).toEqual([true]);

        character.x = 140;
        character.y = 220;
        render?.();
        expect(node?.style.transform).toContain("140px, 192px");

        hasVideo.set(false);
        flushSync();
        expect(character.setVideoBubbleVisible.mock.lastCall).toEqual([false]);
        expect(node?.classList.contains("visible")).toBe(false);

        await unmount(component);
        expect(events.off.mock.calls).toContainEqual(["render", events.on.mock.calls[0]?.[1]]);
        expect(layer.children.length).toBe(0);
    });
});
