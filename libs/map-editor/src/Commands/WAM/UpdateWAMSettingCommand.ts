import type { UpdateWAMSettingsMessage } from "@workadventure/messages";
import type { WAMFileFormat, WAMSettings } from "../../types";
import { MegaphoneSettings, PrefabOverride, RecordingSettings } from "../../types";
import { Command } from "../Command";

export class UpdateWAMSettingCommand extends Command {
    protected readonly oldConfig: WAMSettings | undefined;
    constructor(
        protected wam: WAMFileFormat,
        protected updateWAMSettingsMessage: UpdateWAMSettingsMessage,
        id?: string,
    ) {
        super(id);
        this.oldConfig = structuredClone(this.wam.settings);
    }

    execute(): Promise<void> {
        if (this.wam.settings === undefined) {
            this.wam.settings = {};
        }

        const message: UpdateWAMSettingsMessage["message"] = this.updateWAMSettingsMessage.message;
        if (message === undefined) {
            console.warn("Empty settings message received");
            return Promise.resolve();
        }
        switch (message.$case) {
            case "updateMegaphoneSettingMessage": {
                this.wam.settings.megaphone = MegaphoneSettings.optional().parse(
                    message.updateMegaphoneSettingMessage.settings,
                );
                break;
            }
            case "updateRecordingSettingMessage": {
                this.wam.settings.recording = RecordingSettings.optional().parse(
                    message.updateRecordingSettingMessage.settings,
                );
                break;
            }
            case "updatePrefabOverrideSettingMessage": {
                const prefabId = message.updatePrefabOverrideSettingMessage.prefabId;
                const override: unknown = message.updatePrefabOverrideSettingMessage.override;
                const others = Object.fromEntries(
                    Object.entries(this.wam.settings.prefabOverrides ?? {}).filter(([id]) => id !== prefabId),
                );
                this.wam.settings.prefabOverrides =
                    override === undefined || override === null
                        ? others
                        : { ...others, [prefabId]: PrefabOverride.parse(override) };
                break;
            }
            default: {
                const _exhaustiveCheck: never = message;
            }
        }
        return Promise.resolve();
    }

    /*undo(): Promise<void> {
        if (this.wam.settings === undefined) {
            this.wam.settings = {};
        }
        if (this.name === "megaphone") {
            this.wam.settings.megaphone = this.oldConfig;
        }
        return Promise.resolve();
    }*/
}
