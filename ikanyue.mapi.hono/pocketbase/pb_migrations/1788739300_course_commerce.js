/// <reference path="../pb_data/types.d.ts" />

const schemas = [
  {
    name: "commerce_offers",
    type: "base",
    fields: [
      {"name":"packageId","type":"relation","required":true,"collectionName":"packages","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"priceVersionId","type":"relation","required":true,"collectionName":"price_versions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"name","type":"text","required":true,"max":0},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"policy","type":"json","required":true},
      {"name":"version","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: [],
  },
  {
    name: "commerce_orders",
    type: "base",
    fields: [
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"orderId","type":"relation","required":true,"collectionName":"orders","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["pending","granting","completed","failed"],"maxSelect":1},
      {"name":"data","type":"json","required":true},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_commerce_order ON commerce_orders (orderId)","CREATE INDEX idx_commerce_student_status ON commerce_orders (studentId, status)"],
  },
  {
    name: "commerce_refunds",
    type: "base",
    fields: [
      {"name":"orderId","type":"relation","required":true,"collectionName":"orders","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["processing","succeeded","failed"],"maxSelect":1},
      {"name":"data","type":"json","required":true},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: [],
  },
  {
    name: "commerce_claims",
    type: "base",
    fields: [
      {"name":"key","type":"text","required":true,"max":0},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_commerce_claim ON commerce_claims (key)"],
  },
  {
    name: "commerce_audit",
    type: "base",
    fields: [
      {"name":"subjectId","type":"text","required":true,"max":0},
      {"name":"actorId","type":"text","required":true,"max":0},
      {"name":"action","type":"text","required":true,"max":0},
      {"name":"data","type":"json","required":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: [],
  },
  {
    name: "commerce_cases",
    type: "base",
    fields: [
      {"name":"subjectId","type":"text","required":true,"max":0},
      {"name":"status","type":"select","required":true,"values":["open","resolved"],"maxSelect":1},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"data","type":"json","required":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: [],
  }
];

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
