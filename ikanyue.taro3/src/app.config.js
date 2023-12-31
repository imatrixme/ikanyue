export default defineAppConfig({
    pages: [
        "pages/sch/index",
        "pages/schdetail/index",
        "pages/records/index",
        "pages/courses/index",
        "pages/profile/index",
        "pages/userinfo/index"
    ],
    window: {
        backgroundTextStyle: "light",
        navigationBarBackgroundColor: "#fff",
        navigationBarTitleText: "看乐艺术",
        navigationBarTextStyle: "black"
    },
    tabBar: {
        color: "#BFBFBF",
        selectedColor: "#F7931E",
        list: [
            {
                pagePath: "pages/sch/index",
                iconPath: "imgs/shouye.png",
                selectedIconPath: "imgs/shouye-sel.png",
                text: "排课"
            },
            {
                pagePath: "pages/records/index",
                iconPath: "imgs/record.png",
                selectedIconPath: "imgs/record-sel.png",
                text: "记录"
            },
            {
                pagePath: "pages/profile/index",
                iconPath: "imgs/profile.png",
                selectedIconPath: "imgs/profile-sel.png",
                text: "我的"
            }
        ]
    },
    networkTimeout: {
        request: 10000,
        downloadFile: 60000
    }
});
