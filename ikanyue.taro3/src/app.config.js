export default defineAppConfig({
    pages: [
        'pages/slogan/index',
        'pages/activity/index',
        'pages/profile/index',
        'pages/pricing/index',
        'pages/userinfo/index',
        'pages/activityDetail/index',
        'pages/webview/index',
    ],
    window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '看乐艺术',
        navigationBarTextStyle: 'black',
    },
    tabBar: {
        color: '#666',
        selectedColor: '#FF4949',
        backgroundColor: '#fafafa',
        borderStyle: 'black',
        list: [
            {
                pagePath: 'pages/slogan/index',
                iconPath: 'imgs/shouye.png',
                selectedIconPath: 'imgs/shouye-sel.png',
                text: '首页',
            },
            {
                pagePath: 'pages/activity/index',
                iconPath: 'imgs/record.png',
                selectedIconPath: 'imgs/record-sel.png',
                text: '活动',
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
