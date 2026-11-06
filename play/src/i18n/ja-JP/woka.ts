import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        color: "色",
        defaultColor: "既定の色",
        rotate: "アバターを回転",
        parts: {
            body: "体",
            eyes: "目",
            hair: "髪",
            clothes: "服",
            hat: "帽子",
            accessory: "アクセサリー",
        },
        bath: "水着",
        bathHint: "水中とプールから1マス以内では水着を着用します。",
        title: "WOKA をカスタマイズします",
        navigation: {
            finish: "完了",
            backToDefaultWoka: "標準の WOKA に戻す",
        },
        randomize: "ランダム選択",
    },
    selectWoka: {
        title: "WOKA を選択してください",
        continue: "続ける",
        customize: "WOKA のカスタマイズ",
        randomize: "ランダムに選択する",
    },
    menu: {
        changeOutfit: "着替える",
        swimwear: "水着",
        actions: "自分のアバターのアクション",
        closeActions: "アクションを閉じる",
        profile: "プロフィールを表示",
        businessCard: "名刺",
    },
    swimwear: {
        auto: "アバターに合わせる",
        shorts: "水泳用ショートパンツ",
        twoPiece: "セパレート水着",
    },
    actions: {
        idle: "停止",
        dance: "ダンス",
        coffee: "コーヒーを飲む",
        sleep: "眠る",
        toilet: "トイレに行く",
    },
    picker: {
        title: "誰を選択しますか？",
        self: "{name}（あなた）",
    },
};

export default woka;
