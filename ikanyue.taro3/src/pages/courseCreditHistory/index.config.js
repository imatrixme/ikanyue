import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课程点明细',
    enablePullDownRefresh: true,
    onReachBottomDistance: 120,
    ...immersivePageChrome,
});
