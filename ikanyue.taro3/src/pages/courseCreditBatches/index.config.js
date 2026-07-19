import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课程点批次',
    enablePullDownRefresh: true,
    onReachBottomDistance: 120,
    ...immersivePageChrome,
});
