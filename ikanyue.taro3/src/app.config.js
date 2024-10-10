export default defineAppConfig({
    pages: [
        'pages/slogan/index',
        // 'pages/sch/index',
        // 'pages/schdetail/index',
        // 'pages/records/index',
        // 'pages/courses/index',
        // 'pages/profile/index',
        // 'pages/userinfo/index',
        'pages/screen/index',
        'pages/pricing/index',
    ],
    window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '看乐艺术',
        navigationBarTextStyle: 'black',
    },
    // tabBar: {
    //     color: '#BFBFBF',
    //     selectedColor: '#F7931E',
    //     list: [
    //         {
    //             pagePath: 'pages/screen/index',
    //             iconPath: 'imgs/shouye.png',
    //             selectedIconPath: 'imgs/shouye-sel.png',
    //             text: '信息',
    //         },
    //         {
    //             pagePath: 'pages/pricing/index',
    //             iconPath: 'imgs/pricing.png',
    //             selectedIconPath: 'imgs/pricing-sel.png',
    //             text: '价目',
    //         },
    //     ],
    // },
    networkTimeout: {
        request: 10000,
        downloadFile: 60000,
    },
});
