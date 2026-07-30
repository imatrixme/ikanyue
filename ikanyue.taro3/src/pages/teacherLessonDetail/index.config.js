import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '课堂详情',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
