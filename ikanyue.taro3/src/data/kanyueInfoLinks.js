const IMAGE_DETAIL_URLS = Object.freeze({
    about: 'https://kyoss.abcmem.com/ikanyue-public/guanyu-kanyue.JPG',
    learnWhat: 'https://kyoss.abcmem.com/ikanyue-public/zai-kanyue-xue-shenme.JPG',
});

const KANYUE_INFO_LINKS = Object.freeze([
    Object.freeze({
        description: '课程内容与学习方式',
        detailTitle: '看乐教学',
        icon: 'account-teaching',
        id: 'teaching',
        imageUrl: IMAGE_DETAIL_URLS.learnWhat,
        title: '看乐教学',
    }),
    Object.freeze({
        description: '认识看乐艺术',
        detailTitle: '关于看乐',
        icon: 'account-about',
        id: 'about',
        imageUrl: IMAGE_DETAIL_URLS.about,
        title: '关于看乐',
    }),
]);

const buildImageDetailUrl = (link) => {
    if (!link?.imageUrl) {
        return '';
    }

    const params = [`imageUrl=${encodeURIComponent(link.imageUrl)}`];
    if (link.detailTitle) {
        params.push(`title=${encodeURIComponent(link.detailTitle)}`);
    }
    return `/pages/imageDetail/index?${params.join('&')}`;
};

export { IMAGE_DETAIL_URLS, KANYUE_INFO_LINKS, buildImageDetailUrl };
