import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '我的课程',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
