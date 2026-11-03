import type { Request, Response } from "express";
import { FRONT_URL } from "../enums/EnvironmentVariable";
import { SPOTIFY_AUTHORIZATION_MESSAGE_TYPE, SPOTIFY_CALLBACK_PATH } from "../../common/SpotifyCallback";
import { BaseHttpController } from "./BaseHttpController";

/**
 * Landing page of the Spotify authorization popup. The front exchanges the code itself (PKCE, no client secret):
 * this page only hands the query string back to the WorkAdventure window that opened it, then closes.
 */
export class SpotifyCallbackController extends BaseHttpController {
    routes(): void {
        this.app.get(SPOTIFY_CALLBACK_PATH, (_req: Request, res: Response) => {
            res.setHeader("Cache-Control", "no-store");
            res.type("html").send(this.renderPage());
        });
    }

    private renderPage(): string {
        // An empty FRONT_URL means the front is served by this same origin.
        const targetOrigin = JSON.stringify(FRONT_URL ? new URL(FRONT_URL).origin : "");
        const messageType = JSON.stringify(SPOTIFY_AUTHORIZATION_MESSAGE_TYPE);
        return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Spotify</title></head>
<body>
<script>
    if (window.opener) {
        window.opener.postMessage(
            { type: ${messageType}, search: window.location.search },
            ${targetOrigin} || window.location.origin,
        );
    }
    window.close();
</script>
</body>
</html>`;
    }
}
