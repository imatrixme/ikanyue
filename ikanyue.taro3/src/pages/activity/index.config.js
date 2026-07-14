import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '活动',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
