import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '我的课程点',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
