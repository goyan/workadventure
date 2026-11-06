import { describe, expect, it } from "vitest";
import { formatReleaseNoteTime } from "../../src/common/ReleaseNotes";

describe("release note time", () => {
    // 2026-10-30 16:34:39 in Paris (UTC+1 after the clocks change)
    const date = "2026-10-30T16:34:39+01:00";

    it("shows the time in the viewer's language", () => {
        expect(formatReleaseNoteTime(date, "fr-FR", "Europe/Paris")).toContain("16:34");
    });

    it("uses the 12-hour clock where the language does", () => {
        expect(formatReleaseNoteTime(date, "en-US", "Europe/Paris")).toMatch(/4:34\s?PM/);
    });

    it("converts the time to the viewer's time zone", () => {
        expect(formatReleaseNoteTime(date, "fr-FR", "America/New_York")).toContain("11:34");
    });
});
