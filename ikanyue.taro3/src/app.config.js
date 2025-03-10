export default defineAppConfig({
    pages: ['pages/pricing/index', 'pages/slogan/index'],
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
                pagePath: 'pages/slogan/index',
                iconPath: 'imgs/shouye.png',
                selectedIconPath: 'imgs/shouye-sel.png',
                text: '信息',
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
