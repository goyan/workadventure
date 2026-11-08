export enum ChristmasThemeMode {
    Auto = "auto",
    Always = "always",
    Never = "never",
}

/** In auto mode, the theme runs from December 1st to January 6th included, on the computer's local date. */
export function isChristmasActive(mode: ChristmasThemeMode, date: Date): boolean {
    if (mode === ChristmasThemeMode.Always) return true;
    if (mode === ChristmasThemeMode.Never) return false;
    const month = date.getMonth();
    return month === 11 || (month === 0 && date.getDate() <= 6);
}
