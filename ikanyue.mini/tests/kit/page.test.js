import { describe, expect, it, vi } from 'vitest';
import { definePage } from '../../miniprogram/kit/page.js';
import { same } from '../../miniprogram/kit/state.js';
import { mount } from './mount.js';

const twentyFields = () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, i]));

describe('definePage', () => {
    it('registers the page with computed values in the first data', () => {
        const options = definePage({
            data: () => ({ courses: [], loading: true, note: undefined }),
            computed: { empty: (d) => !d.loading && d.courses.length === 0 },
        });
        expect(Page).toHaveBeenCalledWith(options);
        expect(options.data).toEqual({ courses: [], loading: true, note: null, empty: false });
    });

    it('sends only the changed field and changed computed values', async () => {
        const page = mount(definePage({
            data: () => ({ ...twentyFields(), loading: true, courses: [] }),
            computed: {
                empty: (d) => !d.loading && d.courses.length === 0,
                total: (d) => d.courses.length,
                visible: (d) => d.courses.filter(Boolean),
            },
        }));
        await page.set({ loading: false });
        expect(page.setData).toHaveBeenCalledTimes(1);
        expect(page.setData.mock.calls[0][0]).toEqual({ loading: false, empty: true });
        await page.set({ f3: 3, loading: false });
        expect(page.setData).toHaveBeenCalledTimes(1);
    });

    it('replaces arrays and sends them when contents differ', async () => {
        const page = mount(definePage({ data: () => ({ items: [1, 2] }) }));
        await page.set({ items: [1, 2] });
        expect(page.setData).not.toHaveBeenCalled();
        await page.set({ items: [1, 2, 3], gone: undefined });
        expect(page.setData.mock.calls[0][0]).toEqual({ items: [1, 2, 3], gone: null });
    });

    it('binds form fields through data-field', async () => {
        const page = mount(definePage({ data: () => ({ name: '' }), computed: { ready: (d) => d.name.length > 0 } }));
        await page.onField({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '看乐' } });
        expect(page.data).toMatchObject({ name: '看乐', ready: true });
    });

    it('binds one nested level and tap values through data-field', async () => {
        const page = mount(definePage({ data: () => ({ form: { name: '', type: 'a' } }) }));
        const before = page.data.form;
        await page.onField({ currentTarget: { dataset: { field: 'form.name' } }, detail: { value: '看乐' } });
        await page.onField({ currentTarget: { dataset: { field: 'form.type', value: 'b' } }, detail: {} });
        expect(page.data.form).toEqual({ name: '看乐', type: 'b' });
        expect(before).toEqual({ name: '', type: 'a' });
    });

    it('flattens methods and passes lifecycles through', async () => {
        const onLoad = vi.fn(function onLoad() { return this.refresh(); });
        const page = mount(definePage({
            data: () => ({ n: 0 }),
            onLoad,
            methods: { refresh() { return this.set({ n: this.data.n + 1 }); } },
        }));
        await page.onLoad({ id: '1' });
        expect(onLoad).toHaveBeenCalledWith({ id: '1' });
        expect(page.data.n).toBe(1);
    });

    it('decodes the query before onLoad', () => {
        const onLoad = vi.fn();
        const page = mount(definePage({ onLoad }));
        page.onLoad({ courseName: '%E5%A3%B0%E4%B9%90%20%E8%AF%BE', bad: '%E5%A3', n: 1 });
        expect(onLoad).toHaveBeenCalledWith({ courseName: '声乐 课', bad: '%E5%A3', n: 1 });
        page.onLoad();
        expect(onLoad).toHaveBeenLastCalledWith({});
    });

    it('stops pull-down refresh after success and failure', async () => {
        const page = mount(definePage({ onPullDownRefresh: vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('x')) }));
        await page.onPullDownRefresh();
        expect(wx.stopPullDownRefresh).toHaveBeenCalledTimes(1);
        await expect(page.onPullDownRefresh()).rejects.toThrow('x');
        expect(wx.stopPullDownRefresh).toHaveBeenCalledTimes(2);
    });
});

describe('same', () => {
    it('compares one level deep', () => {
        const item = { id: 1 };
        expect(same([item], [item])).toBe(true);
        expect(same([{ id: 1 }], [{ id: 1 }])).toBe(false);
        expect(same({ a: item }, { a: item })).toBe(true);
        expect(same({ a: 1 }, { b: 1 })).toBe(false);
        expect(same({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(same(new Date(0), new Date(0))).toBe(false);
        expect(same(null, {})).toBe(false);
    });
});
