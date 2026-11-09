import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "中間",
        edgeColor: "邊緣",
        wheelsColor: "輪子",
        title: "載具",
        none: "無",
        skateboard: "滑板",
        hint: "快速按同一方向三次以使用滑板，或透過動作輪盤裝備。",
        mount: "踩上滑板",
        dismount: "下來",
    },
    customWoka: {
        color: "顏色",
        defaultColor: "預設顏色",
        rotate: "旋轉角色",
        parts: {
            body: "身體",
            eyes: "眼睛",
            hair: "頭髮",
            clothes: "衣服",
            hat: "帽子",
            accessory: "配件",
        },
        bath: "泳裝",
        bathHint: "在水中或泳池一格範圍內會穿上泳裝。",
        title: "自訂你的 WOKA",
        navigation: {
            finish: "完成",
            backToDefaultWoka: "返回預設 WOKA",
        },
        randomize: "隨機選擇",
    },
    selectWoka: {
        title: "選擇你的 WOKA",
        continue: "繼續",
        customize: "自訂你的 WOKA",
        randomize: "隨機選擇",
    },
    menu: {
        changeOutfit: "換衣服",
        swimwear: "泳裝",
        swimwearDetail: "（在泳池附近顯示）",
        actions: "我的角色動作",
        closeActions: "關閉動作選單",
        profile: "查看個人資料",
        businessCard: "名片",
    },
    swimwear: {
        auto: "依角色選擇",
        shorts: "游泳短褲",
        twoPiece: "兩件式泳裝",
    },
    actions: {
        idle: "停止",
        dance: "跳舞",
        coffee: "喝咖啡",
        sleep: "睡覺",
        toilet: "上廁所",
        run: "跑步",
    },
    picker: {
        title: "你想選擇誰？",
        self: "{name}（你）",
    },
};

export default woka;
