export function isTextEditingTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target.isContentEditable === true)
    );
}
