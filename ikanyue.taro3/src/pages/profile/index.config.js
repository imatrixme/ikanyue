import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '我的',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
