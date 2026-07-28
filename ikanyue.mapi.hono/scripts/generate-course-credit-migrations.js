#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { CATALOG_SCHEMAS } = require('../src/services/courseCredits/schema/catalogSchemas');
const { BOOKING_SCHEMAS } = require('../src/services/courseCredits/schema/bookingSchemas');
const { LEDGER_SCHEMAS } = require('../src/services/courseCredits/schema/ledgerSchemas');
const { BASE_TEACHING_SCHEMAS } = require('../src/services/courseCredits/schema/teachingSchemas');

const OUTPUT_DIR = path.resolve(__dirname, '../pocketbase/pb_migrations');
const MIGRATIONS = [
    ['1784279100_course_credit_catalog.js', CATALOG_SCHEMAS],
    ['1784279200_course_credit_ledger.js', LEDGER_SCHEMAS],
    ['1784279300_course_credit_teaching.js', BASE_TEACHING_SCHEMAS],
    ['1784279400_course_booking.js', BOOKING_SCHEMAS],
];

function main(outputDir = OUTPUT_DIR) {
    fs.mkdirSync(outputDir, { recursive: true });
    for (const [filename, schemas] of MIGRATIONS) {
        fs.writeFileSync(path.join(outputDir, filename), migrationSource(schemas));
        console.log(`generated pocketbase/pb_migrations/${filename}`);
    }
}

function migrationSource(schemas) {
    return `/// <reference path="../pb_data/types.d.ts" />

const schemas = ${formatSchemas(schemas)};

function canResolve(app, definition) {
  if (!definition.collectionName) return true;
  try {
    app.findCollectionByNameOrId(definition.collectionName);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveDefinition(app, definition) {
  const data = Object.assign({}, definition);
  if (data.collectionName) {
    data.collectionId = app.findCollectionByNameOrId(data.collectionName).id;
    delete data.collectionName;
  }
  return data;
}

function createField(app, definition) {
  const data = resolveDefinition(app, definition);
  const type = data.type;
  delete data.type;
  switch (type) {
    case "autodate": return new AutodateField(data);
    case "bool": return new BoolField(data);
    case "date": return new DateField(data);
    case "json": return new JSONField(data);
    case "number": return new NumberField(data);
    case "relation": return new RelationField(data);
    case "select": return new SelectField(data);
    case "text": return new TextField(data);
    default: throw new Error("Unsupported course-credit field type: " + type);
  }
}

migrate((app) => {
  const deferred = [];
  for (const schema of schemas) {
    const fields = [];
    for (const definition of schema.fields) {
      if (canResolve(app, definition)) fields.push(resolveDefinition(app, definition));
      else deferred.push({ collectionName: schema.name, definition });
    }
    const collection = new Collection({
      type: schema.type,
      name: schema.name,
      fields,
      indexes: schema.indexes,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(collection);
  }
  for (const item of deferred) {
    const collection = app.findCollectionByNameOrId(item.collectionName);
    collection.fields.add(createField(app, item.definition));
    app.save(collection);
  }
}, (app) => {
  const collectionNames = {};
  for (const schema of schemas) collectionNames[schema.name] = true;
  for (const schema of schemas) {
    const internalRelations = schema.fields.filter((field) =>
      field.type === "relation" && collectionNames[field.collectionName]
    );
    if (!internalRelations.length) continue;
    const collection = app.findCollectionByNameOrId(schema.name);
    for (const field of internalRelations) collection.fields.removeByName(field.name);
    app.save(collection);
  }
  for (let index = schemas.length - 1; index >= 0; index -= 1) {
    app.delete(app.findCollectionByNameOrId(schemas[index].name));
  }
});
`;
}

function formatSchemas(schemas) {
    const entries = schemas.map((schema) => {
        const fields = schema.fields.map((field) => `      ${JSON.stringify(field)},`).join('\n');
        return `  {
    name: ${JSON.stringify(schema.name)},
    type: ${JSON.stringify(schema.type)},
    fields: [
${fields}
    ],
    indexes: ${JSON.stringify(schema.indexes)},
  }`;
    });
    return `[\n${entries.join(',\n')}\n]`;
}

if (require.main === module) {
    main();
}

module.exports = { MIGRATIONS, formatSchemas, main, migrationSource };
