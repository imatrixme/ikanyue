import { canvasPageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '我的预约',
    enablePullDownRefresh: true,
    onReachBottomDistance: 100,
    ...canvasPageChrome,
});
