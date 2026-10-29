import { defineComponent } from '../../kit/component.js';

// Bottom sheet replacing NutUI Popup: <k-popup visible="{{open}}" panel-class="x" bind:close="onClose">…</k-popup>
defineComponent({
    props: {
        visible: { type: Boolean, value: false },
        closeOnOverlay: { type: Boolean, value: true },
        panelClass: { type: String, value: '' },
    },
    methods: {
        onOverlay() {
            if (this.data.closeOnOverlay) this.emit('close');
        },
        noop() {},
    },
});
