/**
 * The code a player copies to hand all their light settings to another at once: a prefix, then the settings as JSON in
 * base64url, so that it survives a chat message. Reading it never trusts it: only the settings known here, each of its
 * own kind, are kept (see acceptedLightSettings).
 */
export const LIGHT_SETTINGS_CODE_PREFIX = "LUM1-";

export type LightSettingValue = number | boolean | string;
export type LightSettingKind = { kind: "number" } | { kind: "switch" } | { kind: "choice"; choices: readonly string[] };
export type LightSettingKinds = Readonly<Record<string, LightSettingKind>>;

export function encodeLightSettings(settings: Readonly<Record<string, LightSettingValue>>): string {
    const base64 = btoa(JSON.stringify(settings));
    return LIGHT_SETTINGS_CODE_PREFIX + base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The settings a code carries, or undefined when it is not such a code. Spaces and line breaks are ignored. */
export function decodeLightSettings(code: string): Record<string, unknown> | undefined {
    const compact = code.replace(/\s+/g, "");
    if (!compact.startsWith(LIGHT_SETTINGS_CODE_PREFIX)) {
        return undefined;
    }
    const base64 = compact.slice(LIGHT_SETTINGS_CODE_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
    try {
        const parsed: unknown = JSON.parse(atob(base64));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return undefined;
        }
        return { ...parsed };
    } catch {
        return undefined;
    }
}

/** The settings of a code that can be applied: the ones known, each of its own kind. The others are left out. */
export function acceptedLightSettings(
    settings: Readonly<Record<string, unknown>>,
    kinds: LightSettingKinds,
): Record<string, LightSettingValue> {
    const accepted: Record<string, LightSettingValue> = {};
    for (const [name, kind] of Object.entries(kinds)) {
        const value = settings[name];
        if (kind.kind === "number" && typeof value === "number" && Number.isFinite(value)) {
            accepted[name] = value;
        } else if (kind.kind === "switch" && typeof value === "boolean") {
            accepted[name] = value;
        } else if (kind.kind === "choice" && typeof value === "string" && kind.choices.includes(value)) {
            accepted[name] = value;
        }
    }
    return accepted;
}
