import { describe, expect, it } from "vitest";
import { hasMessageContent } from "../../../src/front/Utils/MessageContent";

describe("hasMessageContent", () => {
    it.each(["", "  ", "\n", "<br>", "<div><br></div>", "<p>&nbsp;</p>", "&#8203;", "\u200B\uFEFF"])(
        "rejects empty content %j",
        (message) => expect(hasMessageContent(message)).toBe(false),
    );
    it.each(["bonjour", "<div>bonjour<br></div>", "😀", '<img src="example.png">', "[SPACE]"])(
        "preserves visible content %j",
        (message) => expect(hasMessageContent(message)).toBe(true),
    );
});
