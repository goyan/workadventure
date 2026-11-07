import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "중앙",
        edgeColor: "테두리",
        wheelsColor: "바퀴",
        title: "탈것",
        none: "없음",
        skateboard: "스케이트보드",
        hint: "같은 방향을 빠르게 세 번 눌러 스케이트보드를 타거나 액션 휠에서 장착하세요.",
        mount: "스케이트보드 타기",
        dismount: "내리기",
    },
    customWoka: {
        color: "색상",
        defaultColor: "기본 색상",
        rotate: "아바타 회전",
        parts: {
            body: "몸",
            eyes: "눈",
            hair: "머리카락",
            clothes: "옷",
            hat: "모자",
            accessory: "액세서리",
        },
        bath: "수영복",
        bathHint: "물속과 수영장에서 한 칸 이내에서는 수영복을 입습니다.",
        title: "WOKA 만들기",
        navigation: {
            finish: "완료",
            backToDefaultWoka: "기본 WOKA로 돌아가기",
        },
        randomize: "무작위 생성",
    },
    selectWoka: {
        title: "WOKA를 선택하세요",
        continue: "계속하기",
        customize: "WOKA 만들기",
        randomize: "무작위 선택",
    },
    menu: {
        changeOutfit: "옷 갈아입기",
        swimwear: "수영복",
        actions: "내 아바타 행동",
        closeActions: "행동 닫기",
        profile: "프로필 보기",
        businessCard: "명함",
    },
    swimwear: {
        auto: "아바타에 맞게",
        shorts: "수영 반바지",
        twoPiece: "투피스 수영복",
    },
    actions: {
        idle: "중지",
        dance: "춤추기",
        coffee: "커피 마시기",
        sleep: "잠자기",
        toilet: "화장실 가기",
    },
    picker: {
        title: "누구를 선택하시겠습니까?",
        self: "{name} (나)",
    },
};

export default woka;
