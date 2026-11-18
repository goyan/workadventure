export const MIN_PLAYER_NAME_LENGTH = 3;
export const MAX_PLAYER_NAME_LENGTH = 20;
const FUNNY_PLAYER_NAMES = [
    "PandaZen",
    "KiwiFou",
    "ChatDisco",
    "KoalaPop",
    "LamaCool",
    "PouleRock",
    "TigreMou",
    "PandaFunk",
];

export function isPlayerNameValid(value: unknown, maxLength = MAX_PLAYER_NAME_LENGTH): value is string {
    return (
        typeof value === "string" &&
        value.length >= MIN_PLAYER_NAME_LENGTH &&
        value.length <= Math.min(maxLength, MAX_PLAYER_NAME_LENGTH) &&
        /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(value) &&
        !/\p{Default_Ignorable_Code_Point}/u.test(value)
    );
}

export function normalizePlayerName(value: unknown, maxLength = MAX_PLAYER_NAME_LENGTH): string {
    if (isPlayerNameValid(value, maxLength)) return value;
    const length = Math.max(MIN_PLAYER_NAME_LENGTH, Math.min(maxLength, MAX_PLAYER_NAME_LENGTH));
    const name = FUNNY_PLAYER_NAMES[Math.floor(Math.random() * FUNNY_PLAYER_NAMES.length)] ?? "PandaZen";
    const suffix = Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, "0");
    return `${name.slice(0, length - suffix.length)}${suffix}`;
}
