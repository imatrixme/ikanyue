import { defineComponent } from '../../kit/component.js';

// Only for pages whose title carries content (course or lesson names); the native bar already names every page.
defineComponent({
    props: {
        centered: { type: Boolean, value: false },
        subtitle: { type: String, value: '' },
        title: { type: String, value: '' },
        extClass: { type: String, value: '' },
    },
});
