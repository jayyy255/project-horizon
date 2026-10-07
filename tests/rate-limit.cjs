const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { RequestLimiter } = require('../dist-electron/electron/agent/rateLimit');
let serial = 0;
function fixture(perMinute = 2, perDay = 3) {
  const file = path.resolve('scratch/rate-limit-regressions', String(Date.now()), String(++serial), 'usage.json');
  let now = 100000000;
  return { file, advance: ms => { now += ms; }, create: () => new RequestLimiter(file, perMinute, perDay, () => now) };
}
test('Minute limit blocks another outbound call and returns retry timing', () => {
  const f = fixture(), limit = f.create();
  assert.equal(limit.take().allowed, true); assert.equal(limit.take().allowed, true);
  assert.deepEqual(limit.take(), { allowed: false, retryAfterSeconds: 60, error: 'AI request limit reached. Try again in 60 seconds.' });
});
test('Minute limit releases capacity at the window boundary', () => {
  const f = fixture(), limit = f.create(); limit.take(); limit.take(); f.advance(60000); assert.equal(limit.take().allowed, true);
});
test('Daily usage persists across an application restart', () => {
  const f = fixture(10, 3), first = f.create(); first.take(); first.take(); first.take();
  const result = f.create().take(); assert.equal(result.allowed, false); assert.match(result.error, /Daily/);
});
test('Daily allowance resets after the rolling 24-hour window', () => {
  const f = fixture(10, 1), limit = f.create(); limit.take(); f.advance(86400000); assert.equal(limit.take().allowed, true);
});
test('Blocked attempts do not consume additional allowance', () => {
  const f = fixture(), limit = f.create(); limit.take(); limit.take(); limit.take(); limit.take();
  assert.equal(JSON.parse(fs.readFileSync(f.file)).requests.length, 2);
});
test('Storage failure stops unaccounted requests', () => {
  const f = fixture(); fs.mkdirSync(f.file, { recursive: true }); assert.equal(f.create().take().allowed, false);
});
