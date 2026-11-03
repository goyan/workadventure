import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Liên kết tài khoản Spotify để cho đồng nghiệp thấy bạn đang nghe gì.",
        link: "Liên kết Spotify",
        linking: "Đang chờ Spotify…",
        unlink: "Hủy liên kết",
        linked: "Tài khoản Spotify của bạn đã được liên kết.",
        share: "Chia sẻ những gì tôi đang nghe",
        serverAppNotice:
            "Nếu không có Client ID riêng, việc liên kết sẽ dùng ứng dụng Spotify của máy chủ này: hãy nhờ quản trị viên thêm tài khoản Spotify của bạn vào trước (tối đa 5 người).",
        accessDenied:
            "Spotify từ chối chia sẻ những gì bạn đang nghe: tài khoản của bạn chưa được đăng ký trong ứng dụng Spotify của máy chủ này. Hãy nhờ quản trị viên thêm vào (tối đa 5 người) hoặc dùng ứng dụng Spotify của riêng bạn.",
        errors: {
            popupBlocked: "Trình duyệt đã chặn cửa sổ Spotify. Hãy cho phép cửa sổ bật lên cho trang này rồi thử lại.",
            cancelled: "Cửa sổ Spotify đã bị đóng trước khi liên kết xong.",
            denied: "Bạn đã từ chối quyền truy cập trên Spotify.",
            failed: "Không thể liên kết Spotify. Hãy kiểm tra Client ID và URI chuyển hướng của ứng dụng Spotify.",
            noClientId:
                "Máy chủ này chưa cấu hình ứng dụng Spotify: hãy nhập Client ID của ứng dụng riêng của bạn bên dưới.",
        },
        personalApp: {
            title: "Dùng ứng dụng Spotify của riêng tôi",
            explanation:
                "Một ứng dụng Spotify chỉ chấp nhận năm người. Nếu ứng dụng của máy chủ này đã đầy, hãy tạo ứng dụng của riêng bạn trong vài phút:",
            step1: "Mở developer.spotify.com/dashboard và tạo một ứng dụng (cần tài khoản Spotify Premium).",
            step2: "Thêm URI chuyển hướng này: {redirectUri}",
            step3: 'Chọn "Web API", lưu lại, rồi dán Client ID của ứng dụng vào đây.',
            clientIdLabel: "Client ID của ứng dụng của tôi",
            clientIdPlaceholder: "Để trống để dùng ứng dụng của máy chủ này",
        },
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Nghe trên Spotify",
    },
    listeningZone: {
        defaultName: "Khu vực nghe nhạc",
        jamOf: "Jam của {name}",
        participants: "{count} người trong Jam",
        join: "Tham gia",
        joined: "Đang trong Jam",
        share: "Chia sẻ Jam của tôi",
        sharePlaceholder: "Dán liên kết mời tham gia Jam của bạn",
        invalidLink: "Đây không phải là liên kết mời tham gia Jam của Spotify.",
        submit: "Chia sẻ",
        cancel: "Hủy",
        stop: "Dừng chia sẻ",
        noJam: "Chưa có Jam nào được chia sẻ ở đây.",
        linkInvite: "Liên kết Spotify để chia sẻ những gì bạn đang nghe",
    },
};

export default spotify;
