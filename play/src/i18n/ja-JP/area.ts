import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const area: DeepPartial<Translation["area"]> = {
    noAccess: "申し訳ありませんが、このエリアへのアクセス権がありません。",
    blocked: {
        locked: "このエリアはロックされています。入ることができません。",
        maxUsers: "このエリアは満員です。入ることができません。",
        noAccess: "申し訳ありませんが、このエリアへのアクセス権がありません。",
        unlockWithTrigger: "{trigger}でこのエリアのロックを解除します。",
    },
    knock: {
        prompt: "{trigger} to knock.",
        waiting: "You knocked, waiting…",
        later: "Not now.",
        noAnswer: "Nobody answers.",
        opened: "{name} opens the door for you.",
        request: "{name} is knocking at the door",
        enter: "Let in",
        notNow: "Not now",
    },
    personalArea: {
        claimDescription: "ここはパーソナルエリアです。あなたのパーソナルエリアにしたいですか？",
        buttons: {
            yes: "はい",
            no: "いいえ",
            confirm: "確認",
        },
        personalSpaceWithNames: "{name} のパーソナルエリア",
        alreadyHavePersonalArea: "すでにパーソナルエリアを持っています。続行すると削除されます。",
    },
};

export default area;
