-- Create PocketBase collection + table for activity signups.
-- Usage (local pb_data):
--   sqlite3 pb_data/data.db < scripts/pb-ensure-activity-signups.sql

BEGIN;

-- 1) Ensure collection metadata exists (copy access rules/options from attendance_records)
INSERT OR IGNORE INTO _collections (
  id, system, type, name, fields, indexes,
  listRule, viewRule, createRule, updateRule, deleteRule,
  options
)
SELECT
  'pbc_105920147',
  0,
  'base',
  'activity_signups',
  '[
    {"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
    {"cascadeDelete":false,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation1689669068","maxSelect":1,"minSelect":0,"name":"userId","presentable":false,"required":true,"system":false,"type":"relation"},
    {"cascadeDelete":false,"collectionId":"pbc_1262591861","hidden":false,"id":"relation322298620","maxSelect":1,"minSelect":0,"name":"activityId","presentable":false,"required":true,"system":false,"type":"relation"},
    {"autogeneratePattern":"","hidden":false,"id":"text_activitySignup_realName","max":50,"min":1,"name":"realName","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
    {"hidden":false,"id":"number_activitySignup_age","max":120,"min":1,"name":"age","onlyInt":true,"presentable":false,"required":true,"system":false,"type":"number"},
    {"hidden":false,"id":"select_activitySignup_status","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["registered","cancelled"]},
    {"hidden":false,"id":"autodate_created","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
    {"hidden":false,"id":"autodate_updated","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
  ]',
  '[
    "CREATE UNIQUE INDEX idx_activity_signups_user_activity ON activity_signups (userId, activityId)",
    "CREATE INDEX idx_activity_signups_user_created ON activity_signups (userId, created DESC)"
  ]',
  listRule,
  viewRule,
  createRule,
  updateRule,
  deleteRule,
  options
FROM _collections
WHERE name = 'attendance_records';

-- 2) If the collection exists, keep its fields/indexes in sync
UPDATE _collections
SET
  fields = '[
    {"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
    {"cascadeDelete":false,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation1689669068","maxSelect":1,"minSelect":0,"name":"userId","presentable":false,"required":true,"system":false,"type":"relation"},
    {"cascadeDelete":false,"collectionId":"pbc_1262591861","hidden":false,"id":"relation322298620","maxSelect":1,"minSelect":0,"name":"activityId","presentable":false,"required":true,"system":false,"type":"relation"},
    {"autogeneratePattern":"","hidden":false,"id":"text_activitySignup_realName","max":50,"min":1,"name":"realName","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
    {"hidden":false,"id":"number_activitySignup_age","max":120,"min":1,"name":"age","onlyInt":true,"presentable":false,"required":true,"system":false,"type":"number"},
    {"hidden":false,"id":"select_activitySignup_status","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["registered","cancelled"]},
    {"hidden":false,"id":"autodate_created","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
    {"hidden":false,"id":"autodate_updated","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
  ]',
  indexes = '[
    "CREATE UNIQUE INDEX idx_activity_signups_user_activity ON activity_signups (userId, activityId)",
    "CREATE INDEX idx_activity_signups_user_created ON activity_signups (userId, created DESC)"
  ]'
WHERE name = 'activity_signups';

-- 3) Ensure the physical table + indexes exist
CREATE TABLE IF NOT EXISTS `activity_signups` (
  `activityId` TEXT DEFAULT '' NOT NULL,
  `age` NUMERIC DEFAULT 0 NOT NULL,
  `created` TEXT DEFAULT '' NOT NULL,
  `id` TEXT PRIMARY KEY DEFAULT ('r'||lower(hex(randomblob(7)))) NOT NULL,
  `realName` TEXT DEFAULT '' NOT NULL,
  `status` TEXT DEFAULT '' NOT NULL,
  `updated` TEXT DEFAULT '' NOT NULL,
  `userId` TEXT DEFAULT '' NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_activity_signups_user_activity` ON `activity_signups` (`userId`, `activityId`);
CREATE INDEX IF NOT EXISTS `idx_activity_signups_user_created` ON `activity_signups` (`userId`, `created` DESC);

COMMIT;

