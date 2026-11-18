export const MIN_PLAYER_NAME_LENGTH = 3;
export const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_PLAYER_NAME_WORDS = 3;
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
    if (typeof value !== "string") return false;
    const name = value.normalize("NFC");
    const words = name.split(" ");
    return (
        name.length >= MIN_PLAYER_NAME_LENGTH &&
        name.length <= Math.min(maxLength, MAX_PLAYER_NAME_LENGTH) &&
        name.trim() === name &&
        words.length <= MAX_PLAYER_NAME_WORDS &&
        words.every((word) => word.length >= 2) &&
        /^[\p{Script=Latin}0-9]+(?:[-_ ][\p{Script=Latin}0-9]+)*$/u.test(name) &&
        !/\p{Default_Ignorable_Code_Point}/u.test(name)
    );
}

export function normalizePlayerName(value: unknown, maxLength = MAX_PLAYER_NAME_LENGTH): string {
    if (isPlayerNameValid(value, maxLength)) return value.normalize("NFC");
    const length = Math.max(MIN_PLAYER_NAME_LENGTH, Math.min(maxLength, MAX_PLAYER_NAME_LENGTH));
    const name = FUNNY_PLAYER_NAMES[Math.floor(Math.random() * FUNNY_PLAYER_NAMES.length)] ?? "PandaZen";
    const suffix = Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, "0");
    return `${name.slice(0, length - suffix.length)}${suffix}`;
}
