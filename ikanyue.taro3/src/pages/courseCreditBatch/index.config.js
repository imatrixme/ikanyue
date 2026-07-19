import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '批次详情',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
