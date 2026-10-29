import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from '../../miniprogram/kit/component.js';
import { mount } from './mount.js';

describe('defineComponent', () => {
    it('maps props to properties and computes from prop defaults', () => {
        const options = defineComponent({
            props: { count: { type: Number, value: 2 }, title: String },
            data: () => ({ open: false }),
            computed: { label: (d) => `${d.title || '课时'} ${d.count}` },
        });
        expect(Component).toHaveBeenCalledWith(options);
        expect(options.properties).toEqual({ count: { type: Number, value: 2 }, title: String });
        expect(options.data).toEqual({ open: false, label: '课时 2' });
        expect(options.options).toMatchObject({ multipleSlots: true, styleIsolation: 'shared', virtualHost: true });
    });

    it('recomputes when props change and keeps a custom observer', () => {
        const custom = vi.fn();
        const options = defineComponent({
            props: { count: { type: Number, value: 0 }, title: { type: String, value: '' } },
            computed: { label: (d) => `${d.title}:${d.count}` },
            observers: { 'count, title': custom },
        });
        const component = mount(options);
        Object.assign(component.data, { count: 3, title: '剩余' });
        options.observers['count, title'].call(component, 3, '剩余');
        expect(component.setData.mock.calls[0][0]).toEqual({ label: '剩余:3' });
        expect(custom).toHaveBeenCalledWith(3, '剩余');
    });

    it('emits events to the parent and supports set/onField', async () => {
        const component = mount(defineComponent({ data: { text: '' }, methods: { close() { this.emit('close', { by: 'mask' }); } } }));
        component.close();
        expect(component.triggerEvent).toHaveBeenCalledWith('close', { by: 'mask' });
        await component.onField({ currentTarget: { dataset: { field: 'text' } }, detail: { value: 'hi' } });
        expect(component.data.text).toBe('hi');
    });

    it('skips the prop observer when nothing is computed', () => {
        const options = defineComponent({ props: { a: String } });
        expect(options.observers).toEqual({});
    });
});
