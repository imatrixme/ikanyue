import { canvasPageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '积分明细',
    enablePullDownRefresh: true,
    ...canvasPageChrome,
    onReachBottomDistance: 120,
});
