import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '积分明细',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
    onReachBottomDistance: 120,
});
