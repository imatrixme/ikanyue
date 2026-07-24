import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课程日程',
    enablePullDownRefresh: true,
    onReachBottomDistance: 120,
    ...immersivePageChrome,
});
