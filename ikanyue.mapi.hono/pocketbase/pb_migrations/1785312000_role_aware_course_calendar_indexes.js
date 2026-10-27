/// <reference path="../pb_data/types.d.ts" />

const CALENDAR_INDEXES = {
  "sessions": "CREATE INDEX idx_sessions_calendar_range ON sessions (startAt, endAt, status)",
  "session_classes": "CREATE INDEX idx_session_classes_class_session ON session_classes (classId, sessionId)",
  "session_students": "CREATE INDEX idx_session_students_student_session ON session_students (studentId, sessionId, attendanceStatus)",
  "session_teachers": "CREATE INDEX idx_session_teachers_teacher_session ON session_teachers (teacherId, sessionId, actualStatus)",
};

migrate((app) => {
  for (const [name, index] of Object.entries(CALENDAR_INDEXES)) {
    const collection = app.findCollectionByNameOrId(name);
    if (!collection.indexes.some((value) => value.includes(indexName(index)))) {
      collection.indexes = [...collection.indexes, index];
      app.save(collection);
    }
  }
}, (app) => {
  for (const [name, index] of Object.entries(CALENDAR_INDEXES)) {
    const collection = app.findCollectionByNameOrId(name);
    const target = indexName(index);
    collection.indexes = collection.indexes.filter((value) => !value.includes(target));
    app.save(collection);
  }
});

function indexName(index) {
  return index.split(" ")[2];
}
