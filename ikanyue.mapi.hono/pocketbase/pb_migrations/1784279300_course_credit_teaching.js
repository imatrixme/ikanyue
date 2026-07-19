/// <reference path="../pb_data/types.d.ts" />

const schemas = [
  {
    name: "classes",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"name","type":"text","required":true,"max":0},
      {"name":"courseSpecId","type":"relation","required":true,"collectionName":"course_specs","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"defaultCreditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"termStart","type":"date","required":false},
      {"name":"termEnd","type":"date","required":false},
      {"name":"capacity","type":"number","required":false,"min":1,"max":null,"onlyInt":true},
      {"name":"location","type":"text","required":false,"max":0},
      {"name":"status","type":"select","required":true,"values":["draft","active","completed","cancelled"],"maxSelect":1},
      {"name":"metadata","type":"json","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_classes_code ON classes (code)","CREATE INDEX idx_classes_status_term ON classes (status, termStart)"],
  },
  {
    name: "class_students",
    type: "base",
    fields: [
      {"name":"classId","type":"relation","required":true,"collectionName":"classes","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["invited","active","paused","completed","cancelled"],"maxSelect":1},
      {"name":"effectiveFrom","type":"date","required":true},
      {"name":"effectiveTo","type":"date","required":false},
      {"name":"sourceOrderId","type":"relation","required":false,"collectionName":"orders","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_class_students_effective ON class_students (classId, studentId, effectiveFrom)","CREATE UNIQUE INDEX idx_class_students_open ON class_students (classId, studentId) WHERE effectiveTo IS NULL OR effectiveTo = ''","CREATE INDEX idx_class_students_student_status ON class_students (studentId, status)"],
  },
  {
    name: "class_teachers",
    type: "base",
    fields: [
      {"name":"classId","type":"relation","required":true,"collectionName":"classes","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"role","type":"select","required":true,"values":["lead","assistant","observer","evaluator"],"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["active","inactive"],"maxSelect":1},
      {"name":"effectiveFrom","type":"date","required":true},
      {"name":"effectiveTo","type":"date","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_class_teachers_open ON class_teachers (classId, teacherId, role) WHERE effectiveTo IS NULL OR effectiveTo = ''","CREATE INDEX idx_class_teachers_class_status ON class_teachers (classId, status)","CREATE INDEX idx_class_teachers_teacher_status ON class_teachers (teacherId, status)"],
  },
  {
    name: "sessions",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"title","type":"text","required":true,"max":0},
      {"name":"status","type":"select","required":true,"values":["draft","scheduled","enrollment_closed","in_progress","completed","settled","cancelled","correction_pending"],"maxSelect":1},
      {"name":"startAt","type":"date","required":true},
      {"name":"endAt","type":"date","required":true},
      {"name":"location","type":"text","required":false,"max":0},
      {"name":"requiredCreditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"requiredQuantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"attendanceRuleSnapshot","type":"json","required":true},
      {"name":"settlementRuleSnapshot","type":"json","required":true},
      {"name":"teacherRuleSnapshot","type":"json","required":true},
      {"name":"rosterVersion","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"settlementOperationId","type":"relation","required":false,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"correctionBaseStatus","type":"select","required":false,"values":["completed","cancelled"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_sessions_code ON sessions (code)","CREATE INDEX idx_sessions_status_start ON sessions (status, startAt)"],
  },
  {
    name: "session_classes",
    type: "base",
    fields: [
      {"name":"sessionId","type":"relation","required":true,"collectionName":"sessions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"classId","type":"relation","required":true,"collectionName":"classes","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_session_classes_unique ON session_classes (sessionId, classId)"],
  },
  {
    name: "session_students",
    type: "base",
    fields: [
      {"name":"sessionId","type":"relation","required":true,"collectionName":"sessions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sourceClassIds","type":"json","required":false},
      {"name":"attendanceStatus","type":"select","required":true,"values":["scheduled","checked_in","present","late","leave","absent","cancelled"],"maxSelect":1},
      {"name":"creditStatus","type":"select","required":true,"values":["pending","credit_insufficient","conversion_required","reserved","consumed","released","reversed"],"maxSelect":1},
      {"name":"eligibilityReason","type":"text","required":false,"max":0},
      {"name":"checkedInAt","type":"date","required":false},
      {"name":"settledAt","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_session_students_unique ON session_students (sessionId, studentId)","CREATE INDEX idx_session_students_credit_status ON session_students (creditStatus, sessionId)"],
  },
  {
    name: "session_teachers",
    type: "base",
    fields: [
      {"name":"sessionId","type":"relation","required":true,"collectionName":"sessions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"role","type":"select","required":true,"values":["lead","assistant","observer","evaluator"],"maxSelect":1},
      {"name":"assignmentSource","type":"select","required":true,"values":["class_default","session_override","substitute"],"maxSelect":1},
      {"name":"actualStatus","type":"select","required":true,"values":["planned","confirmed","absent","cancelled"],"maxSelect":1},
      {"name":"creditStatus","type":"select","required":true,"values":["not_eligible","pending","confirmed","reversed"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_session_teachers_unique ON session_teachers (sessionId, teacherId, role)"],
  },
  {
    name: "session_credit_allocations",
    type: "base",
    fields: [
      {"name":"sessionStudentId","type":"relation","required":true,"collectionName":"session_students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"batchId","type":"relation","required":true,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"quantity","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["reserved","consumed","released","expired","reversed"],"maxSelect":1},
      {"name":"reservedForStartAt","type":"date","required":true},
      {"name":"operationId","type":"relation","required":true,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_session_credit_allocations_student_status ON session_credit_allocations (sessionStudentId, status)","CREATE INDEX idx_session_credit_allocations_batch_status ON session_credit_allocations (batchId, status)"],
  },
  {
    name: "teacher_credit_rules",
    type: "base",
    fields: [
      {"name":"courseSpecId","type":"relation","required":true,"collectionName":"course_specs","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"role","type":"select","required":true,"values":["lead","assistant","observer","evaluator"],"maxSelect":1},
      {"name":"baseQuantity","type":"number","required":false,"min":0,"max":null,"onlyInt":false},
      {"name":"durationFactor","type":"number","required":false,"min":0,"max":null,"onlyInt":false},
      {"name":"participantFactor","type":"number","required":false,"min":0,"max":null,"onlyInt":false},
      {"name":"cancellationCompensation","type":"json","required":false},
      {"name":"validFrom","type":"date","required":true},
      {"name":"validTo","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_teacher_credit_rules_version ON teacher_credit_rules (courseSpecId, role, version)"],
  },
  {
    name: "teacher_credit_events",
    type: "base",
    fields: [
      {"name":"sessionTeacherId","type":"relation","required":true,"collectionName":"session_teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"ruleId","type":"relation","required":false,"collectionName":"teacher_credit_rules","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"eventType","type":"select","required":true,"values":["earn","compensate","confirm","reverse","adjust"],"maxSelect":1},
      {"name":"quantityDelta","type":"number","required":true,"min":null,"max":null,"onlyInt":false},
      {"name":"status","type":"select","required":true,"values":["pending","confirmed","reversed"],"maxSelect":1},
      {"name":"operationId","type":"relation","required":true,"collectionName":"credit_operations","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"confirmationOfEventId","type":"relation","required":false,"collectionName":"teacher_credit_events","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"reversalOfEventId","type":"relation","required":false,"collectionName":"teacher_credit_events","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"reason","type":"text","required":false,"max":0},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_teacher_credit_events_teacher_created ON teacher_credit_events (teacherId, created)","CREATE INDEX idx_teacher_credit_events_session_teacher ON teacher_credit_events (sessionTeacherId)","CREATE UNIQUE INDEX idx_teacher_credit_events_confirmation ON teacher_credit_events (confirmationOfEventId) WHERE confirmationOfEventId IS NOT NULL AND confirmationOfEventId != ''"],
  },
  {
    name: "outbox_events",
    type: "base",
    fields: [
      {"name":"topic","type":"text","required":true,"max":0},
      {"name":"aggregateType","type":"text","required":true,"max":0},
      {"name":"aggregateId","type":"text","required":true,"max":0},
      {"name":"payload","type":"json","required":true},
      {"name":"status","type":"select","required":true,"values":["pending","processing","sent","failed","dead_letter"],"maxSelect":1},
      {"name":"attempts","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"nextAttemptAt","type":"date","required":false},
      {"name":"processingStartedAt","type":"date","required":false},
      {"name":"sentAt","type":"date","required":false},
      {"name":"lastErrorCode","type":"text","required":false,"max":0},
      {"name":"lastErrorAt","type":"date","required":false},
      {"name":"deadLetterAt","type":"date","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_outbox_events_delivery ON outbox_events (status, nextAttemptAt)"],
  },
  {
    name: "reconciliation_runs",
    type: "base",
    fields: [
      {"name":"scope","type":"text","required":true,"max":0},
      {"name":"status","type":"select","required":true,"values":["pending","running","passed","failed"],"maxSelect":1},
      {"name":"startedAt","type":"date","required":false},
      {"name":"finishedAt","type":"date","required":false},
      {"name":"differenceCount","type":"number","required":false,"min":0,"max":null,"onlyInt":true},
      {"name":"report","type":"json","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_reconciliation_runs_status_created ON reconciliation_runs (status, created)"],
  },
  {
    name: "reconciliation_exceptions",
    type: "base",
    fields: [
      {"name":"runId","type":"relation","required":true,"collectionName":"reconciliation_runs","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"batchId","type":"relation","required":true,"collectionName":"credit_batches","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"field","type":"text","required":true,"max":0},
      {"name":"expectedValue","type":"number","required":false,"min":null,"max":null,"onlyInt":false},
      {"name":"actualValue","type":"number","required":false,"min":null,"max":null,"onlyInt":false},
      {"name":"details","type":"json","required":true},
      {"name":"status","type":"select","required":true,"values":["open","acknowledged","resolved"],"maxSelect":1},
      {"name":"detectedAt","type":"date","required":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_reconciliation_exceptions_run ON reconciliation_exceptions (runId, batchId)","CREATE INDEX idx_reconciliation_exceptions_status_created ON reconciliation_exceptions (status, created)"],
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
