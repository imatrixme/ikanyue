import { definePage } from '../../kit/page.js';
import { nav, page } from '../../kit/api.js';

definePage({
    data: () => ({ imageUrl: '', imageError: false, statusText: '图片不存在' }),
    computed: {
        statusDescription: (d) => (d.imageError
            ? '图片暂时没有加载出来，返回活动页后可以稍后再试。'
            : '这张活动图片可能已经更新，返回活动页查看最新内容。'),
    },
    onLoad(query) {
        if (!query.imageUrl) return;
        this.set({ imageUrl: query.imageUrl });
        if (query.title) page.title(query.title);
    },
    methods: {
        handleImageError() {
            this.set({ imageError: true, statusText: '图片加载失败' });
        },
        goBack() {
            nav.back().catch(() => nav.tab('/pages/home/index'));
        },
    },
});
