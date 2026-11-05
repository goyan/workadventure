/** Contenteditable fields can contain only line breaks, HTML wrappers or invisible characters. */
export function hasMessageContent(message: string): boolean {
    const template = document.createElement("template");
    template.innerHTML = message;
    return (
        Boolean(template.content.textContent?.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim()) ||
        template.content.querySelector("img, video, audio") !== null
    );
}
