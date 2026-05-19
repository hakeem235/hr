import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePath, evaluateCondition } from '../src/domain/context.js';

const ctx = {
  requester: 'emp_018f23',
  entityId: 'ent_default',
  request: { workingDays: 6, leaveTypeId: 'annual' },
};

test('resolvePath: simple field', () => {
  assert.equal(resolvePath('$.requester', ctx), 'emp_018f23');
});
test('resolvePath: nested field', () => {
  assert.equal(resolvePath('$.request.workingDays', ctx), 6);
});
test('resolvePath: missing field returns undefined', () => {
  assert.equal(resolvePath('$.missing.deep', ctx), undefined);
});
test('resolvePath: literal (no $.) returns as-is', () => {
  assert.equal(resolvePath('literal', ctx), 'literal');
});

test('evaluateCondition: > passes', () => {
  assert.equal(evaluateCondition('$.request.workingDays > 5', ctx), true);
});
test('evaluateCondition: > fails', () => {
  assert.equal(evaluateCondition('$.request.workingDays > 10', ctx), false);
});
test('evaluateCondition: === string', () => {
  assert.equal(evaluateCondition('$.request.leaveTypeId === "annual"', ctx), true);
});
test('evaluateCondition: !== string', () => {
  assert.equal(evaluateCondition('$.request.leaveTypeId !== "sick"', ctx), true);
});
test('evaluateCondition: <= passes', () => {
  assert.equal(evaluateCondition('$.request.workingDays <= 6', ctx), true);
});
test('evaluateCondition: bare path truthy', () => {
  assert.equal(evaluateCondition('$.requester', ctx), true);
});
test('evaluateCondition: bare path missing is falsy', () => {
  assert.equal(evaluateCondition('$.nobody', ctx), false);
});
