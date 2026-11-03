import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({ FRONT_URL: "" }));

import { getFrontOrigin } from "../../src/pusher/controllers/SpotifyCallbackController";

describe("getFrontOrigin", () => {
    it("returns the origin of an absolute FRONT_URL", () => {
        expect(getFrontOrigin("https://play.example.com/some/path")).toBe("https://play.example.com");
    });

    it("falls back to the page origin for a relative or empty FRONT_URL", () => {
        expect(getFrontOrigin("/")).toBe("");
        expect(getFrontOrigin("")).toBe("");
    });
});
