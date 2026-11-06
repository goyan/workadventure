import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    customWoka: {
        rotate: "Xoay nhân vật",
        parts: {
            body: "Cơ thể",
            eyes: "Mắt",
            hair: "Tóc",
            clothes: "Quần áo",
            hat: "Mũ",
            accessory: "Phụ kiện",
        },
        bath: "Đồ bơi",
        bathHint: "Đồ bơi được mặc khi ở dưới nước hoặc cách hồ bơi tối đa một ô.",
        title: "Tạo WOKA của bạn",
        navigation: {
            finish: "Hoàn tất",
            backToDefaultWoka: "Quay về WOKA mặc định",
        },
        randomize: "Ngẫu nhiên",
    },
    selectWoka: {
        title: "Chọn WOKA của bạn",
        continue: "Tiếp tục",
        customize: "Tạo WOKA của bạn",
        randomize: "Chọn ngẫu nhiên",
    },
    menu: {
        changeOutfit: "Thay quần áo",
        swimwear: "Đồ bơi",
        actions: "Hành động của nhân vật",
        closeActions: "Đóng hành động",
        profile: "Xem hồ sơ",
        businessCard: "Danh thiếp",
    },
    swimwear: {
        auto: "Theo nhân vật",
        shorts: "Quần bơi",
        twoPiece: "Đồ bơi hai mảnh",
    },
    actions: {
        idle: "Dừng",
        dance: "Nhảy múa",
        coffee: "Uống cà phê",
        sleep: "Ngủ",
        toilet: "Đi vệ sinh",
    },
    picker: {
        title: "Bạn muốn chọn ai?",
        self: "{name} (bạn)",
    },
};

export default woka;
