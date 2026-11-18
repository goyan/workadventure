import { describe, expect, it } from "vitest";
import { isPlayerNameValid, normalizePlayerName } from "./PlayerName";

describe("player names", () => {
    it.each(["", "   ", "Jean Luc", "Ali\u200bce", "Ali\u3164ce", "🍕", "a".repeat(200)])(
        "replaces invalid names with a valid funny name: %s",
        (value) => {
            const name = normalizePlayerName(value, 10);
            expect(isPlayerNameValid(name, 10)).toBe(true);
            expect(name).toMatch(/\d{2}$/);
        },
    );

    it("keeps an existing valid name", () => {
        expect(normalizePlayerName("Hervé", 10)).toBe("Hervé");
    });
    it.each(["Amine", "Hervé", "中文鍵盤", "Alice_42", "Jean-Luc", "123"])("accepts %s", (name) => {
        expect(isPlayerNameValid(name)).toBe(true);
    });

    it.each([
        "",
        "ab",
        " Alice",
        "Alice ",
        "Jean Luc",
        "Alice\n",
        "Alice\t",
        "Alice\u00a0Bob",
        "Ali\u200bce",
        "Ali\u115fce",
        "Ali\u3164ce",
        "Ali\u202ece",
        "Alice🍕",
        "<script>",
        "%&-",
        "___",
        "-Alice",
        "a".repeat(21),
        null,
    ])("rejects %s", (name) => {
        expect(isPlayerNameValid(name)).toBe(false);
    });

    it("honours a smaller configured limit without allowing more than 20 characters", () => {
        expect(isPlayerNameValid("a".repeat(10), 10)).toBe(true);
        expect(isPlayerNameValid("a".repeat(11), 10)).toBe(false);
        expect(isPlayerNameValid("a".repeat(21), 100)).toBe(false);
    });
});
