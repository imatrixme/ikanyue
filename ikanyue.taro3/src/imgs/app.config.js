export default defineAppConfig({
    pages: [
        'pages/sch/index',
        'pages/schdetail/index',
        'pages/records/index',
        'pages/courses/index',
        'pages/profile/index',
        'pages/userinfo/index',
    ],
    window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '看乐艺术',
        navigationBarTextStyle: 'black',
    },
    tabBar: {
        color: '#BFBFBF',
        selectedColor: '#F7931E',
        list: [
            {
                pagePath: 'pages/sch/index',
                iconPath: 'imgs/shouye.png',
                selectedIconPath: 'imgs/shouye-sel.png',
                text: '排课',
            },
            {
                pagePath: 'pages/pricing/index',
                iconPath: 'imgs/pricing.png',
                selectedIconPath: 'imgs/pricing-sel.png',
                text: '价目',
            },
        ],
    },
    networkTimeout: {
        request: 10000,
        downloadFile: 60000,
    },
});
