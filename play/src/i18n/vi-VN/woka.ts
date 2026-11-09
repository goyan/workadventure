import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const woka: DeepPartial<Translation["woka"]> = {
    vehicle: {
        centerColor: "Phần giữa",
        edgeColor: "Viền",
        wheelsColor: "Bánh xe",
        title: "Phương tiện",
        none: "Không",
        skateboard: "Ván trượt",
        hint: "Nhấn nhanh một hướng ba lần để đi ván trượt, hoặc trang bị từ vòng hành động.",
        mount: "Lên ván trượt",
        dismount: "Xuống ván trượt",
    },
    customWoka: {
        color: "Màu sắc",
        defaultColor: "Màu mặc định",
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
        swimwearHint: "Mặc khi xuống nước",
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
        run: "Chạy bộ",
    },
    picker: {
        title: "Bạn muốn chọn ai?",
        self: "{name} (bạn)",
    },
};

export default woka;
