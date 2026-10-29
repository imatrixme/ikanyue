import { registerComponent } from './host.js';
import { initialData, stateMethods, withComputed } from './state.js';

const propDefault = (prop) => (prop && typeof prop === 'object' && 'value' in prop ? prop.value : null);

// defineComponent({ props: { title: { type: String, value: '' } }, data, computed, methods, lifetimes })
// Computed values see props and data; they are recomputed whenever a prop changes.
// this.emit(name, detail) fires `bind:name` on the parent.
// Defaults match how the old Taro build rendered: no host node (virtualHost) and global BEM styles (shared),
// so sibling and cross-component selectors keep working. A parent passes classes through an `extClass` prop.
export function defineComponent({ props = {}, data, computed = {}, methods = {}, options = {}, observers = {}, ...rest } = {}) {
    const defaults = Object.fromEntries(Object.entries(props).map(([name, prop]) => [name, propDefault(prop)]));
    const own = typeof data === 'function' ? data() : { ...data };
    const names = Object.keys(props);
    const definition = {
        ...rest,
        options: { multipleSlots: true, styleIsolation: 'shared', virtualHost: true, ...options },
        properties: props,
        // Prop defaults take part in the first computation; properties supply the real values.
        data: withComputed({ ...defaults, ...initialData(own) }, computed),
        observers: { ...observers },
        methods: {
            ...methods,
            ...stateMethods(computed),
            emit(name, detail) {
                this.triggerEvent(name, detail);
            },
        },
    };
    for (const name of names) delete definition.data[name];
    if (names.length && Object.keys(computed).length) {
        const key = names.join(', ');
        const custom = observers[key];
        definition.observers[key] = function onProps(...values) {
            this.set({});
            if (custom) custom.apply(this, values);
        };
    }
    registerComponent(definition);
    return definition;
}
