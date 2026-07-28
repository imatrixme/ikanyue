import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '预约课程',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
