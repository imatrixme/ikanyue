import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课时记录',
    enablePullDownRefresh: true,
    onReachBottomDistance: 120,
    ...immersivePageChrome,
});
