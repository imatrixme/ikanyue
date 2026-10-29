import { vi } from 'vitest';

// Builds a page or component instance the way the runtime would: own copy of data, setData merging top-level keys.
export function mount(options) {
    const instance = { ...options, ...(options.methods || {}), data: structuredClone(options.data) };
    instance.setData = vi.fn(function setData(patch, callback) {
        Object.assign(this.data, patch);
        callback?.();
    });
    instance.triggerEvent = vi.fn();
    return instance;
}
