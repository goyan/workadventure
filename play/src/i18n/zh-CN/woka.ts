import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        rotate: "旋转角色",
        parts: {
            body: "身体",
            eyes: "眼睛",
            hair: "头发",
            clothes: "衣服",
            hat: "帽子",
            accessory: "配饰",
        },
        bath: "泳装",
        bathHint: "在水中或泳池一格范围内会穿上泳装。",
        title: "自定义你的WOKA",
        navigation: {
            finish: "完成",
            backToDefaultWoka: "返回默认WOKA",
        },
        randomize: "随机选择",
    },
    selectWoka: {
        title: "选择你的WOKA",
        continue: "继续",
        customize: "自定义你的 WOKA",
        randomize: "随机选择",
    },
    menu: {
        changeOutfit: "换衣服",
        swimwear: "泳装",
        actions: "我的角色动作",
        closeActions: "关闭动作菜单",
        profile: "查看个人资料",
        businessCard: "名片",
    },
    swimwear: {
        auto: "根据角色选择",
        shorts: "游泳短裤",
        twoPiece: "两件式泳装",
    },
    actions: {
        idle: "停止",
        dance: "跳舞",
        coffee: "喝咖啡",
        sleep: "睡觉",
        toilet: "上厕所",
    },
    picker: {
        title: "你想选择谁？",
        self: "{name}（你）",
    },
};

export default woka;
