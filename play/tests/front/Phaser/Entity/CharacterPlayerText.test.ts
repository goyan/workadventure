import { describe, expect, it, vi } from "vitest";
import { Character } from "../../../../src/front/Phaser/Entity/Character";

/** The part of a Character that handlePressSpacePlayerTextCallback reads: its texts, by id. */
function withTexts() {
    return { texts: new Map<string, { callback: () => void }>() };
}

function pressSpace(character: ReturnType<typeof withTexts>): void {
    Character.prototype.handlePressSpacePlayerTextCallback.call(character as unknown as Character);
}

describe("Character.handlePressSpacePlayerTextCallback", () => {
    it("does not run the callback of a text shown by another callback of the same press", () => {
        const character = withTexts();
        const second = vi.fn();
        character.texts.set("first", {
            callback: () => {
                character.texts.delete("first");
                character.texts.set("second", { callback: second });
            },
        });

        pressSpace(character);

        expect(second).not.toHaveBeenCalled();
        expect(character.texts.has("second")).toBe(true);

        pressSpace(character);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("runs the callback of every text shown when the key was pressed", () => {
        const character = withTexts();
        const first = vi.fn();
        const second = vi.fn();
        character.texts.set("first", { callback: first });
        character.texts.set("second", { callback: second });

        pressSpace(character);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("does not run the callback of a text removed by an earlier callback of the same press", () => {
        const character = withTexts();
        const second = vi.fn();
        character.texts.set("first", { callback: () => character.texts.delete("second") });
        character.texts.set("second", { callback: second });

        pressSpace(character);

        expect(second).not.toHaveBeenCalled();
    });
    it("does not run a text replaced under the same id during the press", () => {
        const character = withTexts();
        const replaced = vi.fn();
        const replacement = vi.fn();
        character.texts.set("first", {
            callback: () => {
                // Like the knock prompt: it closes, then shows a text again under an id already shown, which
                // Character.playText removes and adds at the end.
                character.texts.delete("first");
                character.texts.delete("second");
                character.texts.set("second", { callback: replacement });
            },
        });
        character.texts.set("second", { callback: replaced });

        pressSpace(character);

        expect(replaced).not.toHaveBeenCalled();
        expect(replacement).not.toHaveBeenCalled();

        pressSpace(character);
        expect(replacement).toHaveBeenCalledTimes(1);
    });
});
