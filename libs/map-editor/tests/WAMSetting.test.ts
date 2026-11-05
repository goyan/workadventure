import { describe, expect, it } from "vitest";
import { UpdateWAMSettingCommand, type WAMFileFormat } from "../src";

describe("WAM Setting", () => {
    const defaultWamFile: WAMFileFormat = {
        version: "1.0.0",
        mapUrl: "testMapUrl",
        entities: {},
        areas: [],
        entityCollections: [],
    };
    const dataToModify = {
        enabled: true,
        title: "testTitle",
        rights: ["testRights"],
        scope: "testScope",
        audienceVideoFeedbackActivated: false,
        recording: {
            enabled: true,
            rights: ["testRecordingRights"],
        },
    };
    it("should change WAM file loaded when WAMSettingCommand received", async () => {
        const wamFile: WAMFileFormat = { ...defaultWamFile };
        const command = new UpdateWAMSettingCommand(
            wamFile,
            {
                message: {
                    $case: "updateMegaphoneSettingMessage",
                    updateMegaphoneSettingMessage: { settings: dataToModify },
                },
            },
            "test-uuid",
        );
        await command.execute();
        expect(wamFile?.settings?.megaphone).toEqual(dataToModify);
    });

    it("should update recording settings when recording command received", async () => {
        const wamFile: WAMFileFormat = { ...defaultWamFile };
        const recordingData = {
            enableSounds: true,
            rights: ["tag-a", "tag-b"],
        };
        const command = new UpdateWAMSettingCommand(
            wamFile,
            {
                message: {
                    $case: "updateRecordingSettingMessage",
                    updateRecordingSettingMessage: { settings: recordingData },
                },
            },
            "test-recording-uuid",
        );
        await command.execute();
        expect(wamFile?.settings?.recording).toEqual(recordingData);
    });

    it("adjusts a library object for the map, then restores it, leaving the other adjustments alone", async () => {
        const wamFile: WAMFileFormat = {
            ...defaultWamFile,
            settings: { prefabOverrides: { lamp: { layer: "overhead" } } },
        };
        const pool = { layer: "floor", water: [{ x: 4, y: 4, width: 40, height: 20 }] };
        const adjust = (override: unknown) =>
            new UpdateWAMSettingCommand(
                wamFile,
                {
                    message: {
                        $case: "updatePrefabOverrideSettingMessage",
                        updatePrefabOverrideSettingMessage: { prefabId: "pool", override },
                    },
                },
                "test-uuid",
            ).execute();

        await adjust(pool);
        expect(wamFile.settings?.prefabOverrides).toEqual({ lamp: { layer: "overhead" }, pool });

        await adjust(undefined);
        expect(wamFile.settings?.prefabOverrides).toEqual({ lamp: { layer: "overhead" } });

        await expect(Promise.resolve().then(() => adjust({ layer: "ceiling" }))).rejects.toThrow();
    });
});
