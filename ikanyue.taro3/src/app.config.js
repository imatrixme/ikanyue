export default defineAppConfig({
    pages: [
        'pages/points/index',
        'pages/profile/index',
    ],
    window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '看乐积分',
        navigationBarTextStyle: 'black',
    },
    tabBar: {
        color: '#666',
        selectedColor: '#FF4949',
        backgroundColor: '#fafafa',
        borderStyle: 'black',
        list: [
            {
                pagePath: 'pages/points/index',
                iconPath: 'imgs/record.png',
                selectedIconPath: 'imgs/record-sel.png',
                text: '积分',
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
