/// <reference path="../pb_data/types.d.ts" />

const schemas = [
  {
    name: "credit_operations",
    type: "base",
    fields: [
      {"name":"operationNo","type":"text","required":true,"max":0},
      {"name":"studentId","type":"relation","required":false,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"type","type":"select","required":true,"values":["grant","convert","reserve","activate","consume","release","expire","extend","reverse","adjust","class_membership","class_teacher_assignment","publish_session","reschedule_session","settle_session","reverse_session_settlement","confirm_teacher_credit","confirm_appointment","decline_appointment","withdraw_appointment","cancel_appointment","reschedule_appointment","expire_appointment","configure_availability","backfill_schedule_claims","cancel_session","fulfill_appointment","configure_booking","resolve_booking_conflict"],"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["pending","committed","failed","reversed"],"maxSelect":1},
      {"name":"idempotencyKey","type":"text","required":true,"max":0},
      {"name":"sourceType","type":"text","required":false,"max":0},
      {"name":"sourceId","type":"text","required":false,"max":0},
      {"name":"ruleVersionId","type":"text","required":false,"max":0},
      {"name":"reversalOfOperationId","type":"relation","required":false,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"requestSnapshot","type":"json","required":false},
      {"name":"resultSnapshot","type":"json","required":false},
      {"name":"actorId","type":"text","required":false,"max":0},
      {"name":"actorRole","type":"text","required":false,"max":0},
      {"name":"traceId","type":"text","required":false,"max":0},
      {"name":"reason","type":"text","required":true,"max":0},
      {"name":"outcome","type":"select","required":true,"values":["committed","failed","denied"],"maxSelect":1},
      {"name":"beforeSummary","type":"json","required":true},
      {"name":"afterSummary","type":"json","required":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_credit_operations_no ON credit_operations (operationNo)","CREATE UNIQUE INDEX idx_credit_operations_idempotency ON credit_operations (idempotencyKey)","CREATE INDEX idx_credit_operations_student_created ON credit_operations (studentId, created)"],
  },
  {
    name: "credit_version_claims",
    type: "base",
    fields: [
      {"name":"entityType","type":"select","required":true,"values":["credit_batch","session_student","order","session","appointment","schedule_claim","teacher_offering","availability_rule","availability_override","booking_conflict"],"maxSelect":1},
      {"name":"entityId","type":"text","required":true,"max":0},
      {"name":"expectedVersion","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"operationId","type":"relation","required":true,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_credit_version_claims_entity_version ON credit_version_claims (entityType, entityId, expectedVersion)","CREATE INDEX idx_credit_version_claims_operation ON credit_version_claims (operationId)"],
  },
  {
    name: "credit_batches",
    type: "base",
    fields: [
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"creditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sourceOperationId","type":"relation","required":true,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"compensationSourceBatchId","type":"relation","required":false,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"originalQuantity","type":"number","required":true,"min":0,"max":null,"onlyInt":true},
      {"name":"availableQuantity","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"frozenQuantity","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"consumedQuantity","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"expiredQuantity","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"reversedQuantity","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["pending","unactivated","active","depleted","expired","cancelled"],"maxSelect":1},
      {"name":"validFrom","type":"date","required":false},
      {"name":"originalExpiresAt","type":"date","required":false},
      {"name":"effectiveExpiresAt","type":"date","required":false},
      {"name":"activationMode","type":"select","required":true,"values":["GRANT_TIME","FIRST_RESERVATION","FIRST_CHECK_IN","FIRST_COMPLETED_SESSION","TERM_START"],"maxSelect":1},
      {"name":"expiryPolicy","type":"select","required":false,"values":["FIXED_DURATION","TERM_END","NO_EXPIRY"],"maxSelect":1},
      {"name":"activationDeadline","type":"date","required":false},
      {"name":"activatedAt","type":"date","required":false},
      {"name":"validityDurationDays","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"grantSnapshot","type":"json","required":false},
      {"name":"listUnitValue","type":"number","required":false,"min":0,"max":null,"onlyInt":false},
      {"name":"paidUnitCost","type":"number","required":false,"min":0,"max":null,"onlyInt":false},
      {"name":"currency","type":"text","required":false,"max":3},
      {"name":"priority","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_credit_batches_fefo ON credit_batches (studentId, creditTypeId, status, effectiveExpiresAt, priority, created)","CREATE INDEX idx_credit_batches_source_operation ON credit_batches (sourceOperationId)","CREATE INDEX idx_credit_batches_compensation_source ON credit_batches (compensationSourceBatchId)"],
  },
  {
    name: "credit_events",
    type: "base",
    fields: [
      {"name":"operationId","type":"relation","required":true,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"batchId","type":"relation","required":true,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"creditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"eventType","type":"select","required":true,"values":["GRANT","CONVERT_OUT","CONVERT_IN","FREEZE","ACTIVATE","CONSUME","RELEASE","EXPIRE","EXTEND","REVERSE","ADJUST"],"maxSelect":1},
      {"name":"quantityDelta","type":"number","required":false,"min":null,"max":null,"onlyInt":true},
      {"name":"bucketFrom","type":"text","required":false,"max":0},
      {"name":"bucketTo","type":"text","required":false,"max":0},
      {"name":"balanceSnapshot","type":"json","required":true},
      {"name":"businessTime","type":"date","required":true},
      {"name":"actorId","type":"text","required":false,"max":0},
      {"name":"reason","type":"text","required":false,"max":0},
      {"name":"reversalOfEventId","type":"relation","required":false,"collectionName":"credit_events","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"metadata","type":"json","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_credit_events_batch_created ON credit_events (batchId, created)","CREATE INDEX idx_credit_events_student_created ON credit_events (studentId, created)","CREATE INDEX idx_credit_events_operation ON credit_events (operationId)"],
  },
  {
    name: "credit_expiry_changes",
    type: "base",
    fields: [
      {"name":"batchId","type":"relation","required":true,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"oldExpiresAt","type":"date","required":false},
      {"name":"newExpiresAt","type":"date","required":true},
      {"name":"quantityScope","type":"number","required":true,"min":0,"max":null,"onlyInt":true},
      {"name":"reason","type":"text","required":true,"max":0},
      {"name":"actorId","type":"text","required":true,"max":0},
      {"name":"approvedBy","type":"text","required":false,"max":0},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_credit_expiry_changes_batch_created ON credit_expiry_changes (batchId, created)"],
  },
  {
    name: "conversion_rules",
    type: "base",
    fields: [
      {"name":"sourceCreditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"targetCreditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sourceQuantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"targetQuantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"minSourceQuantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"maxSourceQuantity","type":"number","required":false,"min":1,"max":null,"onlyInt":true},
      {"name":"expiryPolicy","type":"select","required":true,"values":["INHERIT_SOURCE","RESET_ON_CONVERSION","RESET_ON_ACTIVATION","MIN_SOURCE_AND_NEW","TARGET_TERM_END"],"maxSelect":1},
      {"name":"activationMode","type":"select","required":true,"values":["GRANT_TIME","FIRST_RESERVATION","FIRST_CHECK_IN","FIRST_COMPLETED_SESSION","TERM_START"],"maxSelect":1},
      {"name":"validityDurationDays","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"activationDeadlineDays","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"reversible","type":"bool","required":false},
      {"name":"referenceValueLimit","type":"number","required":false,"min":0,"max":null,"onlyInt":false},
      {"name":"validFrom","type":"date","required":true},
      {"name":"validTo","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_conversion_rules_version ON conversion_rules (sourceCreditTypeId, targetCreditTypeId, version)","CREATE INDEX idx_conversion_rules_active ON conversion_rules (sourceCreditTypeId, targetCreditTypeId, status, validFrom)"],
  },
  {
    name: "conversion_authorizations",
    type: "base",
    fields: [
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"ruleId","type":"relation","required":true,"collectionName":"conversion_rules","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sourceCreditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"targetCreditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"termsFingerprint","type":"text","required":true,"max":0},
      {"name":"requestFingerprint","type":"text","required":true,"max":0},
      {"name":"status","type":"select","required":true,"values":["active","revoked","expired"],"maxSelect":1},
      {"name":"consentSource","type":"select","required":true,"values":["explicit_preview","standing_authorization","admin"],"maxSelect":1},
      {"name":"idempotencyKey","type":"text","required":true,"max":0},
      {"name":"validFrom","type":"date","required":true},
      {"name":"validTo","type":"date","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_conversion_authorizations_idempotency ON conversion_authorizations (idempotencyKey)","CREATE INDEX idx_conversion_authorizations_scope ON conversion_authorizations (studentId, sourceCreditTypeId, targetCreditTypeId, status, validTo)"],
  },
  {
    name: "conversion_allocations",
    type: "base",
    fields: [
      {"name":"operationId","type":"relation","required":true,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sourceBatchId","type":"relation","required":true,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"targetBatchId","type":"relation","required":true,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sourceQuantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"targetQuantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"expiryPolicySnapshot","type":"json","required":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_conversion_allocations_operation ON conversion_allocations (operationId)","CREATE INDEX idx_conversion_allocations_source ON conversion_allocations (sourceBatchId)"],
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
