import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import type { Scene } from "phaser";
import { marked } from "marked";
import { SpeechDomElement } from "../../../../src/front/Phaser/Entity/SpeechDomElement";

vi.mock("phaser", () => ({
    GameObjects: {
        DOMElement: class {
            constructor(
                public scene: Scene,
                _x: number,
                _y: number,
                public node: HTMLElement,
            ) {}
            setAlpha(): void {}
            destroy(): void {}
        },
    },
}));
vi.mock("marked", () => ({ marked: { parse: vi.fn((text: string) => text) } }));
vi.mock("../../../../src/i18n/i18n-svelte", () => ({
    default: writable({ trigger: { spaceKeyboard: () => "[SPACE]", escapeKeyboard: () => "[ESC]" } }),
}));

afterEach(() => vi.restoreAllMocks());

describe("SpeechDomElement cleanup", () => {
    it("cancels its animation and destroys only once", () => {
        const killTweensOf = vi.fn();
        const scene = { tweens: { killTweensOf } } as unknown as Scene;
        const bubble = new SpeechDomElement("message", "hello", scene);
        bubble.destroy();
        bubble.destroy();
        expect(killTweensOf).toHaveBeenCalledExactlyOnceWith(bubble);
    });

    it("does not repopulate a destroyed bubble when Markdown finishes late", async () => {
        let resolveText: (text: string) => void = () => {};
        const rendering = new Promise<string>((resolve) => {
            resolveText = resolve;
        });
        vi.mocked(marked.parse).mockReturnValueOnce(rendering);
        const scene = { tweens: { killTweensOf: vi.fn() } } as unknown as Scene;
        const bubble = new SpeechDomElement("message", "hello", scene);
        const node = bubble.node;
        bubble.destroy();
        resolveText("<p>hello</p>");
        await rendering;
        expect(node.innerHTML).toBe("");
    });
});
