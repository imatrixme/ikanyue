import { definePage } from '../../kit/page.js';
import { nav, page } from '../../kit/api.js';

definePage({
    data: () => ({ loadError: '', url: '' }),
    onLoad(query) {
        if (query.url) this.set({ url: query.url });
        else this.set({ loadError: '活动报名链接可能已经更新，请返回活动页查看最新内容。' });
        if (query.title) page.title(query.title);
    },
    methods: {
        handleError(event) {
            console.error('web-view load failed', event.detail);
            this.set({ loadError: '检查网络后返回活动页重试。' });
        },
        goBack() {
            nav.back().catch(() => nav.tab('/pages/home/index'));
        },
    },
});
