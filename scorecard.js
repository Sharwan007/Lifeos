'use strict';
const core = require('./core');
const checklist = require('./checklist');
const { addDays, mondayOf, dayInfo, calc, weeklyApps } = core;

const num = v => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sum = a => a.reduce((x, y) => x + y, 0);
const r1 = x => x === null ? null : Math.round(x * 10) / 10;

function dayScore(p, db, date) {
  const st = (db.days || {})[date];
  if (!st || !p) return { score: null, done: 0, total: 0, mode: 'normal', counted: false };
  const cl = checklist.build(p, date);
  const mode = st.mode === 'minimum' ? 'minimum' : 'normal';
  const items = mode === 'minimum' ? cl.minItems : cl.sections.flatMap(s => s.items);
  const done = items.filter(i => st.checks && st.checks[i.id]).length;
  const pct = items.length ? done / items.length * 100 : 0;
  const score = mode === 'minimum' ? pct * 0.7 : pct;
  return { score: Math.round(score), done, total: items.length, mode, counted: done > 0 };
}

function streak(p, db, today) {
  let s = 0, d = today;
  // today may still be in progress: don't break streak if no data yet
  const sc0 = dayScore(p, db, d);
  if (!sc0.counted || sc0.score < 50) d = addDays(d, -1);
  while (true) {
    const sc = dayScore(p, db, d);
    const ok = sc.score !== null && ((sc.mode === 'normal' && sc.score >= 70) || (sc.mode === 'minimum' && sc.score >= 70 * 0.99));
    if (!ok) break; s++; d = addDays(d, -1);
    if (s > 400) break;
  }
  return s;
}

function weekCard(p, db, monday, today) {
  const c = calc(p);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const per = dates.map(d => {
    const st = (db.days || {})[d] || {};
    const log = st.log || {};
    const cl = checklist.build(p, d);
    const info = cl.info;
    const normal = st.mode !== 'minimum';
    const has = key => normal && cl.sections.some(s => s.items.some(i => i.key === key)) ? cl.sections.flatMap(s => s.items).filter(i => i.key === key) : [];
    const isDone = key => { const it = has(key); return it.length && it.every(i => st.checks && st.checks[i.id]); };
    return { date: d, st, log, info, cl, normal, has, isDone, ds: dayScore(p, db, d) };
  });
  const active = per.filter(x => !x.info.before && !x.info.beyond);
  const planned = {
    workouts: active.filter(x => x.cl.sections.some(sc => sc.items.some(i => i.key === 'workout'))).length,
  };
  const wDone = active.filter(x => x.isDone('workout')).length;
  const w = per.map(x => num(x.log.weight)).filter(v => v !== null);
  const L = k => per.map(x => num(x.log[k])).filter(v => v !== null);
  const protein = L('protein'), cals = L('calories'), water = L('water'), sleep = L('sleep'), steps = L('steps'), study = L('studyH'), mood = L('mood'), stress = L('stress');
  const sumApps = sum(L('applications'));
  const spDays = active.filter(x => x.isDone('practice') || (!x.normal && x.st.checks && x.st.checks.min6)).length;
  const intDays = active.filter(x => x.isDone('interview')).length;
  const medDays = active.filter(x => x.isDone('meditation') || (!x.normal && x.st.checks && x.st.checks.min2)).length;
  const elapsed = active.filter(x => !today || x.date < today || (x.date === today && x.ds.counted));
  const scores = elapsed.map(x => x.ds.counted ? x.ds.score : 0); // un-logged elapsed days score 0
  const overall = elapsed.length ? Math.round(sum(scores) / elapsed.length) : null;
  const review = (db.reviews || {})[monday] || {};
  const strengthLifts = num(review.strengthLifts);
  const T = c || {};
  const rows = [
    { id: 'weight', label: 'Body weight (avg)', value: w.length ? r1(avg(w)) + ' kg' : '-', target: `+${(T.weeklyGain || [0.15, 0.3])[0]} to +${(T.weeklyGain || [0.15, 0.3])[1]} kg vs last week`, raw: avg(w) },
    { id: 'workout', label: 'Workout completion', value: `${wDone}/${planned.workouts}`, target: `${planned.workouts}/${planned.workouts}`, ok: planned.workouts ? wDone / planned.workouts : null },
    { id: 'strength', label: 'Strength progress (lifts improved)', value: strengthLifts === null ? '-' : String(strengthLifts), target: '≥ 3 lifts progressed (non-deload weeks)', ok: strengthLifts === null ? null : Math.min(1, strengthLifts / 3) },
    { id: 'protein', label: 'Protein target', value: protein.length ? `${protein.filter(v => T.protein && v >= T.protein * .9).length}/7 days (avg ${Math.round(avg(protein))} g)` : '-', target: `${T.protein || '-'} g, ≥ 5/7 days`, ok: protein.length && T.protein ? protein.filter(v => v >= T.protein * .9).length / 5 : null },
    { id: 'calories', label: 'Calories (avg)', value: cals.length ? Math.round(avg(cals)) + ' kcal' : '-', target: `${T.target || '-'} ±150`, ok: cals.length && T.target ? (Math.abs(avg(cals) - T.target) <= 150 ? 1 : Math.abs(avg(cals) - T.target) <= 300 ? .5 : 0) : null },
    { id: 'water', label: 'Water', value: water.length ? `${water.filter(v => v >= (T.water || 3)).length}/7 days (avg ${r1(avg(water))} L)` : '-', target: `${T.water || '-'} L, ≥ 6/7 days`, ok: water.length ? water.filter(v => v >= (T.water || 3)).length / 6 : null },
    { id: 'sleep', label: 'Sleep (avg)', value: sleep.length ? r1(avg(sleep)) + ' h' : '-', target: '7.5-8 h, ≥ 5 nights ≥ 7 h', ok: sleep.length ? Math.min(1, avg(sleep) / 7.5) : null },
    { id: 'steps', label: 'Steps (avg)', value: steps.length ? Math.round(avg(steps)).toLocaleString('en-IN') : '-', target: `${core.stepTarget(active[0] ? active[0].info.phase : 1).toLocaleString('en-IN')}/day`, ok: steps.length ? Math.min(1, avg(steps) / core.stepTarget(active[0] ? active[0].info.phase : 1)) : null },
    { id: 'meditation', label: 'Meditation days', value: `${medDays}/7`, target: '≥ 6/7', ok: Math.min(1, medDays / 6) },
    { id: 'study', label: 'Study hours', value: study.length ? r1(sum(study)) + ' h' : '-', target: '9-10 h', ok: study.length ? Math.min(1, sum(study) / 9) : null },
    { id: 'practice', label: 'SQL/Python practice days', value: `${spDays}/7`, target: '≥ 6/7', ok: Math.min(1, spDays / 6) },
    { id: 'interview', label: 'Interview preparation days', value: `${intDays}/7`, target: '≥ 6/7', ok: Math.min(1, intDays / 6) },
    { id: 'applications', label: 'Job applications', value: String(sumApps), target: String(weeklyApps(active[0] ? active[0].info.week : 1)), ok: weeklyApps(active[0] ? active[0].info.week : 1) ? Math.min(1, sumApps / weeklyApps(active[0].info.week)) : null },
    { id: 'mood', label: 'Mood / stress (avg 1-5)', value: mood.length || stress.length ? `mood ${mood.length ? r1(avg(mood)) : '-'} / stress ${stress.length ? r1(avg(stress)) : '-'}` : '-', target: 'mood ≥ 3.5, stress ≤ 3', ok: mood.length ? (avg(mood) >= 3.5 && (!stress.length || avg(stress) <= 3) ? 1 : .5) : null },
    { id: 'discipline', label: 'Overall weekly discipline score', value: overall === null ? '-' : overall + '%', target: '≥ 75%', ok: overall === null ? null : overall / 75 },
  ];
  rows.forEach(r => { r.status = r.ok === null || r.ok === undefined ? 'na' : r.ok >= 1 ? 'good' : r.ok >= .6 ? 'ok' : 'low'; });
  const grade = overall === null ? '-' : overall >= 85 ? 'Excellent' : overall >= 70 ? 'Solid' : overall >= 50 ? 'Recoverable: tighten one habit' : 'Reset week: use Minimum Days and rebuild';
  return { monday, dates, rows, overall, grade, daily: per.map(x => ({ date: x.date, score: x.ds.score, mode: x.ds.mode, done: x.ds.done, total: x.ds.total })), avgWeight: w.length ? avg(w) : null, review };
}

