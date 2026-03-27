## 1. Home Labels And Entry Definitions

- [x] 1.1 Update `src/app.config.js` and `src/pages/activity/index.config.js` so the first tab and page title display as “首页”, and register the new image detail page route.
- [x] 1.2 Update `src/pages/activity/index.vue` date group definitions so “一周后” becomes “学什么” and “已结束” becomes “关于看乐”, with navigation metadata for their target image URLs.

## 2. Home Navigation And Image Detail

- [x] 2.1 Adjust the home page group click handler so “学什么” and “关于看乐” navigate with an encoded `imageUrl` parameter and do not change the current activity filter content.
- [x] 2.2 Create the image detail page files to decode `imageUrl`, render the remote image, and handle missing or failed image parameters gracefully.

## 3. Verification

- [x] 3.1 Manually verify in WeChat devtools and H5 that the first tab shows “首页”, the two static entries jump to the correct placeholder images, and the remaining date groups still filter activity content.
