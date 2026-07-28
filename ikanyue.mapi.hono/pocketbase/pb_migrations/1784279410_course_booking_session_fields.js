/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const sessions = app.findCollectionByNameOrId("sessions");
  addFieldIfMissing(sessions, "originType", () => new SelectField({
    name: "originType", required: false, values: ["class", "appointment", "admin"], maxSelect: 1,
  }));
  addFieldIfMissing(sessions, "appointmentId", () => new RelationField({
    name: "appointmentId", required: false,
    collectionId: app.findCollectionByNameOrId("appointment_requests").id,
    cascadeDelete: false, minSelect: 0, maxSelect: 1,
  }));
  addFieldIfMissing(sessions, "cancellationType", () => new SelectField({
    name: "cancellationType", required: false,
    values: ["student", "teacher", "institution", "admin"], maxSelect: 1,
  }));
  addFieldIfMissing(sessions, "cancelledAt", () => new DateField({ name: "cancelledAt", required: false }));
  app.save(sessions);
  app.db().newQuery('UPDATE "sessions" SET "originType" = \'admin\' WHERE "originType" IS NULL OR "originType" = \'\'').execute();
  const originType = sessions.fields.getByName("originType");
  if (originType && !originType.required) {
    originType.required = true;
    app.save(sessions);
  }

  const sessionTeachers = app.findCollectionByNameOrId("session_teachers");
  const assignmentSource = sessionTeachers.fields.getByName("assignmentSource");
  if (assignmentSource && !assignmentSource.values.includes("appointment")) {
    assignmentSource.values = [...assignmentSource.values, "appointment"];
    app.save(sessionTeachers);
  }

  const teachers = app.findCollectionByNameOrId("teachers");
  addFieldIfMissing(teachers, "courseCreditCapabilities", () => new JSONField({
    name: "courseCreditCapabilities", required: false,
  }));
  app.save(teachers);

  appendSelectValues(app.findCollectionByNameOrId("credit_operations"), "type", [
    "confirm_appointment", "decline_appointment", "withdraw_appointment", "cancel_appointment",
    "reschedule_appointment", "expire_appointment", "configure_availability", "backfill_schedule_claims",
    "cancel_session",
    "fulfill_appointment",
    "configure_booking", "resolve_booking_conflict",
  ], app);
  appendSelectValues(app.findCollectionByNameOrId("credit_version_claims"), "entityType", [
    "appointment", "schedule_claim", "teacher_offering", "availability_rule", "availability_override",
    "booking_conflict",
  ], app);
}, (app) => {
  const sessions = app.findCollectionByNameOrId("sessions");
  for (const name of ["appointmentId", "cancelledAt", "cancellationType", "originType"]) {
    sessions.fields.removeByName(name);
  }
  app.save(sessions);

  const sessionTeachers = app.findCollectionByNameOrId("session_teachers");
  const assignmentSource = sessionTeachers.fields.getByName("assignmentSource");
  if (assignmentSource) {
    assignmentSource.values = assignmentSource.values.filter((value) => value !== "appointment");
    app.save(sessionTeachers);
  }

  const teachers = app.findCollectionByNameOrId("teachers");
  teachers.fields.removeByName("courseCreditCapabilities");
  app.save(teachers);
});

function addFieldIfMissing(collection, name, factory) {
  if (!collection.fields.getByName(name)) collection.fields.add(factory());
}

function appendSelectValues(collection, fieldName, values, app) {
  const field = collection.fields.getByName(fieldName);
  if (!field) return;
  const next = [...field.values];
  for (const value of values) if (!next.includes(value)) next.push(value);
  if (next.length !== field.values.length) {
    field.values = next;
    app.save(collection);
  }
}