function suggestions(p, db, monday, card) {
  const c = calc(p); const out = [];
  const prev = weekCard(p, db, addDays(monday, -7), null);
  const prev2 = weekCard(p, db, addDays(monday, -14), null);
  const w0 = card.avgWeight, w1 = prev.avgWeight, w2 = prev2.avgWeight;
  if (w0 !== null && w1 !== null) {
    const d = w0 - w1;
    const limit = c ? c.weeklyGain : [0.15, 0.3];
    if (d < 0.1 && w2 !== null && w1 - w2 < 0.1) out.push('Weight has been flat for 2+ weeks: add 150-250 kcal/day (e.g., banana + peanut butter + milk) and re-check in 2 weeks.');
    else if (d > limit[1] * 1.6) out.push(`You gained ${d.toFixed(2)} kg this week, above the ${limit[1]} kg ceiling: trim 100-150 kcal/day if this continues for 3 weeks.`);
    else out.push(`Weight trend ${d >= 0 ? '+' : ''}${d.toFixed(2)} kg vs last week: on track. Keep calories unchanged.`);
  } else out.push('Log your weight on at least 3 days (same time, same conditions) so I can calculate your trend.');
  const get = id => card.rows.find(r => r.id === id);
  if (get('sleep').status === 'low') out.push('Sleep is your weakest lever: move bedtime 30 min earlier and set a phone-away alarm.');
  if (get('protein').status === 'low') out.push('Protein was missed on several days: pre-plan one extra protein snack (curd, eggs, paneer, chana) and prep Sunday proteins.');
  if (get('workout').status === 'low') out.push('Workouts were missed: pre-schedule sessions and use the 20-min minimum version rather than skipping.');
  if (get('practice').status === 'low') out.push('Practice days are low: put SQL/Python at the same time daily and start with 15 min only.');
  if (get('applications').status === 'low') out.push('Applications are behind: block Saturday 60 min and apply to fewer but better-matched roles.');
  if (card.overall !== null && card.overall < 50) out.push('Overall score is low: this is a data point, not a failure. Use the Minimum Day on busy days and repeat this week.');
  if (card.overall !== null && card.overall >= 85) out.push('Excellent week. Keep the plan; avoid adding extras. Sustainability beats intensity.');
  return out;
}

module.exports = { dayScore, streak, weekCard, suggestions };
