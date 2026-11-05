import {
    MegaphoneSettings,
    UpdateWAMSettingCommand,
    type WAMFileFormat,
    WAMSettingsUtils,
} from "@workadventure/map-editor";

import type { UpdateWAMSettingsMessage } from "@workadventure/messages/src/ts-proto-generated/messages";
import type { FrontCommandInterface } from "../FrontCommandInterface";
import type { RoomConnection } from "../../../../../Connection/RoomConnection";
import { localUserStore } from "../../../../../Connection/LocalUserStore";
import { gameManager } from "../../../GameManager";
import { megaphoneCanBeUsedStore, megaphoneSpaceSettingsStore } from "../../../../../Stores/MegaphoneStore";

export class UpdateWAMSettingFrontCommand extends UpdateWAMSettingCommand implements FrontCommandInterface {
    public constructor(
        wam: WAMFileFormat,
        updateWAMSettingsMessage: UpdateWAMSettingsMessage,
        private userTags: string[],
        private roomUrl: string,
        id?: string,
    ) {
        super(wam, updateWAMSettingsMessage, id);
    }

    public getUndoCommand(): UpdateWAMSettingFrontCommand {
        if (this.updateWAMSettingsMessage.message?.$case === "updateMegaphoneSettingMessage") {
            const previousMegaphone = this.oldConfig?.megaphone;
            return new UpdateWAMSettingFrontCommand(
                this.wam,
                {
                    message: {
                        $case: "updateMegaphoneSettingMessage",
                        updateMegaphoneSettingMessage: {
                            settings: previousMegaphone ? { ...previousMegaphone } : undefined,
                        },
                    },
                },
                this.userTags,
                this.roomUrl,
            );
        }
        if (this.updateWAMSettingsMessage.message?.$case === "updateRecordingSettingMessage") {
            const previousRecording = this.oldConfig?.recording;
            return new UpdateWAMSettingFrontCommand(
                this.wam,
                {
                    message: {
                        $case: "updateRecordingSettingMessage",
                        updateRecordingSettingMessage: {
                            settings: previousRecording ? { ...previousRecording } : undefined,
                        },
                    },
                },
                this.userTags,
                this.roomUrl,
            );
        }

        if (this.updateWAMSettingsMessage.message?.$case === "updatePrefabOverrideSettingMessage") {
            const { prefabId } = this.updateWAMSettingsMessage.message.updatePrefabOverrideSettingMessage;
            const previous = this.oldConfig?.prefabOverrides?.[prefabId];
            return new UpdateWAMSettingFrontCommand(
                this.wam,
                {
                    message: {
                        $case: "updatePrefabOverrideSettingMessage",
                        updatePrefabOverrideSettingMessage: {
                            prefabId,
                            override: previous ? structuredClone(previous) : undefined,
                        },
                    },
                },
                this.userTags,
                this.roomUrl,
            );
        }

        return this;
    }

    public async execute(): Promise<void> {
        await super.execute();

        if (this.updateWAMSettingsMessage.message?.$case === "updatePrefabOverrideSettingMessage") {
            this.applyPrefabOverride(this.updateWAMSettingsMessage.message.updatePrefabOverrideSettingMessage.prefabId);
            return;
        }

        const message: UpdateWAMSettingsMessage["message"] = this.updateWAMSettingsMessage.message;
        if (message?.$case === "updateMegaphoneSettingMessage" || message?.$case === "updateRecordingSettingMessage") {
            const megaphoneSettings = MegaphoneSettings.optional().parse(this.wam.settings?.megaphone);

            megaphoneCanBeUsedStore.set(WAMSettingsUtils.canUseMegaphone(this.wam.settings, this.userTags));

            const megaphoneSpaceName = WAMSettingsUtils.getMegaphoneUrl(
                this.wam.settings,
                new URL(this.roomUrl).host,
                this.roomUrl,
            );
            if (!megaphoneSpaceName || !megaphoneSettings) {
                megaphoneSpaceSettingsStore.set(undefined);
            } else {
                megaphoneSpaceSettingsStore.set({
                    spaceName: megaphoneSpaceName,
                    audienceVideoFeedbackActivated: megaphoneSettings.audienceVideoFeedbackActivated ?? false,
                    canRecord: WAMSettingsUtils.canStartRecordingMegaphone(
                        this.wam.settings,
                        this.userTags,
                        localUserStore.isLogged(),
                    ),
                });
            }
        }
    }

    /** Every copy of the object on the map takes the adjustment now stored in the WAM file. */
    private applyPrefabOverride(prefabId: string): void {
        const scene = gameManager.getCurrentGameScene();
        const modification = scene
            .getEntitiesCollectionsManager()
            .setPrefabOverride(prefabId, this.wam.settings?.prefabOverrides?.[prefabId]);
        if (!modification) return;
        scene.getGameMapFrontWrapper().getEntitiesManager().updateEntitiesPrefab(prefabId, modification);
        scene.getGameMapFrontWrapper().recomputeEntitiesCollisionGrid();
    }

    public emitEvent(roomConnection: RoomConnection): void {
        roomConnection.emitUpdateWAMSettingMessage(this.commandId, this.updateWAMSettingsMessage);
    }
}
