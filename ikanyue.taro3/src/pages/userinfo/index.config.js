import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '个人资料',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
