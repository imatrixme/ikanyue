export default defineAppConfig({
    pages: ['pages/profile/index', 'pages/pricing/index', 'pages/slogan/index', 'pages/userinfo/index'],
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
            // {
            //     pagePath: 'pages/slogan/index',
            //     iconPath: 'imgs/shouye.png',
            //     selectedIconPath: 'imgs/shouye-sel.png',
            //     text: '信息',
            // },
            {
                pagePath: 'pages/pricing/index',
                iconPath: 'imgs/pricing.png',
                selectedIconPath: 'imgs/pricing-sel.png',
                text: '价目',
            },
            {
                pagePath: 'pages/profile/index',
                iconPath: 'imgs/profile.png',
                selectedIconPath: 'imgs/profile-sel.png',
                text: '我的',
            },
        ],
    },
    networkTimeout: {
        request: 10000,
        downloadFile: 60000,
    },
});
