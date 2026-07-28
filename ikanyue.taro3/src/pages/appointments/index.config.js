import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课程预约',
    enablePullDownRefresh: true,
    onReachBottomDistance: 100,
    ...immersivePageChrome,
});
