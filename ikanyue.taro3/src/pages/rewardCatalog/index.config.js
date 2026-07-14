import { immersivePageChrome } from '../../styles/theme.mjs';

export default definePageConfig({
    navigationBarTitleText: '实物列表',
    enablePullDownRefresh: true,
    ...immersivePageChrome,
});
