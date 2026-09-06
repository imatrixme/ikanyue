import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '我的课时',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
