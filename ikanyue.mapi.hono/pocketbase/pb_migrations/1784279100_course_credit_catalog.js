/// <reference path="../pb_data/types.d.ts" />

const schemas = [
  {
    name: "course_specs",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"name","type":"text","required":true,"max":0},
      {"name":"deliveryMode","type":"select","required":true,"values":["one_to_one","group","workshop","online","hybrid"],"maxSelect":1},
      {"name":"durationMinutes","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"teacherTier","type":"text","required":false,"max":0},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"defaultCreditTypeId","type":"relation","required":false,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"metadata","type":"json","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_course_specs_code ON course_specs (code)","CREATE INDEX idx_course_specs_status_name ON course_specs (status, name)"],
  },
  {
    name: "credit_types",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"name","type":"text","required":true,"max":0},
      {"name":"kind","type":"select","required":true,"values":["universal","course"],"maxSelect":1},
      {"name":"courseSpecId","type":"relation","required":false,"collectionName":"course_specs","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"consumable","type":"bool","required":false},
      {"name":"unitLabel","type":"text","required":false,"max":0},
      {"name":"referenceUnitValue","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_credit_types_code ON credit_types (code)","CREATE INDEX idx_credit_types_kind_status ON credit_types (kind, status)"],
  },
  {
    name: "packages",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"name","type":"text","required":true,"max":0},
      {"name":"description","type":"text","required":false,"max":0},
      {"name":"saleChannel","type":"select","required":true,"values":["admin","wechat","website","offline","all"],"maxSelect":1},
      {"name":"activationMode","type":"select","required":true,"values":["GRANT_TIME","FIRST_RESERVATION","FIRST_CHECK_IN","FIRST_COMPLETED_SESSION","TERM_START"],"maxSelect":1},
      {"name":"activationDeadlineDays","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"validityDurationDays","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"expiryPolicy","type":"select","required":true,"values":["FIXED_DURATION","TERM_END","NO_EXPIRY"],"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_packages_code ON packages (code)","CREATE INDEX idx_packages_status_name ON packages (status, name)"],
  },
  {
    name: "package_grant_lines",
    type: "base",
    fields: [
      {"name":"packageId","type":"relation","required":true,"collectionName":"packages","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"creditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"quantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_package_grant_lines_unique ON package_grant_lines (packageId, creditTypeId)"],
  },
  {
    name: "price_versions",
    type: "base",
    fields: [
      {"name":"packageId","type":"relation","required":true,"collectionName":"packages","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"currency","type":"text","required":true,"max":3},
      {"name":"listAmount","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"saleAmount","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"validFrom","type":"date","required":true},
      {"name":"validTo","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"grantSnapshot","type":"json","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_price_versions_package_version ON price_versions (packageId, version)","CREATE INDEX idx_price_versions_package_status ON price_versions (packageId, status, validFrom)"],
  },
  {
    name: "orders",
    type: "base",
    fields: [
      {"name":"orderNo","type":"text","required":true,"max":0},
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"payerId","type":"text","required":false,"max":0},
      {"name":"type","type":"select","required":true,"values":["package_purchase","universal_recharge","offline","gift","compensation"],"maxSelect":1},
      {"name":"channel","type":"select","required":true,"values":["admin","wechat","website","offline"],"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["pending","paid","granted","cancelled","failed","reversal_pending","reversed"],"maxSelect":1},
      {"name":"currency","type":"text","required":true,"max":3},
      {"name":"listAmount","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"paidAmount","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"priceVersionId","type":"relation","required":false,"collectionName":"price_versions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"productSnapshot","type":"json","required":true},
      {"name":"grantSnapshot","type":"json","required":true},
      {"name":"idempotencyKey","type":"text","required":true,"max":0},
      {"name":"paidAt","type":"date","required":false},
      {"name":"cancelledAt","type":"date","required":false},
      {"name":"version","type":"number","required":false,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_orders_order_no ON orders (orderNo)","CREATE UNIQUE INDEX idx_orders_idempotency ON orders (idempotencyKey)","CREATE INDEX idx_orders_student_created ON orders (studentId, created)"],
  },
  {
    name: "payment_events",
    type: "base",
    fields: [
      {"name":"orderId","type":"relation","required":true,"collectionName":"orders","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"providerEventId","type":"text","required":true,"max":0},
      {"name":"type","type":"select","required":true,"values":["paid","failed","cancelled","refunded","chargeback"],"maxSelect":1},
      {"name":"amount","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"payloadHash","type":"text","required":true,"max":0},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_payment_events_provider ON payment_events (providerEventId)","CREATE INDEX idx_payment_events_order_created ON payment_events (orderId, created)"],
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
