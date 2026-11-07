'use strict';
// Daily checklist generator: every item is measurable (Done / Not done).
const core = require('./core');
const { MIN_ITEMS } = require('./content');
const { dayInfo, calc, fmtT, toMin, sessionFor, cardioDay, meditationMin, stepTarget, studyMin, interviewMin, appsToday, weeklyApps } = core;

const FOCUS = {
  1: 'SQL: SELECT/WHERE/GROUP BY', 2: 'SQL: JOINs & CASE WHEN', 3: 'SQL: subqueries & CTEs', 4: 'SQL: window functions',
  5: 'Power BI: data model', 6: 'Power BI: DAX & visuals', 7: 'Python: pandas', 8: 'Python: EDA & Project 1',
  9: 'Statistics & A/B testing', 10: 'Business problem solving & automation', 11: 'AI/automation project', 12: 'Mock interviews & portfolio', 13: 'Interview loop & applications',
};
const PRACTICE = { 1: 'SQL', 2: 'SQL', 3: 'SQL', 4: 'SQL', 5: 'Power BI', 6: 'Power BI', 7: 'Python', 8: 'Python', 9: 'Statistics', 10: 'Python', 11: 'Python/AI', 12: 'SQL + Python', 13: 'SQL + Python' };

function build(p, date) {
  const info = dayInfo(p, date);
  const c = calc(p);
  const dw = info.dow, weekend = dw === 0 || dw === 6, sunday = dw === 0, saturday = dw === 6;
  const sess = sessionFor(p, date, info);
  const cardio = cardioDay(p, dw);
  const wake = fmtT(toMin(p.wake) + (weekend ? 30 : 0));
  const bed = fmtT(toMin(p.sleep) + (weekend ? 30 : 0));
  const med = meditationMin(Math.max(1, Math.min(info.dayNumber, 90)));
  const steps = stepTarget(info.phase).toLocaleString('en-IN');
  const slots = [.22, .28, .1, .12, .28];
  const kc = f => c ? `~${Math.round(c.target * f / 10) * 10} kcal` : '';
  const pr = f => c ? `${Math.round(c.protein * f)} g protein` : '';
  const deloadNote = info.deload ? ' (deload week: fewer sets)' : '';
  const sections = [];
  const sec = (id, title, items) => sections.push({ id, title, items });
  const I = (id, text, key) => ({ id, text, key });

  sec('morning', 'Morning', [
    I('m_wake', `Wake up by ${wake} (±15 min)`, 'wake'),
    I('m_water', 'Drink 500 ml water within 30 min of waking'),
    I('m_nophone', 'No phone/social media for the first 30 minutes'),
    I('m_hygiene', 'Brush, wash face, shower/grooming; moisturiser + sunscreen'),
    I('m_med', `Meditate ${med} min (${info.dayNumber <= 14 ? 'breath counting' : info.dayNumber <= 45 ? 'breath awareness / body scan' : 'your chosen style'})`, 'meditation'),
    I('m_plan', 'Write top-3 priorities for the day (2 min)'),
  ]);

  if (weekend) {
    sec('workday', saturday ? 'Workday (Saturday plan)' : 'Workday (Sunday plan)', [
      I('w_block', saturday ? 'Complete the 2.5-h deep learning / portfolio project block' : 'Complete 1 focused hour of light study + 1 mock interview', 'weekendfocus'),
      I('w_family', 'Spend ≥ 60 min of phone-free family/friends/personal time'),
      I('w_ent', 'Entertainment limited to ≤ 90 min (guilt-free, planned)'),
      I('w_steps', `Reach ${steps} steps (walk, outing, errands)`, 'steps'),
      I('w_clean', saturday ? 'Do 30 min of home/admin chores (laundry, bills, room reset)' : 'Do a 20-min room/desk reset for Monday'),
    ]);
  } else {
    sec('workday', 'Workday', [
      I('w_top3', 'Complete at least 2 of your 3 priorities'),
      I('w_break', 'Stand/stretch 3-5 min every 90 min (≥ 3 breaks)'),
      I('w_lunch', 'Eat lunch away from your desk with no screen, then 10-min walk'),
      I('w_steps', `Reach ${steps} steps`, 'steps'),
      I('w_screen', 'Personal phone use ≤ 2 h today (check Screen Time)'),
      I('w_posture', 'Posture and eye breaks (20-20-20) done'),
    ]);
  }

  // Fitness
  const fit = [];
  if (sess) {
    const n = sess.exercises.length;
    fit.push(I('f_warm', 'Warm-up + mobility (8-10 min) done'));
    fit.push(I('f_workout', `Complete ${sess.name}: all ${n} exercises with planned sets/reps${deloadNote}`, 'workout'));
    fit.push(I('f_over', info.deload ? 'Deload: stopped every set with 3+ reps in reserve' : 'Beat last session on at least 1 lift (extra rep or small weight increase)', 'overload'));
    fit.push(I('f_log', 'Log all sets in the Progress tab / notebook'));
    fit.push(I('f_cool', 'Cool-down stretch (5 min)'));
  } else if (cardio) {
    fit.push(I('f_cardio', dw === 3 ? 'Zone-2 cardio 25-30 min (talk-test pace) + 10 min mobility' : dw === 6 ? 'Zone-2 cardio 30-40 min or a sport you enjoy' : 'Easy 30-40 min walk (optional recovery)', 'cardio'));
    if (dw !== 0) fit.push(I('f_mob', 'Mobility session 10 min (hips, shoulders, thoracic spine)'));
  } else {
    fit.push(I('f_rest', 'Full rest: no training, light movement only'));
  }
  fit.push(I('f_stretch', 'Stretch/foam-roll 5-10 min (any time today)'));
  sec('fitness', 'Fitness', fit);

  // Nutrition
  const nut = [
    I('n_bf', `Breakfast within 1 h of waking (${kc(slots[0])}, ${pr(slots[0])})`),
    I('n_lunch', `Lunch with protein + dal/vegetables + curd (${kc(slots[1])}, ${pr(slots[1])})`),
  ];
  if (sess) { nut.push(I('n_pre', 'Pre-workout meal 60-90 min before lifting')); nut.push(I('n_post', 'Post-workout meal within 90 min after lifting')); }
  else nut.push(I('n_snack', 'Protein snack (curd/paneer/eggs/sprouts/roasted chana)'));
  nut.push(I('n_dinner', 'Dinner finished ≥ 2 h before bed with protein + vegetables'));
  nut.push(I('n_protein', c ? `Protein ≥ ${c.protein} g (≥ 90%: ${Math.round(c.protein * .9)} g)` : 'Protein target met', 'protein'));
  nut.push(I('n_cal', c ? `Calories within ±150 of ${c.target} kcal` : 'Calorie target met', 'calories'));
  nut.push(I('n_veg', '≥ 400 g vegetables and 2 fruits'));
  nut.push(I('n_water', c ? `Water ≥ ${c.water} L` : 'Water target met', 'water'));
  nut.push(I('n_junk', 'No sugary drinks or deep-fried junk (1 planned treat meal/week allowed)'));
  if (sunday) nut.push(I('n_prep', 'Meal prep done (dal/rajma, rice, protein, chopped veg) + groceries bought'));
  sec('nutrition', 'Nutrition', nut);

  // Career
  const wkn = info.week;
  const car = [];
  const mins = sunday ? 60 : saturday ? 150 : studyMin(info.phase);
  if (sunday) {
    car.push(I('c_study', `Light study 60 min: ${FOCUS[wkn]} (revise weak topics)`, 'study'));
  } else if (saturday) {
    car.push(I('c_study', `Study / portfolio project 150 min: ${FOCUS[wkn]}`, 'study'));
  } else {
    car.push(I('c_study', `Study ${mins} min: ${FOCUS[wkn]}`, 'study'));
  }
  car.push(I('c_prac', `Practice: ${PRACTICE[wkn]}: complete today's exercise set (${wkn <= 4 ? '3-5 SQL problems' : wkn <= 8 ? '1 hands-on build/exercise set' : '1 case/problem set'}) and note mistakes`, 'practice'));
  car.push(I('c_int', `Interview prep ${interviewMin(wkn)} min (${wkn <= 2 ? 'write/refine STAR stories' : wkn <= 8 ? '5 technical Qs aloud + 1 STAR story' : 'mock Q&A, timed'})`, 'interview'));
  if (!weekend && [1, 3, 5].includes(dw)) car.push(I('c_comm', 'Communication: explain today\'s concept aloud in 2 minutes (record or teach someone)'));
  const apps = appsToday(wkn, dw);
  if (apps > 0) car.push(I('c_apps', `Submit ${apps} tailored job application${apps > 1 ? 's' : ''} and add ${apps > 1 ? 'them' : 'it'} to the Jobs tab`, 'applications'));
  else if (wkn <= 2 && !sunday) car.push(I('c_job', wkn === 1 ? 'Resume/LinkedIn task: update one section (headline, About, experience bullets)' : 'Job-search prep: shortlist 5 target companies/roles or message 1 person'));
  else if (weeklyApps(wkn) > 0 && !sunday) car.push(I('c_net', 'Send 1 networking/referral message or follow-up'));
  sec('career', 'Career Development', car);

  // Night
  sec('night', 'Night', [
    I('ni_family', 'Phone-free family/personal time ≥ 30 min'),
    I('ni_screen', 'Screens off 30 min before bed; phone charging away from the bed'),
    I('ni_journal', 'Journal 3 lines: win, lesson, improvement'),
    I('ni_grat', 'Write 3 specific gratitudes'),
    I('ni_prep', 'Prepare tomorrow: clothes, tiffin, bag, workout kit, water bottle'),
    I('ni_care', 'Brush, floss, skincare'),
    I('ni_breath', 'Wind-down: 4-7-8 breathing or body scan (5 min)'),
    I('ni_bed', `In bed by ${bed} (±15 min)`, 'bed'),
    I('ni_log', 'Log today\'s numbers (weight, steps, sleep, water, calories, protein, mood)'),
  ]);

  if (sunday) {
    const monthly = info.week % 4 === 0 || info.dayNumber >= 84;
    sec('review', 'Weekly Review (Sunday)', [
      I('r_weigh', 'Weigh in (morning, after toilet, before food) and log it', 'weigh'),
      I('r_card', 'Open the Week tab and read your scorecard'),
      I('r_form', 'Complete the review: wins, struggles, changes, next-week priorities', 'review'),
      I('r_plan', 'Schedule next week\'s workouts and study blocks in your calendar'),
      I('r_apps', 'Update the Jobs tab and plan next week\'s applications'),
      I('r_prep', 'Plan next week\'s meals and grocery list'),
      ...(monthly ? [I('r_meas', 'Monthly check: body measurements + strength tests logged in Progress', 'measure')] : []),
    ]);
  }

  const minItems = MIN_ITEMS(c || { protein: 100, water: 3 }).map((t, i) => ({ id: 'min' + (i + 1), text: t }));
  return { info, sections, minItems };
}

module.exports = { build };
