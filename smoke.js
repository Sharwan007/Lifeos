'use strict';
// End-to-end API smoke test (starts the server on a random port with a temp data dir).
const os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-'));
process.env.APP_PASSWORD = 'secret';
const server = require('../server');
const auth = 'Basic ' + Buffer.from('admin:secret').toString('base64');

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (p, method = 'GET', body, hdr = { Authorization: auth }) => {
    const r = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, hdr), body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, j };
  };
  assert.strictEqual((await call('/api/profile', 'GET', null, {})).status, 401, 'auth required');
  assert.strictEqual((await call('/healthz', 'GET', null, {})).status, 200, 'health open');
  assert.strictEqual((await call('/api/plan')).status, 409, 'plan gated before profile');
  assert.strictEqual((await call('/api/profile', 'PUT', { age: 28 })).status, 400, 'incomplete profile rejected');
  const prof = { name: 'T', age: 28, gender: 'male', heightCm: 172, weightKg: 60, targetWeightKg: 68, experience: 'beginner', activity: 'light', dietPref: 'veg', conditions: 'none',
    workStart: '09:30', workEnd: '18:00', commuteMin: 30, wake: '06:00', sleep: '22:30', workoutTime: 'evening', equipment: 'gym', trainDays: 5, startDate: '2026-11-09', targetRole: 'Data Analyst', jobTimeline: '6 months', skills: { sql: 'basic' } };
  assert.strictEqual((await call('/api/profile', 'PUT', prof)).status, 200);
  const plan = (await call('/api/plan')).j; assert(plan.complete && plan.sections.length === 10); assert(plan.calc.target > plan.calc.maintenance);
  console.log('calc', JSON.stringify(plan.calc));
  // Monday of week 1 = training day (Upper A)
  let d = (await call('/api/day/2026-11-09')).j; assert.strictEqual(d.info.dayNumber, 1);
  assert(['morning', 'workday', 'fitness', 'nutrition', 'career', 'night'].every(id => d.sections.some(s => s.id === id)), 'all 6 sections');
  const ids = d.sections.flatMap(s => s.items.map(i => i.id)); assert.strictEqual(new Set(ids).size, ids.length, 'unique ids');
  const wo = d.sections.find(s => s.id === 'fitness').items.find(i => i.key === 'workout'); assert(wo, 'workout item on Monday');
  d = (await call('/api/day/2026-11-09', 'PUT', { checks: Object.fromEntries(ids.slice(0, 10).map(i => [i, true])), log: { weight: 60.2, steps: 7500, protein: 105, sleep: 7.5 } })).j;
  assert(d.score.done === 10 && d.state.log.weight === 60.2);
  // Sunday has weekly review; Wednesday no strength
  const sun = (await call('/api/day/2026-11-15')).j; assert(sun.sections.some(s => s.id === 'review'), 'Sunday review section');
  const wed = (await call('/api/day/2026-11-11')).j; assert(!wed.sections.find(s => s.id === 'fitness').items.some(i => i.key === 'workout'));
  // minimum day
  d = (await call('/api/day/2026-11-10', 'PUT', { mode: 'minimum', checks: { min1: true, min2: true, min3: true, min4: true, min5: true, min6: true, min7: true, min8: true } })).j;
  assert.strictEqual(d.score.score, 70, 'complete minimum day = 70');
  const wk = (await call('/api/week/2026-11-12?today=2026-11-15')).j; assert.strictEqual(wk.card.rows.length, 15); assert.strictEqual(wk.card.monday, '2026-11-09');
  console.log(wk.card.rows.map(r => r.label + ': ' + r.value).join('\n'));
  assert.strictEqual((await call('/api/review/2026-11-15', 'PUT', { wins: 'x', strengthLifts: 3 })).status, 200);
  assert.strictEqual((await call('/api/progress', 'POST', { date: '2026-11-09', weight: 60, squat: 40 })).status, 200);
  const job = (await call('/api/jobs', 'POST', { company: 'ACME', role: 'Analyst' })).j.job; assert(job.id);
  assert.strictEqual((await call('/api/jobs/' + job.id, 'PUT', { status: 'Technical' })).j.job.status, 'Technical');
  const ex = (await call('/api/export')).j; assert(ex.profile && ex.jobs.length === 1);
  const r = await fetch(base + '/'); assert.strictEqual(r.status, 401);
  const h = await fetch(base + '/', { headers: { Authorization: auth } }); assert((await h.text()).includes('LifeOS 90'));
  console.log('ALL SMOKE TESTS PASSED');
  require('../lib/store').flush(); server.close(); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
