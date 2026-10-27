/// <reference path="../pb_data/types.d.ts" />

const schemas = [
  {
    name: "booking_policies",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"name","type":"text","required":true,"max":0},
      {"name":"timezone","type":"text","required":true,"max":0},
      {"name":"defaultWindows","type":"json","required":true},
      {"name":"slotStepMinutes","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"claimGranularityMinutes","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"minLeadMinutes","type":"number","required":true,"min":0,"max":null,"onlyInt":true},
      {"name":"maxAdvanceDays","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"responseTtlMinutes","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"responseCutoffMinutes","type":"number","required":true,"min":0,"max":null,"onlyInt":true},
      {"name":"cancellationCutoffMinutes","type":"number","required":true,"min":0,"max":null,"onlyInt":true},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"effectiveFrom","type":"date","required":true},
      {"name":"effectiveTo","type":"date","required":false},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_booking_policies_code_version ON booking_policies (code, version)","CREATE UNIQUE INDEX idx_booking_policies_active ON booking_policies (code) WHERE status = 'active'","CREATE INDEX idx_booking_policies_effective ON booking_policies (status, effectiveFrom, effectiveTo)"],
  },
  {
    name: "teacher_course_offerings",
    type: "base",
    fields: [
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"courseSpecId","type":"relation","required":true,"collectionName":"course_specs","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"creditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"policyId","type":"relation","required":true,"collectionName":"booking_policies","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"location","type":"text","required":false,"max":0},
      {"name":"availabilityMode","type":"select","required":true,"values":["default","custom"],"maxSelect":1},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["draft","active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_teacher_offerings_version ON teacher_course_offerings (teacherId, courseSpecId, version)","CREATE UNIQUE INDEX idx_teacher_offerings_active ON teacher_course_offerings (teacherId, courseSpecId) WHERE status = 'active'","CREATE INDEX idx_teacher_offerings_course_status ON teacher_course_offerings (courseSpecId, status)"],
  },
  {
    name: "teacher_availability_rules",
    type: "base",
    fields: [
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"offeringId","type":"relation","required":false,"collectionName":"teacher_course_offerings","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"weekday","type":"number","required":true,"min":1,"max":7,"onlyInt":true},
      {"name":"startMinute","type":"number","required":true,"min":0,"max":1439,"onlyInt":true},
      {"name":"endMinute","type":"number","required":true,"min":1,"max":1440,"onlyInt":true},
      {"name":"effectiveFrom","type":"date","required":true},
      {"name":"effectiveTo","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["active","inactive"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_teacher_availability_rules_lookup ON teacher_availability_rules (teacherId, status, weekday, effectiveFrom)"],
  },
  {
    name: "teacher_availability_overrides",
    type: "base",
    fields: [
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"offeringId","type":"relation","required":false,"collectionName":"teacher_course_offerings","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"type","type":"select","required":true,"values":["available","unavailable"],"maxSelect":1},
      {"name":"startAt","type":"date","required":true},
      {"name":"endAt","type":"date","required":true},
      {"name":"reason","type":"text","required":false,"max":0},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"status","type":"select","required":true,"values":["active","cancelled"],"maxSelect":1},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_teacher_availability_overrides_lookup ON teacher_availability_overrides (teacherId, status, startAt, endAt)"],
  },
  {
    name: "appointment_requests",
    type: "base",
    fields: [
      {"name":"code","type":"text","required":true,"max":0},
      {"name":"studentId","type":"relation","required":true,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"teacherId","type":"relation","required":true,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"offeringId","type":"relation","required":true,"collectionName":"teacher_course_offerings","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"courseSpecId","type":"relation","required":true,"collectionName":"course_specs","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"creditTypeId","type":"relation","required":true,"collectionName":"credit_types","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"policyId","type":"relation","required":true,"collectionName":"booking_policies","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sessionId","type":"relation","required":false,"collectionName":"sessions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["pending","confirmed","declined","withdrawn","expired","slot_taken","eligibility_lost","cancelled","rescheduled","fulfilled"],"maxSelect":1},
      {"name":"requestedStartAt","type":"date","required":true},
      {"name":"requestedEndAt","type":"date","required":true},
      {"name":"responseDeadline","type":"date","required":true},
      {"name":"note","type":"text","required":false,"max":500},
      {"name":"responseReason","type":"text","required":false,"max":500},
      {"name":"policySnapshot","type":"json","required":true},
      {"name":"idempotencyKey","type":"text","required":true,"max":0},
      {"name":"requestFingerprint","type":"text","required":true,"max":0},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"requestedAt","type":"date","required":true},
      {"name":"respondedAt","type":"date","required":false},
      {"name":"confirmedAt","type":"date","required":false},
      {"name":"cancelledAt","type":"date","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_appointment_requests_code ON appointment_requests (code)","CREATE UNIQUE INDEX idx_appointment_requests_idempotency ON appointment_requests (idempotencyKey)","CREATE UNIQUE INDEX idx_appointment_requests_pending_course ON appointment_requests (studentId, courseSpecId) WHERE status = 'pending'","CREATE INDEX idx_appointment_requests_teacher_status_time ON appointment_requests (teacherId, status, requestedStartAt)","CREATE INDEX idx_appointment_requests_student_status_time ON appointment_requests (studentId, status, requestedStartAt)"],
  },
  {
    name: "appointment_events",
    type: "base",
    fields: [
      {"name":"appointmentId","type":"relation","required":true,"collectionName":"appointment_requests","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"eventType","type":"select","required":true,"values":["requested","confirmed","declined","withdrawn","expired","slot_taken","eligibility_lost","cancelled","rescheduled","fulfilled"],"maxSelect":1},
      {"name":"fromStatus","type":"text","required":false,"max":0},
      {"name":"toStatus","type":"text","required":true,"max":0},
      {"name":"actorId","type":"text","required":false,"max":0},
      {"name":"actorRole","type":"text","required":true,"max":0},
      {"name":"reason","type":"text","required":false,"max":500},
      {"name":"traceId","type":"text","required":false,"max":0},
      {"name":"metadata","type":"json","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_appointment_events_appointment_created ON appointment_events (appointmentId, created)"],
  },
  {
    name: "schedule_claims",
    type: "base",
    fields: [
      {"name":"ownerType","type":"select","required":true,"values":["teacher","student","room"],"maxSelect":1},
      {"name":"ownerId","type":"text","required":true,"max":0},
      {"name":"cellStartAt","type":"date","required":true},
      {"name":"cellEndAt","type":"date","required":true},
      {"name":"sourceType","type":"select","required":true,"values":["session","manual_block"],"maxSelect":1},
      {"name":"sourceId","type":"text","required":true,"max":0},
      {"name":"appointmentId","type":"relation","required":false,"collectionName":"appointment_requests","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["active","released"],"maxSelect":1},
      {"name":"releasedAt","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_schedule_claims_active_cell ON schedule_claims (ownerType, ownerId, cellStartAt) WHERE status = 'active'","CREATE INDEX idx_schedule_claims_source ON schedule_claims (sourceType, sourceId, status)","CREATE INDEX idx_schedule_claims_owner_time ON schedule_claims (ownerType, ownerId, status, cellStartAt)"],
  },
  {
    name: "booking_conflicts",
    type: "base",
    fields: [
      {"name":"type","type":"select","required":true,"values":["teacher_overlap","student_overlap","claim_failed","eligibility_lost","backfill_overlap"],"maxSelect":1},
      {"name":"status","type":"select","required":true,"values":["open","resolved","ignored"],"maxSelect":1},
      {"name":"teacherId","type":"relation","required":false,"collectionName":"teachers","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"studentId","type":"relation","required":false,"collectionName":"students","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"sessionId","type":"relation","required":false,"collectionName":"sessions","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"appointmentId","type":"relation","required":false,"collectionName":"appointment_requests","cascadeDelete":false,"minSelect":0,"maxSelect":1},
      {"name":"startAt","type":"date","required":true},
      {"name":"endAt","type":"date","required":true},
      {"name":"details","type":"json","required":true},
      {"name":"resolution","type":"text","required":false,"max":0},
      {"name":"resolvedAt","type":"date","required":false},
      {"name":"version","type":"number","required":true,"min":1,"max":null,"onlyInt":true},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE INDEX idx_booking_conflicts_status_time ON booking_conflicts (status, startAt)"],
  },
  {
    name: "wechat_identities",
    type: "base",
    fields: [
      {"name":"appId","type":"text","required":true,"max":0},
      {"name":"openId","type":"text","required":true,"max":0},
      {"name":"unionId","type":"text","required":false,"max":0},
      {"name":"principalType","type":"select","required":true,"values":["student","teacher"],"maxSelect":1},
      {"name":"principalId","type":"text","required":true,"max":0},
      {"name":"status","type":"select","required":true,"values":["active","revoked"],"maxSelect":1},
      {"name":"lastUsedAt","type":"date","required":false},
      {"name":"created","type":"autodate","onCreate":true,"onUpdate":false},
      {"name":"updated","type":"autodate","onCreate":true,"onUpdate":true},
    ],
    indexes: ["CREATE UNIQUE INDEX idx_wechat_identities_principal ON wechat_identities (appId, openId, principalType, principalId)","CREATE INDEX idx_wechat_identities_lookup ON wechat_identities (appId, openId, status)"],
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
