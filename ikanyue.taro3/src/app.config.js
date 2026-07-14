export default defineAppConfig({
    pages: [
        'pages/activity/index',
        'pages/points/index',
        'pages/pointsHistory/index',
        'pages/rewardCatalog/index',
        'pages/profile/index',
        'pages/userinfo/index',
        'pages/activityDetail/index',
        'pages/imageDetail/index',
        'pages/webview/index',
    ],
    window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '看乐艺术',
        navigationBarTextStyle: 'black',
    },
    tabBar: {
        color: '#626262',
        selectedColor: '#e60012',
        backgroundColor: '#ffffff',
        borderStyle: 'black',
        list: [
            {
                pagePath: 'pages/activity/index',
                iconPath: 'imgs/icons/tab-activity.png',
                selectedIconPath: 'imgs/icons/tab-activity-selected.png',
                text: '活动',
            },
            {
                pagePath: 'pages/points/index',
                iconPath: 'imgs/icons/tab-points.png',
                selectedIconPath: 'imgs/icons/tab-points-selected.png',
                text: '积分',
            },
            {
                pagePath: 'pages/profile/index',
                iconPath: 'imgs/icons/tab-profile.png',
                selectedIconPath: 'imgs/icons/tab-profile-selected.png',
                text: '我的',
            },
        ],
    },
    networkTimeout: {
        request: 10000,
        downloadFile: 60000,
    },
});
