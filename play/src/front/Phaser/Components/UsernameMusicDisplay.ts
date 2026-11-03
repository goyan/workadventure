import { MEGAPHONE_ICON_SIZE } from "./UsernameDisplaySizes";

const ICON_SIZE = `calc(${MEGAPHONE_ICON_SIZE}px * var(--username-dom-scale, 1))`;

/**
 * A music note bobbing next to the player's name while they share what they listen to on Spotify. It lives in the
 * username pill like {@link UsernameRaisedHandDisplay}, but keeps moving for as long as the music plays.
 */
export class UsernameMusicDisplay {
    public readonly element: HTMLSpanElement;

    private shown = false;
    private animation?: Animation;

    constructor() {
        this.element = document.createElement("span");
        this.element.textContent = "♫";
        this.element.setAttribute("aria-hidden", "true");
        this.element.style.display = "none";
        this.element.style.flex = "0 0 auto";
        this.element.style.width = ICON_SIZE;
        this.element.style.height = ICON_SIZE;
        this.element.style.lineHeight = ICON_SIZE;
        this.element.style.fontSize = ICON_SIZE;
        this.element.style.textAlign = "center";
        this.element.style.color = "#1ed760";
        this.element.style.marginLeft = `calc(-2px * var(--username-dom-scale, 1))`;
        this.element.style.pointerEvents = "none";
        this.element.style.userSelect = "none";
    }

    public show(show: boolean): void {
        if (this.shown === show) {
            return;
        }
        this.shown = show;
        this.animation?.cancel();
        this.animation = undefined;

        if (!show) {
            this.element.style.display = "none";
            return;
        }
        this.element.style.display = "";
        this.animation = this.element.animate(
            [
                { transform: "translateY(0) rotate(-8deg)" },
                { transform: "translateY(calc(-2px * var(--username-dom-scale, 1))) rotate(8deg)" },
                { transform: "translateY(0) rotate(-8deg)" },
            ],
            { duration: 1200, iterations: Infinity, easing: "ease-in-out" },
        );
    }

    public destroy(): void {
        this.animation?.cancel();
        this.element.remove();
    }
}
