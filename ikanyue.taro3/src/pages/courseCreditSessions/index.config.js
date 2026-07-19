import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课次与预约',
    enablePullDownRefresh: true,
    onReachBottomDistance: 120,
    ...immersivePageChrome,
});
