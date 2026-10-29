// View-state helpers shared by definePage and defineComponent.
// Computed values are pure functions of the data; updates send only fields whose value changed.

// setData rejects undefined, so absent values travel as null.
const viewValue = (value) => (value === undefined ? null : value);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

// Reference equality, plus one level of shallow comparison so recomputed arrays and
// objects holding the same items are not resent. Nested values are never mutated in place.
export function same(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => item === b[index]);
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
    }
    return false;
}

export function withComputed(state, computed = {}) {
    const next = { ...state };
    for (const [name, compute] of Object.entries(computed)) next[name] = viewValue(compute(next));
    return next;
}

export function initialData(data, computed) {
    const base = typeof data === 'function' ? data() : { ...data };
    return withComputed(Object.fromEntries(Object.entries(base).map(([key, value]) => [key, viewValue(value)])), computed);
}

export function changes(current, patch, computed) {
    const normalized = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, viewValue(value)]));
    const next = withComputed({ ...current, ...normalized }, computed);
    const diff = {};
    for (const [key, value] of Object.entries(next)) {
        if (!same(current[key], value)) diff[key] = value;
    }
    return diff;
}

// Instance methods mixed into pages and components; `computed` is captured per definition.
export function stateMethods(computed) {
    return {
        set(patch = {}) {
            const diff = changes(this.data, patch, computed);
            if (!Object.keys(diff).length) return Promise.resolve();
            return new Promise((resolve) => this.setData(diff, resolve));
        },
        // Two-way form binding: <input data-field="name" value="{{name}}" bindinput="onField" />
        // One nested level is allowed (data-field="form.name"); a data-value overrides the event value (taps).
        onField(event) {
            const { field, value = event.detail?.value } = event.currentTarget.dataset;
            const [key, child] = field.split('.');
            return this.set({ [key]: child === undefined ? value : { ...this.data[key], [child]: value } });
        },
    };
}
