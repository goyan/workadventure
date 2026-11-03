import { expect, test, type Page } from "@playwright/test";
import Map from "./utils/map";
import { getPage } from "./utils/auth";
import { evaluateScript } from "./utils/scripting";
import { expectWebRtcConnectionsCountToBe } from "./utils/webRtc";
import { play_url, publicTestMapUrl } from "./utils/urls";

const MAP_URL = publicTestMapUrl("tests/E2E/empty.json", "bubble-listening");

// GROUP_RADIUS is 48 in the test environment: the edge of the bubble is heard up to one tile past it (BubbleListeners).
const AT_THE_EDGE = 70;
const FAR_AWAY = 200;

/** The volumes of the <audio> elements playing a remote MediaStream. */
const remoteAudioVolumes = (page: Page) =>
    page.evaluate(() =>
        Array.from(document.querySelectorAll("audio"))
            .filter((audio) => audio.srcObject instanceof MediaStream)
            .map((audio) => audio.volume),
    );

test.describe("Listening to a bubble from its edge @nowebkit @nofirefox", () => {
    test("is heard low from its edge, stops away from it, and its members see who listens", async ({ browser }) => {
        test.setTimeout(240_000);
        const url = new URL(MAP_URL, play_url).toString();
        await using alice = await getPage(browser, "Alice", url);
        await using bob = await getPage(browser, "Bob", url);
        await using charlie = await getPage(browser, "Charlie", url);

        const center = await evaluateScript(alice, async () => WA.player.getPosition());
        await Map.teleportToPosition(bob, center.x, center.y);
        await Map.teleportToPosition(charlie, center.x + FAR_AWAY, center.y);
        await expectWebRtcConnectionsCountToBe(alice, 1, 30_000);
        await expectWebRtcConnectionsCountToBe(charlie, 0);

        // Charlie stops at the edge: they hear both members, who are told discreetly
        await Map.teleportToPosition(charlie, center.x + AT_THE_EDGE, center.y);
        await expectWebRtcConnectionsCountToBe(charlie, 2, 30_000);
        await expectWebRtcConnectionsCountToBe(alice, 2, 30_000);
        await expect(alice.getByTestId("bubble-listening-hint")).toHaveText("Charlie can hear you", {
            timeout: 15_000,
        });
        await expect(bob.getByTestId("bubble-listening-hint")).toHaveText("Charlie can hear you");
        await expect(charlie.getByTestId("bubble-listening-hint")).toContainText("You overhear");
        // Charlie is not one of them: no video box, and the voices play low
        await expect(alice.getByTestId("Charlie")).toHaveCount(0);
        await expect
            .poll(() => remoteAudioVolumes(charlie), { timeout: 15_000 })
            .toEqual([expect.closeTo(0.15, 1), expect.closeTo(0.15, 1)]);

        // Charlie walks away: the conversation fades out for them
        await Map.teleportToPosition(charlie, center.x + FAR_AWAY, center.y);
        await expectWebRtcConnectionsCountToBe(charlie, 0, 30_000);
        await expectWebRtcConnectionsCountToBe(alice, 1, 30_000);
        await expect(alice.getByTestId("bubble-listening-hint")).toHaveCount(0);

        // Back at the edge, then in the bubble: Charlie becomes a member, not a listener anymore
        await Map.teleportToPosition(charlie, center.x + AT_THE_EDGE, center.y);
        await expectWebRtcConnectionsCountToBe(charlie, 2, 30_000);
        await Map.teleportToPosition(charlie, center.x, center.y);
        await expect(alice.getByTestId("bubble-listening-hint")).toHaveCount(0, { timeout: 30_000 });
        await expectWebRtcConnectionsCountToBe(alice, 2, 30_000);
        await expectWebRtcConnectionsCountToBe(charlie, 2, 30_000);
    });
});
