import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课程订单',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
