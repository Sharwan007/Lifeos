'use strict';
// Core calculations: profile validation, calories/macros, phases, workouts, timetable.

const REQUIRED = {
  age: 'Age', gender: 'Gender', heightCm: 'Height (cm)', weightKg: 'Current weight (kg)',
  targetWeightKg: 'Target weight (kg)', experience: 'Training experience', dietPref: 'Dietary preference',
  workStart: 'Work start time', workEnd: 'Work end time', wake: 'Current/target wake-up time',
  sleep: 'Bedtime', equipment: 'Gym / home workout availability', trainDays: 'Training days per week',
  activity: 'Daily activity level (outside training)', targetRole: 'Target job/role',
  jobTimeline: 'Target timeline for job change', startDate: 'Plan start date',
};

function missingFields(p) {
  if (!p) return Object.values(REQUIRED);
  return Object.keys(REQUIRED).filter(k => p[k] === undefined || p[k] === null || p[k] === '').map(k => REQUIRED[k]);
}

// ---------- date / time helpers ----------
const pad = n => String(n).padStart(2, '0');
const toMin = s => { const [h, m] = String(s || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmtT = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${pad(mm)} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m} min`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const isoDate = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (s, n) => isoDate(parseDate(s) + n * 86400000);
const dow = s => new Date(parseDate(s)).getUTCDay();            // 0 = Sunday
const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseDate(s));

function dayInfo(p, date) {
  const n = diffDays(date, p.startDate) + 1;                    // plan day number (1-based); <1 = before start
  const day = Math.max(n, 1);
  const week = Math.min(Math.ceil(day / 7), 13);
  const phase = day <= 30 ? 1 : day <= 60 ? 2 : 3;
  const deload = [4, 8, 12].includes(week);
  return { dayNumber: n, beyond: n > 90, before: n < 1, week, phase, deload,
    phaseName: ['Foundation', 'Progression', 'Transformation'][phase - 1], dow: dow(date) };
}

// ---------- calories & macros ----------
const ACT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
const r5 = n => Math.round(n / 5) * 5;

function calc(p) {
  if (!p || !p.age || !p.heightCm || !p.weightKg || !p.gender || !p.activity) return null;
  const w = +p.weightKg, h = +p.heightCm, a = +p.age;
  const sexAdj = p.gender === 'male' ? 5 : p.gender === 'female' ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * a + sexAdj;                 // Mifflin-St Jeor
  const factor = ACT[p.activity] || 1.375;
  const maintenance = bmr * factor;
  const surplus = 300;
  const target = maintenance + surplus;
  const protein = r5(1.8 * w), fat = r5(0.9 * w);
  const carbs = r5((target - protein * 4 - fat * 9) / 4);
  const bmi = w / Math.pow(h / 100, 2);
  const tgt = +p.targetWeightKg;
  const tBmi = tgt ? tgt / Math.pow(h / 100, 2) : null;
  const rate = [0.0025 * w, 0.005 * w];
  const mid = (rate[0] + rate[1]) / 2;
  return {
    bmr: r5(bmr), factor, maintenance: r5(maintenance), surplus, target: r5(target),
    protein, proteinRange: [r5(1.6 * w), r5(2.2 * w)], fat, carbs,
    water: Math.min(4, Math.max(2.5, Math.round(w * 0.035 * 4) / 4)),
    bmi: +bmi.toFixed(1), targetBmi: tBmi ? +tBmi.toFixed(1) : null,
    weeklyGain: rate.map(x => +x.toFixed(2)),
    gainIn90: [+(rate[0] * 12.9).toFixed(1), +(rate[1] * 12.9).toFixed(1)],
    weeksToTarget: tgt > w ? Math.ceil((tgt - w) / mid) : null,
    sleepHours: ((toMin(p.wake) - toMin(p.sleep) + 1440) % 1440) / 60,
  };
}

function flags(p, c) {
  const f = [];
  if (!p || !c) return f;
  if (p.conditions && p.conditions.trim() && !/^(none|no|nil|n\/a|-)$/i.test(p.conditions.trim()))
    f.push(`You listed a medical condition/injury ("${p.conditions.trim()}"). Get clearance from your doctor before starting this training and nutrition plan, and ask a physiotherapist about exercise modifications.`);
  if (+p.age < 18) f.push('You are under 18: training load, supplements and calorie targets should be set with a doctor/paediatric dietitian. Treat this plan as a draft.');
  if (+p.age >= 45) f.push('At 45+, a basic health check (BP, blood sugar, lipids, ECG if advised) before heavy lifting is sensible.');
  if (c.bmi < 17) f.push(`Your BMI (${c.bmi}) is very low. Please consult a doctor/registered dietitian to rule out medical causes before a surplus plan.`);
  if (c.bmi > 27) f.push(`Your BMI (${c.bmi}) is high. A lean-bulk surplus may not suit you; discuss a body-recomposition approach with a doctor or registered dietitian.`);
  if (c.targetBmi && c.targetBmi > 25) f.push(`Your target weight gives a BMI of ${c.targetBmi}. Asian-Indian health cut-offs are lower than global ones; confirm the target with a doctor/dietitian.`);
  if (+p.targetWeightKg <= +p.weightKg) f.push('Target weight is not above current weight. This plan is built for muscle gain; adjust your target or consult a dietitian for a recomposition plan.');
  if (c.sleepHours < 7) f.push(`Your wake/bed times give only ${c.sleepHours.toFixed(1)} h in bed. Aim for 7.5-8 h; sleep is when you recover and build muscle.`);
  return f;
}

// ---------- strength programme ----------
// [name, sets, reps, rest, type, home alternative]
const S = {
  UA: { name: 'Upper A - Strength', focus: 'Heavy compounds (chest, back, shoulders) + arms', ex: [
    ['Barbell or machine bench press', 4, '6-8', '2-3 min', 'Compound', 'Dumbbell floor/bench press or push-ups (feet elevated)'],
    ['Seated cable row / barbell row', 4, '6-8', '2-3 min', 'Compound', 'One-arm dumbbell row'],
    ['Seated dumbbell shoulder press', 3, '8-10', '2 min', 'Compound', 'Standing dumbbell press / pike push-ups'],
    ['Lat pulldown (or assisted pull-up)', 3, '8-10', '2 min', 'Compound', 'Pull-ups / band pulldown'],
    ['Dumbbell lateral raise', 3, '12-15', '60-90 s', 'Isolation', 'Same'],
    ['Cable triceps pushdown', 3, '10-12', '60-90 s', 'Isolation', 'Dumbbell overhead triceps extension'],
    ['Incline dumbbell curl', 3, '10-12', '60-90 s', 'Isolation', 'Standing dumbbell curl'] ] },
  LA: { name: 'Lower A - Strength', focus: 'Squat pattern, hamstrings, calves, core', ex: [
    ['Back squat or leg press', 4, '6-8', '2-3 min', 'Compound', 'Goblet squat (heavy dumbbell), tempo 3-1-1'],
    ['Romanian deadlift', 3, '8-10', '2 min', 'Compound', 'Dumbbell Romanian deadlift'],
    ['Walking or reverse lunges', 3, '10/leg', '90 s', 'Compound', 'Same with dumbbells'],
    ['Seated/lying leg curl', 3, '10-12', '60-90 s', 'Isolation', 'Slider/towel hamstring curl'],
    ['Standing calf raise', 4, '10-15', '60 s', 'Isolation', 'Single-leg calf raise on a step'],
    ['Plank', 3, '40-60 s', '60 s', 'Core', 'Same'] ] },
  UB: { name: 'Upper B - Hypertrophy', focus: 'Higher reps, muscle size, upper chest & back width', ex: [
    ['Incline dumbbell press', 4, '8-10', '2 min', 'Compound', 'Dumbbell press with feet-elevated push-ups'],
    ['Chest-supported or one-arm dumbbell row', 4, '8-10', '90 s-2 min', 'Compound', 'Dumbbell/backpack row'],
    ['Cable or dumbbell chest fly', 3, '12-15', '60-90 s', 'Isolation', 'Dumbbell fly / slow push-ups'],
    ['Face pull or rear-delt fly', 3, '12-15', '60 s', 'Isolation', 'Band face pull / bent-over rear-delt raise'],
    ['Hammer curl', 3, '10-12', '60 s', 'Isolation', 'Same'],
    ['Overhead triceps extension', 3, '10-12', '60 s', 'Isolation', 'Dumbbell overhead extension'] ] },
  LB: { name: 'Lower B - Hypertrophy', focus: 'Hinge, glutes, quads, calves, abs', ex: [
    ['Conventional or trap-bar deadlift', 3, '5', '3 min', 'Compound', 'Heavy dumbbell Romanian deadlift'],
    ['Leg press or Bulgarian split squat', 3, '8-10', '2 min', 'Compound', 'Bulgarian split squat with dumbbells'],
    ['Hip thrust', 3, '8-12', '90 s', 'Compound', 'Dumbbell/backpack glute bridge'],
    ['Leg extension', 3, '12-15', '60-90 s', 'Isolation', 'Tempo bodyweight squat (4 s down)'],
    ['Seated calf raise', 4, '12-15', '60 s', 'Isolation', 'Single-leg calf raise'],
    ['Hanging knee raise / cable crunch', 3, '10-15', '60 s', 'Core', 'Lying leg raise / crunch'] ] },
  AD: { name: 'Arms, Shoulders & Core', focus: 'Weak-point day: shoulders, arms, upper back, abs', ex: [
    ['Dumbbell lateral raise (drop set on last set)', 4, '12-15', '60 s', 'Isolation', 'Same'],
    ['EZ-bar or dumbbell curl', 3, '8-12', '60-90 s', 'Isolation', 'Dumbbell curl'],
    ['Close-grip bench press or dips', 3, '8-10', '90 s', 'Compound', 'Close-grip push-ups / bench dips'],
    ['Rear-delt fly', 3, '12-15', '60 s', 'Isolation', 'Bent-over dumbbell fly'],
    ['Cable/dumbbell shrug', 3, '10-12', '60 s', 'Isolation', 'Dumbbell shrug'],
    ['Cable crunch / ab wheel', 3, '10-15', '60 s', 'Core', 'Crunch / dead bug'] ] },
};
const WEEK4 = { 1: 'UA', 2: 'LA', 4: 'UB', 5: 'LB' };
const WEEK5 = { 1: 'UA', 2: 'LA', 4: 'UB', 5: 'LB', 6: 'AD' };
const weekLayout = p => (+p.trainDays === 5 ? WEEK5 : WEEK4);

function sessionFor(p, d, info) {
  const key = weekLayout(p)[info.dow];
  if (!key) return null;
  const base = S[key];
  const beginnerP1 = p.experience === 'beginner' && info.phase === 1;
  const ex = base.ex.map(e => {
    let sets = e[1];
    if (beginnerP1) sets = Math.min(sets, 3);
    if (info.deload) sets = Math.max(2, Math.round(sets * 0.6));
    return { name: e[0], sets, reps: e[2], rest: e[3], type: e[4], home: e[5] };
  });
  return { key, name: base.name, focus: base.focus, exercises: ex };
}

function cardioDay(p, dw) { // 0 Sun..6 Sat
  if (dw === 3) return true;
  if (+p.trainDays === 4 && dw === 6) return true;
  if (+p.trainDays === 5 && dw === 0) return true; // easy walk
  return false;
}

// ---------- phase-scaled targets ----------
const meditationMin = day => day <= 14 ? 5 : day <= 30 ? 8 : day <= 45 ? 10 : day <= 60 ? 12 : day <= 75 ? 15 : 20;
const stepTarget = phase => phase === 1 ? 7000 : 8000;
const studyMin = phase => phase === 1 ? 60 : phase === 2 ? 75 : 90;
const interviewMin = (week) => week <= 2 ? 10 : week <= 4 ? 20 : week <= 8 ? 30 : 45;
const weeklyApps = week => week <= 2 ? 0 : week <= 4 ? 3 : week <= 8 ? 7 : 10;
function appsToday(week, dw) {
  const w = weeklyApps(week);
  if (w === 0) return 0;
  if (w === 3) return [2, 4, 6].includes(dw) ? 1 : 0;
  if (w === 7) return dw >= 1 && dw <= 5 ? 1 : dw === 6 ? 2 : 0;
  return dw >= 1 && dw <= 5 ? 2 : 0;
}

// ---------- timetable ----------
function seq(start, rows, endAt) {
  // rows: [dur|'*', title, note]; '*' fills until endAt
  const fixed = rows.reduce((a, r) => a + (r[0] === '*' ? 0 : r[0]), 0);
  const flex = Math.max(0, endAt - start - fixed);
  let cur = start; const out = [];
  for (const [d, t, n] of rows) {
    const dur = d === '*' ? flex : d;
    if (dur <= 0) continue;
    out.push({ time: `${fmtT(cur)} - ${fmtT(cur + dur)}`, activity: t, note: n || '', mins: dur });
    cur += dur;
  }
  return { rows: out, end: cur, overflow: cur > endAt };
}

function timetable(p, c) {
  const W = toMin(p.wake); let B = toMin(p.sleep); if (B <= W) B += 1440;
  const S0 = toMin(p.workStart), E = toMin(p.workEnd), cm = +p.commuteMin || 0;
  const med = 10, warnings = []; let morningStudy = false;
  const leave = S0 - cm;
  const morningOk = (leave - W) >= 200;
  const mode = p.workoutTime === 'morning' && morningOk ? 'morning' : 'evening';
  if (p.workoutTime === 'morning' && !morningOk) warnings.push('A morning workout does not fit before work with your wake time, so training is placed after work. Wake earlier by ~45 min if you prefer mornings.');
  const mid = Math.round((S0 + (E - S0) / 2 - 15) / 15) * 15;
  const work = [
    [cm > 0 ? cm : 0, 'Commute to work', 'Podcast/audiobook or interview questions in your head - not social media'],
    [mid - S0, 'Work block 1', 'Deep-work first. Stand/stretch 3-5 min every 90 min; sip water'],
    [45, 'Lunch + 10-min walk', 'Eat away from your desk, protein first'],
    [E - mid - 45, 'Work block 2', 'Protein snack at ~4 PM (curd, chana, fruit, nuts). Stop work at ' + fmtT(E)],
    [cm > 0 ? cm : 0, 'Commute home', 'Light audio, breathing or a call with family'],
  ];
  let pre, post;
  if (mode === 'morning') {
    pre = seq(W, [[5, 'Wake up', 'Water 500 ml, open curtains, no phone'], [15, 'Toilet, brush, wash face', ''],
      [med, 'Meditation', 'Breath awareness'], [10, 'Pre-workout snack + top-3 priorities', 'Banana + tea/coffee'],
      [70, 'Workout (Wed: 30-min zone-2 walk + mobility)', 'Warm-up, lifts, cool-down'], [20, 'Shower & grooming', 'Moisturiser + sunscreen'],
      [25, 'Breakfast (post-workout meal)', 'Protein + carbs'], [Math.max(0, leave - (W + 5 + 15 + med + 10 + 70 + 20 + 25)), 'Buffer: pack lunch/bag', 'Review 3 interview questions']], leave);
    if (pre.overflow) warnings.push('Morning routine runs into your commute: wake 15-20 min earlier or shorten the buffer.');
  } else {
    var bufLen = Math.max(0, leave - (W + 5 + 15 + med + 10 + 25 + 10));
    if (bufLen >= 45) { morningStudy = true; }
    pre = seq(W, [[5, 'Wake up', 'Water 500 ml, open curtains, no phone'], [15, 'Toilet, brush, wash face, shower', 'Moisturiser + sunscreen'],
      [med, 'Meditation', 'Breath awareness'], [10, 'Journal: top-3 priorities', ''], [25, 'Breakfast', 'Protein + carbs'],
      [10, 'Mobility (hips, shoulders, thoracic)', ''], [bufLen >= 45 ? Math.min(bufLen - 10, 75) : bufLen, bufLen >= 45 ? 'Morning study block (SQL / Python / Power BI)' : 'Buffer: pack lunch/bag, 15 min learning or interview Qs', bufLen >= 45 ? 'Fresh-brain learning, phone away' : ''], [bufLen >= 45 ? bufLen - Math.min(bufLen - 10, 75) : 0, 'Buffer: pack lunch/bag, relax, no social media', '']], leave);
    if (pre.overflow) warnings.push('Morning routine runs into your commute: wake 15 min earlier.');
  }
  const workRows = []; let cur = leave;
  for (const [d, t, n] of work) { if (d <= 0) continue; workRows.push({ time: `${fmtT(cur)} - ${fmtT(cur + d)}`, activity: t, note: n, mins: d }); cur += d; }
  const home = E + cm;
  const nightMin = 35, windDown = B - nightMin;
  const evFor = (studyDur, lean) => mode === 'morning'
    ? [[20, 'Decompress: change, wash, short walk', ''], [40, 'Cook / heat meal-prepped dinner, eat', 'Finish ≥ 2 h before bed'],
      [studyDur, 'Study block (SQL / Python / Power BI)', 'Phone away; Pomodoro 25/5'], [20, 'Interview prep', 'Questions, STAR story, mock'],
      ['*', 'Family, personal time, entertainment', 'Guilt-free; screens off 30 min before bed'], [nightMin, 'Night routine', 'Journal, gratitude, prep tomorrow, breathing']]
    : [[lean ? 15 : 25, 'Pre-workout snack + change', 'Banana + peanut butter/sattu 60-90 min before lifting'], [lean ? 60 : 70, 'Workout (Wed: 30-min zone-2 + mobility)', 'Warm-up, lifts, cool-down'],
      [lean ? 15 : 20, 'Shower & grooming', ''], [lean ? 40 : 45, 'Cook / heat dinner, eat (post-workout meal)', 'Protein + carbs, finish ≥ 2 h before bed'],
      [studyDur, 'Study block (SQL / Python / Power BI)', 'Phone away; Pomodoro 25/5'], [20, 'Interview prep', 'Questions, STAR story, mock'],
      ['*', 'Family, personal time, entertainment', 'Guilt-free; screens off 30 min before bed'], [nightMin, 'Night routine', 'Journal, gratitude, prep tomorrow, breathing']];
  let ev = null, free = null;
  const tries = (morningStudy ? [[30, false], [0, false]] : [[55, false], [40, false], [30, false], [0, false]]).concat([[0, true]]);
  for (const [sd, lean] of tries) {
    ev = seq(home, evFor(sd, lean), B);
    free = ev.rows.find(r => r.activity.startsWith('Family'));
    if (!ev.overflow && free && free.mins >= 40) break;
  }
  if (ev.overflow || !free || free.mins < 30) warnings.push('Your weekday evening is very tight even after trimming study. Consider training in the morning, or moving study to Saturday/Sunday.');
  else if (morningStudy) warnings.push('You have a long morning gap, so the main study block is placed in the morning and evenings stay lighter.');
  const weekday = [...pre.rows, ...workRows, ...ev.rows, { time: fmtT(B), activity: 'Lights out', note: `${((B - W) / 60).toFixed(1)} h in bed`, mins: 0 }];

  const wk = W + 30;
  const satTrain = +p.trainDays === 5;
  const sat = seq(wk, [[20, 'Wake, water, hygiene', 'No phone for 30 min'], [meditation10(), 'Meditation', ''],
    [satTrain ? 15 : 0, 'Pre-workout snack', ''], [satTrain ? 70 : 40, satTrain ? 'Workout: Arms, Shoulders & Core' : 'Zone-2 cardio (walk/cycle/swim) 30-40 min', ''],
    [30, 'Shower + breakfast', ''], [150, 'Deep learning / portfolio project', 'Your biggest career block of the week'],
    [60, 'Lunch + rest', ''], [60, 'Job applications, LinkedIn, networking', 'Quality over quantity'],
    ['*', 'Family, friends, outing, entertainment', 'Fully off-duty'], [nightMin, 'Night routine', '']], B + 30 - 0);
  const sun = seq(wk, [[20, 'Wake, water, hygiene', ''], [15, 'Meditation', ''], [40, 'Easy walk (optional) / mobility', 'Rest day'], [30, 'Breakfast', ''],
    [90, 'Meal prep + groceries', 'Batch-cook for 3-4 days'], [45, 'Lunch + rest', ''], [60, 'WEEKLY REVIEW', 'Weigh-in, scorecard, Sunday review, plan next week'],
    [60, 'Light study + 1 mock interview', ''], ['*', 'Family, entertainment, relax', ''], [20, 'Prep for Monday (clothes, bag, tiffin)', ''], [nightMin, 'Night routine', 'Aim for bed on time - Monday starts well on Sunday night']], B);
  const addSleep = r => [...r.rows, { time: fmtT(B), activity: 'Lights out', note: 'Within 30 min of your weekday bedtime', mins: 0 }];
  return { mode, warnings, weekday, saturday: addSleep(sat), sunday: addSleep(sun) };
}
function meditation10() { return 10; }

module.exports = { REQUIRED, missingFields, pad, toMin, fmtT, fmtDur, parseDate, isoDate, addDays, dow, mondayOf, diffDays, validDate,
  dayInfo, calc, flags, S, sessionFor, weekLayout, cardioDay, meditationMin, stepTarget, studyMin, interviewMin, weeklyApps, appsToday, timetable };
