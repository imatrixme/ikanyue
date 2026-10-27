function collection(name, fields, indexes = []) {
    return {
        name,
        type: 'base',
        fields: [
            ...fields,
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes,
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
    };
}

function boolField(name, options = {}) {
    return { name, type: 'bool', required: Boolean(options.required) };
}

function dateField(name, options = {}) {
    return { name, type: 'date', required: Boolean(options.required) };
}

function jsonField(name, options = {}) {
    return { name, type: 'json', required: Boolean(options.required) };
}

function numberField(name, options = {}) {
    return {
        name,
        type: 'number',
        required: Boolean(options.required),
        min: options.min ?? null,
        max: options.max ?? null,
        onlyInt: options.onlyInt !== false,
    };
}

function relationField(name, collectionName, options = {}) {
    return {
        name,
        type: 'relation',
        required: Boolean(options.required),
        collectionName,
        cascadeDelete: false,
        minSelect: options.minSelect ?? 0,
        maxSelect: options.maxSelect ?? 1,
    };
}

function selectField(name, values, options = {}) {
    return {
        name,
        type: 'select',
        required: Boolean(options.required),
        values,
        maxSelect: options.maxSelect ?? 1,
    };
}

function textField(name, options = {}) {
    return {
        name,
        type: 'text',
        required: Boolean(options.required),
        max: options.max ?? 0,
    };
}

module.exports = {
    boolField,
    collection,
    dateField,
    jsonField,
    numberField,
    relationField,
    selectField,
    textField,
};
