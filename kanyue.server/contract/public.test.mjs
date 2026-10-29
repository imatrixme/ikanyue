import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARE_URL, call } from './client.mjs';

const READS = [
  '/v1/public/venues',
  '/v1/public/course-catalog',
  '/v1/public/course-catalog/courses/__missing__',
  '/v1/public/course-catalog/packages/__missing__',
];

test('public venues list only public fields', async () => {
  const { status, body } = await call('/v1/public/venues');
  assert.equal(status, 200);
  assert.equal(body.code, 10000);
  assert.equal(body.message, null);
  for (const venue of body.data.items) {
    assert.deepEqual(Object.keys(venue).sort(), ['address', 'bookable', 'coverUrl', 'id', 'intro', 'name', 'openingHours', 'phone']);
  }
});

test('public catalog links courses and packages', async () => {
  const { body } = await call('/v1/public/course-catalog');
  assert.equal(body.code, 10000);
  const packageCodes = new Set(body.data.packages.map((item) => item.code));
  for (const course of body.data.courses) {
    assert.deepEqual(Object.keys(course).sort(), ['code', 'deliveryMode', 'durationMinutes', 'name', 'packageCodes', 'teacherTier']);
    for (const code of course.packageCodes) assert.ok(packageCodes.has(code), `${course.code} links unknown package ${code}`);
  }
  for (const item of body.data.packages) {
    assert.ok(['mini_program', 'contact'].includes(item.purchaseMode));
    assert.deepEqual(Object.keys(item.price).sort(), ['currency', 'listAmount', 'saleAmount']);
  }
  const course = body.data.courses.find((item) => item.packageCodes.length);
  if (course) {
    const detail = await call(`/v1/public/course-catalog/courses/${encodeURIComponent(course.code)}`);
    assert.deepEqual(detail.body.data.packages.map((item) => item.code), course.packageCodes);
  }
});

test('missing catalog entries keep the not-found envelope', async () => {
  const course = await call('/v1/public/course-catalog/courses/__missing__');
  assert.equal(course.status, 200);
  assert.deepEqual(course.body, { code: 404, message: '公开课程不存在', data: null, errorCode: 'PUBLIC_COURSE_NOT_FOUND' });
  const pkg = await call('/v1/public/course-catalog/packages/__missing__');
  assert.deepEqual(pkg.body, { code: 404, message: '公开课包不存在', data: null, errorCode: 'PUBLIC_PACKAGE_NOT_FOUND' });
});

test('read parity with COMPARE_URL', { skip: !COMPARE_URL && 'COMPARE_URL not set' }, async () => {
  for (const path of READS) {
    const [left, right] = await Promise.all([call(path), call(path, { base: COMPARE_URL })]);
    assert.deepEqual(left, right, path);
  }
});
