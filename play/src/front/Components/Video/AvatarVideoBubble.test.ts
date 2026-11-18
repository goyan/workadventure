import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { writable } from "svelte/store";
import { mock } from "vitest-mock-extended";
import type { Character } from "../../Phaser/Entity/Character";
import type { GameScene } from "../../Phaser/Game/GameScene";
import type { UsernameDomLayer } from "../../Phaser/Game/UsernameDomLayer";
import type { VideoBox } from "../../Space/VideoBox";
import type { Streamable } from "../../Space/Streamable";
import { createAvatarVideoLayout } from "./AvatarVideoLayout";

vi.mock("phaser", () => ({
    Scenes: { Events: { RENDER: "render" } },
    Input: { Events: { POINTER_OVER: "pointerover", POINTER_OUT: "pointerout" } },
}));
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
        character.isClickable.mockReturnValue(true);
        const hasVideo = writable(true);
        const showVoiceIndicator = writable(false);
        const streamable = Object.assign(mock<Streamable>(), {
            hasVideo,
            showVoiceIndicator,
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
        const layout = createAvatarVideoLayout();
        const component = mount(AvatarVideoBubble, {
            target,
            props: { videoBox, character, placement: () => layout.get(videoBox.uniqueId) },
        });
        flushSync();
        const node = layer.querySelector<HTMLDivElement>(".avatar-video-bubble");
        expect(node?.style.transform).toContain("100px, 172px");
        expect(node?.querySelector(".avatar-video-name")?.textContent).toContain("Alice");
        expect(node?.querySelector(".avatar-video-tether")).toBeNull();
        expect(character.setVideoBubbleVisible.mock.lastCall).toEqual([true]);
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        expect(character.emit.mock.lastCall).toEqual(["pointerover"]);
        expect(node?.classList.contains("hovered")).toBe(true);
        expect(node?.classList.contains("speaking")).toBe(false);
        node?.dispatchEvent(new MouseEvent("mouseleave"));
        expect(character.emit.mock.lastCall).toEqual(["pointerout"]);
        expect(node?.classList.contains("hovered")).toBe(false);
        character.isClickable.mockReturnValue(false);
        character.emit.mockClear();
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        expect(character.emit.mock.calls).toHaveLength(0);
        expect(node?.classList.contains("hovered")).toBe(false);
        character.isClickable.mockReturnValue(true);
        showVoiceIndicator.set(true);
        flushSync();
        expect(node?.classList.contains("speaking")).toBe(true);

        character.x = 140;
        character.y = 220;
        render?.();
        expect(node?.style.transform).toContain("140px, 192px");

        layout.update([
            { id: videoBox.uniqueId, x: 140, y: 220 },
            { id: "room_8", x: 164, y: 220 },
        ]);
        render?.();
        expect(node?.style.width).toBe("38px");
        expect(node?.classList.contains("grouped")).toBe(true);
        layout.update([{ id: videoBox.uniqueId, x: 140, y: 220 }]);
        render?.();
        expect(node?.style.width).toBe("48px");
        expect(node?.classList.contains("grouped")).toBe(false);
        expect(node?.style.transform).toContain("140px, 192px");

        showVoiceIndicator.set(false);
        flushSync();
        expect(node?.classList.contains("speaking")).toBe(false);

        node?.dispatchEvent(new MouseEvent("mouseenter"));
        hasVideo.set(false);
        flushSync();
        expect(character.emit.mock.lastCall).toEqual(["pointerout"]);
        expect(node?.classList.contains("hovered")).toBe(false);
        expect(character.setVideoBubbleVisible.mock.lastCall).toEqual([false]);
        expect(node?.classList.contains("visible")).toBe(false);

        await unmount(component);
        character.emit.mockClear();
        node?.dispatchEvent(new MouseEvent("mouseenter"));
        expect(character.emit.mock.calls).toHaveLength(0);
        expect(events.off.mock.calls).toContainEqual(["render", events.on.mock.calls[0]?.[1]]);
        expect(layer.children.length).toBe(0);
    });
});
