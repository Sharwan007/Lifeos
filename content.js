'use strict';
// Builds the personalised plan (sections made of simple blocks the UI renders).
const core = require('./core');
const { calc, flags, fmtT, toMin, S, timetable, meditationMin } = core;

const H = t => ({ h: t }), P = t => ({ p: t }), UL = a => ({ ul: a }), N = (t, kind = 'tip') => ({ note: t, kind });
const T = (head, rows) => ({ table: { head, rows } });
const DOC = t => N('Discuss with a doctor / registered dietitian: ' + t, 'doctor');

// ---- Indian muscle-gain meals (approximate; portions scale with your calorie target) ----
const MEALS = {
  breakfast: {
    veg: ['Paneer bhurji (100 g paneer) + 2 multigrain rotis + 1 banana + 250 ml milk', 'Besan chilla x3 with curd + fruit', 'Moong dal cheela x3 + mint chutney + peanuts (20 g) + milk', 'Oats (60 g) cooked in milk + banana + 10 almonds + 1 scoop whey/plant protein'],
    egg: ['3-egg omelette (1 yolk-in whole) + 2 toasts/rotis + banana + milk', 'Egg bhurji (3 eggs) + 2 parathas (little ghee) + curd', 'Boiled eggs x3 + poha with peanuts + fruit'],
    nonveg: ['Egg bhurji (3 eggs) + 2 rotis + banana + milk', 'Chicken sandwich (100 g chicken, whole-wheat bread) + milk', 'Omelette (3 eggs) + oats/upma + fruit'],
  },
  lunch: {
    veg: ['2-3 rotis + 1.5 cups rice (small) + 1 big bowl dal/rajma/chole + paneer/soya sabzi + salad + curd', 'Soya-chunk pulao (50 g dry soya) + raita + salad', 'Rajma-chawal + 1 cup curd + sautéed vegetables + paneer cubes (80 g)'],
    egg: ['2-3 rotis + rice + dal + egg curry (2-3 eggs) + salad + curd', 'Veg pulao + 3-egg bhurji + raita'],
    nonveg: ['Rice/rotis + 120-150 g chicken curry (or fish curry) + dal + vegetables + salad + curd', 'Chicken/egg biryani-style pulao (home-made, 150 g chicken) + raita + salad'],
  },
  pre: {
    veg: ['1-2 bananas + 1 tbsp peanut butter + tea/coffee', 'Sattu drink (2-3 tbsp in water/buttermilk) + banana', 'Poha/upma (1 bowl) + milk'],
    egg: ['2 boiled eggs + 1 banana + tea/coffee', 'Peanut-butter toast x2 + banana'],
    nonveg: ['2 boiled eggs + 1-2 bananas', 'Peanut-butter toast x2 + banana + coffee'],
  },
  post: {
    veg: ['250-300 ml milk + banana + 1 scoop whey/plant protein (if used) OR 250 g curd + roasted chana', 'Paneer sandwich (80 g paneer) + milk', 'Soya/paneer tikka + 2 rotis (if dinner is within 90 min)'],
    egg: ['3 boiled eggs + milk + banana', 'Egg-white/whole-egg sandwich + milk'],
    nonveg: ['Chicken sandwich/wrap (100 g chicken) + milk', '3 boiled eggs + banana + milk', 'Whey shake + banana (if used)'],
  },
  dinner: {
    veg: ['2 rotis + 1 cup rice + dal + paneer/tofu sabzi + large salad + 1 glass buttermilk', 'Khichdi (moong dal) with ghee + curd + sautéed veg + 80 g paneer', 'Soya keema + 2 rotis + salad + curd'],
    egg: ['2 rotis + rice + dal + 3-egg curry + salad', 'Egg fried rice (home-made) + veg + curd'],
    nonveg: ['2 rotis + rice + 150 g chicken/fish + vegetables + dal + salad', 'Egg curry (3 eggs) + 2 rotis + salad + curd'],
  },
  snacks: {
    veg: ['Roasted chana + peanuts (30 g each)', 'Curd (200 g) + fruit + seeds', 'Sprouts chaat (1 bowl) + lemon', 'Paneer cubes (60 g) + cucumber', 'Dry fruits trail mix (30-40 g) + milk', 'Makhana (roasted) + glass of milk'],
    egg: ['2 boiled eggs + fruit', 'Roasted chana + peanuts', 'Curd + fruit + seeds', 'Sprouts chaat'],
    nonveg: ['2 boiled eggs + fruit', 'Chicken tikka (home-made, 100 g)', 'Roasted chana + peanuts', 'Curd + fruit + seeds'],
  },
};

function mealTable(p, c) {
  const pref = p.dietPref === 'veg' ? 'veg' : p.dietPref === 'egg' ? 'egg' : 'nonveg';
  const slots = [['Breakfast', 'breakfast', .22], ['Lunch', 'lunch', .28], ['Pre-workout (60-90 min before)', 'pre', .10], ['Post-workout (within 90 min)', 'post', .12], ['Dinner', 'dinner', .28]];
  const rows = slots.map(([lbl, k, f]) => [lbl, c ? `${Math.round(c.target * f / 10) * 10} kcal / ${Math.round(c.protein * f)} g protein` : 'Needs your profile',
    MEALS[k][pref].join('  |  '), pref === 'veg' ? 'Egg-eater/non-veg swap: add 2-3 eggs or 100-150 g chicken/fish instead of paneer/soya.' : 'Vegetarian swap: replace eggs/chicken with 100 g paneer/tofu, 40-50 g soya chunks, or 1.5 cups dal+curd.']);
  return T(['Meal', 'Share of daily target', `Ideas (${pref === 'veg' ? 'vegetarian' : pref === 'egg' ? 'eggetarian' : 'non-vegetarian'})`, 'Alternative'], rows);
}

function build(p) {
  const missing = core.missingFields(p);
  if (missing.length) return { complete: false, missing };
  const c = calc(p), fl = flags(p, c), tt = timetable(p, c);
  const wk = +p.trainDays, home = p.equipment !== 'gym';
  const pref = p.dietPref, role = p.targetRole;
  const sk = p.skills || {};
  const lvl = k => ({ none: 'none', basic: 'basic', intermediate: 'intermediate', advanced: 'advanced' }[sk[k] || 'none']);
  const sections = [];
  const sec = (id, title, blocks) => sections.push({ id, title, blocks });

  // ------------------------- OVERVIEW -------------------------
  sec('overview', 'Overview', [
    P(`Personalised 90-day system for a ${p.age}-year-old ${p.gender}, ${p.heightCm} cm, ${p.weightKg} kg, aiming for ${p.targetWeightKg} kg of mostly lean mass, while moving toward ${role} within ${p.jobTimeline}.`),
    ...fl.map(f => N(f, 'doctor')),
    T(['Your numbers', 'Value', 'How it was calculated'], [
      ['Basal metabolic rate (BMR)', `${c.bmr} kcal`, 'Mifflin-St Jeor: 10 x kg + 6.25 x cm - 5 x age + sex constant (+5 male, -161 female, -78 other)'],
      ['Maintenance calories', `${c.maintenance} kcal`, `BMR x activity factor ${c.factor} (${p.activity})`],
      ['Lean-gain target', `${c.target} kcal/day`, `Maintenance + ${c.surplus} kcal (a modest surplus limits fat gain)`],
      ['Protein', `${c.protein} g/day (range ${c.proteinRange[0]}-${c.proteinRange[1]})`, '1.8 g per kg body weight (range 1.6-2.2 g/kg)'],
      ['Fat', `${c.fat} g/day`, '0.9 g per kg (about 20-30% of calories)'],
      ['Carbohydrates', `${c.carbs} g/day`, '(Target kcal - protein x 4 - fat x 9) / 4'],
      ['Water', `${c.water} L/day`, '~35 ml per kg, +0.5 L on hot days or hard-training days'],
      ['Expected gain', `${c.weeklyGain[0]}-${c.weeklyGain[1]} kg/week`, `0.25-0.5% of body weight per week; about ${c.gainIn90[0]}-${c.gainIn90[1]} kg in 90 days${c.weeksToTarget ? `. Reaching ${p.targetWeightKg} kg may take ~${c.weeksToTarget} weeks, which is normal` : ''}`],
      ['BMI now / at target', `${c.bmi} / ${c.targetBmi || '-'}`, 'weight / height² (use only as a rough screen)'],
    ]),
    N('Adjust calories after 2-3 weeks using your real weight trend (see Fitness: "If weight stops increasing"). The numbers above are estimates, not prescriptions.', 'tip'),
    H('How to use this app daily'),
    UL(['Open Today, tick Done/Not Done items, and log the 10 quick numbers (weight, steps, sleep...).', 'On hard days switch to Minimum Day mode (8 items) and protect the streak.', 'Every Sunday complete the Weekly Review: scorecard + reflection + next-week priorities.', 'Never miss twice: one off-day is an accident, two is the start of a new habit.']),
  ]);

  // ------------------------- LIFESTYLE -------------------------
  const W = toMin(p.wake);
  sec('lifestyle', '1. Healthy Lifestyle', [
    H('Sleep & wake-up routine'),
    UL([`Target: in bed by ${fmtT(toMin(p.sleep))}, up at ${fmtT(W)} (about ${c.sleepHours.toFixed(1)} h in bed). Aim for 7.5-8 h asleep.`, 'Keep wake time within ±30 min every day, including weekends. Consistency beats the extra hour.', 'Light in the morning (balcony/curtains open), dark and cool room at night, caffeine cut-off 8 h before bed.', 'If you cannot sleep within 20 min, get up, dim the light, read on paper, return when sleepy.']),
    H('Morning routine (≈ 30-45 min)'),
    UL(['Wake, 500 ml water, no phone for 30 min', 'Toilet, brush, wash face, sunlight 5-10 min', `Meditate (${meditationMin(1)} min rising to 20 min)`, 'Write top-3 priorities', 'Mobility or workout, protein-rich breakfast']),
    H('Night routine (≈ 30-45 min)'),
    UL(['Dinner finished ≥ 2 h before bed', 'Screens off 30-60 min before bed; phone charges outside reach', 'Journal (3 lines) + 3 gratitudes', 'Prepare tomorrow: clothes, bag, tiffin, water bottle, workout kit', 'Brush, skincare, 4-7-8 breathing or body scan, lights out']),
    H('Hydration'),
    UL([`${c.water} L/day minimum; 500 ml on waking, 500 ml with each meal, sip through work`, 'Check urine colour: pale straw = good', 'Tea/coffee count partially; avoid sugary drinks, energy drinks and "juices"']),
    H('Movement & steps'),
    T(['Phase', 'Daily step target', 'Note'], [['Days 1-30', '7,000', 'Build the habit: walk after lunch and after dinner'], ['Days 31-90', '8,000', 'Do not chase 15,000: excess walking eats the surplus you need for muscle']]),
    H('Screen-time management'),
    UL(['Non-work phone use ≤ 2 h/day (use Digital Wellbeing / Screen Time limits on social apps)', 'No phone in the first 30 min and last 30 min of the day', 'Notifications off for everything except calls, banking and work', 'Use screens deliberately: one scheduled entertainment slot, not endless scrolling', '20-20-20 rule at work: every 20 min look 20 ft away for 20 s']),
    H('Personal hygiene & grooming'),
    UL(['Brush 2x daily, floss at night, tongue clean; dental check every 6-12 months', 'Shower daily and after every workout; clean clothes, trimmed nails', 'Face: gentle cleanser, moisturiser and SPF 30+ every morning', 'Haircut every 3-4 weeks, ironed work clothes prepared the night before', 'Posture check: 2 times during work, shoulders back, screen at eye level']),
    H('Recovery & rest'),
    UL([`${wk} lifting days, ${7 - wk} non-lifting days; at least 1 full rest day (Sunday)`, 'Sleep ≥ 7.5 h, protein every meal, easy walks on rest days', 'Deload every 4th week (weeks 4, 8, 12): ~40% fewer sets, same exercises', 'Soreness is normal; sharp or joint pain is not (stop and get it checked)', 'Stretch, foam-roll or sauna/hot shower on rest days if you like']),
    DOC('persistent pain, dizziness, chest discomfort, fatigue that does not improve, or any injury.'),
    H('Habits: stop, reduce, start, maintain'),
    T(['Stop', 'Reduce', 'Start', 'Maintain'], [
      ['Smoking/vaping/tobacco', 'Phone scrolling (esp. in bed)', 'Daily 5-20 min meditation', 'Current job performance'],
      ['Skipping meals', 'Sugary drinks, packaged snacks', 'Strength training 4-5x/week', 'Family time and social life'],
      ['Late-night caffeine & heavy meals', 'Alcohol (ideally none during the plan)', 'Weekly Sunday review', 'Learning one new thing daily'],
      ['Comparing yourself with others online', 'Deep-fried food (≤ 1-2x/week)', 'Meal prep and tiffin planning', 'Hydration'],
      ['Procrastinating with "tomorrow"', 'Multitasking', 'Daily 3-line journal, 3 gratitudes', 'Dental/skin care']]),
    H('Weekly health checklist'),
    UL(['Lifted ≥ ' + wk + ' times and logged weights', 'Average sleep ≥ 7 h on ≥ 5 nights', `Hit ${c.protein} g protein on ≥ 5 days`, `Averaged ${stepsAvg()} steps/day`, 'Weighed in on the same morning, same conditions', '≥ 6 meditation days', 'Screen time within limit on ≥ 5 days', '≥ 1 day with a clear off-duty block', 'Meal prep and grocery done', 'Haircut/nails/hygiene checks done', 'Doctor-check items noted (see doctor boxes)']),
  ]);
  function stepsAvg() { return '7,000-8,000'; }

  // ------------------------- MIND -------------------------
  sec('mind', '2. Meditation & Mental Fitness', [
    H('Beginner meditation: 90-day progression'),
    T(['Days', 'Daily length', 'Practice'], [
      ['1-14', '5 min', 'Sit upright, count breaths 1-10 and restart. When the mind wanders, notice and return (that return is the rep).'],
      ['15-30', '8 min', 'Breath awareness without counting + 1 min of body check at the end.'],
      ['31-45', '10 min', 'Body scan (feet to head) 2-3x/week, breath awareness other days.'],
      ['46-60', '12 min', 'Open monitoring: observe thoughts like clouds, label them "thinking/planning/worrying".'],
      ['61-75', '15 min', 'Focus practice (single object) + 3 min loving-kindness ("may I be calm, may others be well").'],
      ['76-90', '20 min', 'Choose your best style; add a 5-min bedtime body-scan or breathing session.']]),
    N('If sitting is hard, try a guided audio (free apps like Insight Timer, Smiling Mind, or YouTube) for the first 2-3 weeks.', 'tip'),
    H('Breathing exercises'),
    T(['Technique', 'How', 'Use when'], [
      ['Diaphragmatic breathing', 'Hand on belly, inhale 4 s through the nose, exhale 6 s. 5 min', 'Daily baseline, before sleep'],
      ['Box breathing', 'In 4 - hold 4 - out 4 - hold 4, 4-6 rounds', 'Before meetings/interviews'],
      ['4-7-8', 'In 4 - hold 7 - out 8, 4 rounds', 'Falling asleep'],
      ['Physiological sigh', 'Two short inhales through nose, one long exhale through mouth, 3 times', 'Acute stress (30 seconds)'],
      ['Gentle alternate-nostril', 'Slow, no breath-holding, 3-5 min', 'Calming the mind (skip if you feel dizzy)']]),
    H('Stress management'),
    UL(['Name it: "I am feeling stressed because..." (reduces intensity)', 'Controllable vs not controllable: act on column 1, release column 2', 'Micro-breaks: 2 min walk/stretch every 90 min', 'Physical outlet: lifting and walking are your best stress tools', 'Talk to one trusted person weekly; do not carry everything alone', 'Limit news/social media; protect sleep']),
    DOC('anxiety, low mood, panic or sleep problems lasting more than 2 weeks. India: Tele-MANAS (14416) offers free 24x7 mental-health support.'),
    H('Focus & concentration exercises'),
    UL(['Pomodoro: 25 min focus, 5 min break, phone in another room', 'Single-tasking: one tab, one task, one goal per block', 'Trataka (candle/dot gaze) 2-3 min', 'Breath counting during study blocks', 'Write the "next action" before each break so you re-enter instantly']),
    H('Journaling'),
    UL(['Morning (2 min): top 3 priorities, one thing I will do even if I feel lazy', 'Night (3 lines): win of the day, what I learned, one thing to improve', 'Sunday (10 min): the Weekly Review in this app', 'When anxious: write the worry, the worst case, the likely case, the next small action']),
    H('Gratitude practice'),
    UL(['3 specific gratitudes nightly (people, small wins, your body)', 'Be specific: "colleague explained SQL joins" beats "my job"', 'Send one thank-you message per week']),
    H('Managing overthinking'),
    UL(['Worry window: 10 min at a fixed time; outside it, write the thought down and postpone', 'Ask "Is this useful? Is it in my control? What is the next action?"', 'Move your body for 5 min (walk, pushups) to break loops', 'Decide with 70% information; set a deadline for decisions', 'Notice thoughts as thoughts ("I am having the thought that...")']),
    H('Confidence & emotional discipline'),
    UL(['Keep small promises to yourself: 10 kept promises per day builds self-trust', 'Evidence log: record every win in your journal to review on Sundays', 'Pause 10 seconds before reacting; urge-surf cravings for 10 min', 'If-then plans: "If I feel like skipping the gym, then I put on my shoes and do 10 minutes"', 'Posture and voice practice: speak slowly, explain a concept aloud daily', 'Practice discomfort: cold shower finish, speak up once in each meeting']),
    H('Morning & bedtime mental routines'),
    T(['Morning (5-10 min)', 'Bedtime (5-10 min)'], [['Water, 3 breaths, meditation', 'Brain-dump on paper'], ['Read top-3 priorities aloud', '3 gratitudes'], ['Visualise the day going well (1 min)', '4-7-8 breathing or body scan'], ['One affirmation based on actions: "I am someone who shows up"', 'Phone away, lights out']]),
  ]);

  // ------------------------- FITNESS -------------------------
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const lay = core.weekLayout(p);
  const sched = days.map((d, i) => { const dw = (i + 1) % 7; const k = lay[dw]; return [d, k ? S[k].name : core.cardioDay(p, dw) ? (dw === 3 ? 'Zone-2 cardio 25-30 min + mobility' : dw === 6 ? 'Zone-2 cardio 30-40 min or sport' : 'Easy walk 30-40 min (optional)') : 'Full rest + weekly review', k ? S[k].focus : 'Recovery']; });
  const keys = wk === 5 ? ['UA', 'LA', 'UB', 'LB', 'AD'] : ['UA', 'LA', 'UB', 'LB'];
  sec('fitness', '3. Fitness, Weight Gain & Muscle Building', [
    DOC('any heart/blood-pressure, joint, back or metabolic condition, or if you have not exercised for a long time (medical clearance).'),
    H(`Weekly split (${wk} days)`),
    T(['Day', 'Session', 'Focus'], sched),
    P(p.equipment === 'gym' ? 'Equipment: full gym. Use machines when you are unsure about form.' : p.equipment === 'home_dumbbells' ? 'Equipment: home with adjustable dumbbells/bands. Use the "Home alternative" column and add a pull-up bar when you can.' : 'Equipment: minimal home. Use the home alternatives; buy adjustable dumbbells and a pull-up bar as the first upgrade, because progressive overload needs resistance you can increase.'),
    ...keys.flatMap(k => [H(S[k].name), N(S[k].focus, 'tip'), T(['Exercise', 'Sets', 'Reps', 'Rest', 'Type', ...(home ? ['Home alternative'] : [])], S[k].ex.map(e => [e[0], e[1], e[2], e[3], e[4], ...(home ? [e[5]] : [])]))]),
    N(p.experience === 'beginner' ? 'Beginner: in Phase 1 use max 3 sets per exercise, leave 2-3 reps in reserve, and focus on technique. Film your sets or ask a trainer to check squat, hinge and press form.' : 'Phase 1 stays at 2-3 reps in reserve to rebuild technique before pushing harder.', 'tip'),
    H('Compound vs isolation'),
    P('Compound lifts (squat, press, row, deadlift, pulldown) build most of your mass and strength; start each session with them while fresh. Isolation lifts (curls, lateral raises, leg curls) finish the muscle, fix weak points and add volume safely.'),
    H('Progressive overload strategy (double progression)'),
    UL(['Pick a weight where you can do the lower end of the rep range with 2 reps in reserve (RPE 8).', 'Add 1 rep per set each week until you hit the top of the range on all sets.', 'Then increase weight by the smallest jump (upper body 1-2.5 kg, lower body 2.5-5 kg) and drop back to the low end of the range.', 'Log every set. If you did not beat last time on at least 1 lift per session, check sleep, calories and protein.', 'Effort: Phase 1 RPE 7, Phase 2 RPE 8, Phase 3 RPE 8-9. Never grind with broken form.', 'Deload weeks 4, 8, 12: fewer sets (~40% less), same load or slightly lighter. Week 13: re-test.']),
    H('Warm-up & mobility routine (8-10 min)'),
    UL(['3-5 min easy cardio (bike/brisk walk/jumping jacks)', 'Cat-cow x10, world\'s-greatest-stretch 5/side, hip circles x10/side, arm circles x15, band pull-aparts x15', 'Bodyweight squats x10, glute bridges x10, scapular push-ups x10', '1-2 ramp-up sets of the first lift (50%, then 75% of working weight)', 'Cool-down: 5 min walk + stretch chest, hips, hamstrings, calves (30 s each)']),
    H('Cardio without hurting muscle gain'),
    UL(['2 sessions/week of zone-2 (can talk in full sentences) 25-40 min: walking, cycling or swimming', 'Do cardio after lifting, or on a separate day, never before heavy leg days', 'Keep steps at 7,000-8,000; do not exceed what your surplus covers', 'Add ~100-150 kcal if cardio makes your weight stall']),
    H('Rest & recovery days'),
    UL(['Wednesday: cardio + mobility; Sunday: full rest', 'Sleep 7.5-8 h, protein spread across 4-5 meals, water 2.5-3.5 L', 'Reduce volume or take an extra rest day if resting heart rate is up, sleep is bad, or motivation crashes for several days']),
    H('Monthly strength & body measurements'),
    P('Log in the Progress tab on Day 1, 30, 60 and 90 (or every 4 weeks): body weight, waist, chest, upper arm, thigh, hips, and your best sets on squat, bench, deadlift, row and overhead press. Photos: same light, pose and time.'),
    T(['Metric', 'Expected trend'], [['Body weight', `+${c.weeklyGain[0]}-${c.weeklyGain[1]} kg/week (4-week average)`], ['Waist', 'Up ≤ 2-3 cm over 90 days'], ['Chest/arms/thighs', 'Slowly rising'], ['Main lifts', 'More reps or load every 1-3 weeks']]),
    H('If weight stops increasing'),
    UL(['Use a 2-week average (daily weights fluctuate ±1 kg from water and food).', 'If the average is flat for 2 weeks, add 150-250 kcal/day (e.g., an extra banana + peanut butter + milk).', 'Audit first: Were you hitting calories on weekends? Is sleep ≥ 7 h? Are steps creeping up?', 'If gaining > 0.5% of body weight/week for 3 weeks, remove 100-150 kcal.', 'Still stuck after 4 weeks, or you have unexplained weight loss, poor appetite or digestion issues: see a doctor/registered dietitian.']),
  ]);

  // ------------------------- NUTRITION -------------------------
  sec('nutrition', '4. Nutrition (India, muscle-gain)', [
    DOC('diabetes, thyroid, kidney/liver disease, high cholesterol, allergies, gastric issues or any medical diet, before using these targets.'),
    T(['Daily target', 'Value'], [['Calories', `${c.target} kcal (±150)`], ['Protein', `${c.protein} g`], ['Carbohydrates', `${c.carbs} g`], ['Fat', `${c.fat} g`], ['Vegetables', '≥ 400 g (about 5 handfuls), mix of colours'], ['Fruit', '2-3 servings (banana, apple, papaya, guava, seasonal)'], ['Water', `${c.water} L`], ['Fibre', '25-35 g: dal, whole grains, vegetables, fruit']]),
    H('Meal framework: 5 meals + 1-2 snacks'),
    mealTable(p, c),
    H('Healthy snacks'),
    UL(MEALS.snacks[pref === 'veg' ? 'veg' : pref === 'egg' ? 'egg' : 'nonveg']),
    H('Affordable high-protein foods (approximate protein)'),
    T(['Food', 'Typical serving', 'Protein (approx.)'], [
      ['Soya chunks', '50 g dry', '25 g'], ['Eggs', '1 egg', '6 g'], ['Paneer', '100 g', '18 g'], ['Chicken breast', '100 g cooked', '28-31 g'],
      ['Dal (cooked)', '1 cup / 200 g', '9-12 g'], ['Rajma/chole (cooked)', '1 cup', '12-15 g'], ['Curd/Greek-style hung curd', '200 g', '7-14 g'], ['Milk', '250 ml', '8 g'],
      ['Roasted chana', '40 g', '8 g'], ['Peanuts', '30 g', '8 g'], ['Sattu', '3 tbsp (30 g)', '6-8 g'], ['Tofu', '100 g', '8-12 g'], ['Fish (rohu/mackerel/sardine)', '100 g cooked', '20-24 g'], ['Whey (optional)', '1 scoop', '20-25 g']]),
    N('Values vary by brand and cooking method; use a food app (e.g., IFCT-based or any macro tracker) for the first 2 weeks to calibrate portions.', 'tip'),
    H('Vegetarian / eggetarian / non-vegetarian alternatives'),
    UL(['Veg: paneer, tofu, soya, dal + rice/roti combinations, curd, milk, sprouts, sattu, whey/plant protein if you fall short.', 'Egg: 3-4 eggs/day is common; keep yolks in unless your doctor advises otherwise.', 'Non-veg: chicken, fish, eggs; vary with fish 2x/week for omega-3.', 'Plant proteins: combine cereals and pulses (roti + dal, rice + rajma) across the day.']),
    H('Hydration'),
    P(`${c.water} L/day. Have a bottle at your desk and finish it twice. Coconut water, buttermilk and lemon water are good extras.`),
    H('Weekly grocery list (1 person; adjust to your budget)'),
    T(['Category', 'Items'], [
      ['Grains & carbs', 'Atta 1.5 kg, rice 1 kg, oats 500 g, poha 500 g, potatoes/sweet potatoes 1 kg, bread (whole wheat) 1'],
      ['Pulses & legumes', 'Moong, toor/masoor dal 1 kg total, rajma/chole 500 g, black chana 500 g, soya chunks 250 g, besan 500 g, sattu 250 g'],
      ['Protein', pref === 'veg' ? 'Paneer 500 g, tofu 250 g, milk 7-8 L, curd 1.5 kg' : pref === 'egg' ? 'Eggs 3 dozen, paneer 250 g, milk 7-8 L, curd 1 kg' : 'Eggs 2-3 dozen, chicken 1-1.5 kg (or fish 700 g), milk 7 L, curd 1 kg, paneer 250 g'],
      ['Fruit', 'Bananas 2 dozen, 2-3 seasonal fruits (apple, papaya, guava, orange), lemons'],
      ['Vegetables', 'Spinach/methi, tomato, onion, cucumber, carrot, capsicum, beans/gourds (target 3-4 kg/week)'],
      ['Healthy fats & extras', 'Peanuts 250 g, peanut butter 1 jar (no added sugar), almonds/walnuts 100-150 g, mustard/groundnut oil, ghee, seeds, makhana, jaggery sparingly'],
      ['Flavour & misc.', 'Spices, ginger, garlic, green chillies, coriander, curry leaves, tea/coffee']]),
    H('Meal-preparation strategy'),
    UL(['Sunday (90 min): boil dal/rajma, cook rice, boil 12 eggs or marinate/cook chicken/paneer, knead atta, wash and chop veg, roast chana.', 'Wednesday (30 min): refresh dal/sabzi and chop veg for Thu-Sun.', 'Make dinner double: tomorrow\'s lunch is already cooked.', 'Keep 3 emergency foods: eggs/paneer/curd, peanut butter + bread, banana + milk.', 'Use tiffin boxes; pack lunch and a protein snack nightly.', 'Eating out: pick tandoori/grilled protein, dal-roti-sabzi, avoid deep-fried and sugary drinks; one planned treat meal/week.']),
  ]);

  // ------------------------- SUPPLEMENTS -------------------------
  sec('supplements', 'Supplements (separate from food)', [
    DOC('any supplement, especially with kidney/liver disease, pregnancy, heart conditions, medicines, or if you are under 18. Food first: supplements are optional and cannot replace the plan.'),
    T(['Category', 'Supplement', 'Notes'], [
      ['Useful', 'Protein powder (whey, or plant protein)', 'Only to fill protein gaps; 1 scoop ≈ 20-25 g. Choose third-party-tested, FSSAI-licensed brands.'],
      ['Useful', 'Creatine monohydrate', '3-5 g/day, any time, with water. One of the best-studied supplements. Avoid if you have kidney disease; ask your doctor.'],
      ['Useful (if tested low)', 'Vitamin D, vitamin B12, iron', 'Get blood tests first. Vegetarians are more likely to be low in B12. Dose set by a doctor.'],
      ['Optional', 'Caffeine (tea/coffee) before training', '100-200 mg, not within 8 h of bedtime. Stop if it causes palpitations or anxiety.'],
      ['Optional', 'Omega-3 (fish/algal oil)', 'If you rarely eat fish.'],
      ['Optional', 'Electrolytes / ORS / coconut water', 'In heat or long sweaty sessions.'],
      ['Optional', 'Weight-gainer powder', 'Usually expensive sugar/maltodextrin; a milk-banana-peanut-butter shake does the same.'],
      ['Optional', 'Multivitamin', 'Insurance, not a necessity.'],
      ['Unnecessary', 'BCAAs, glutamine, "fat burners", testosterone boosters, detox teas, collagen for muscle', 'No meaningful benefit if protein is adequate.'],
      ['Potentially risky', 'Anabolic steroids, SARMs, prohormones, injectable "peptides"', 'Serious hormonal, liver, heart and fertility harm. Do not use.'],
      ['Potentially risky', 'Ephedrine/DMAA/stimulant-heavy pre-workouts, unlabeled "ayurvedic" powders', 'Heart-rate and BP risks; some are adulterated. Avoid unlabelled products.'],
      ['Potentially risky', 'High-dose vitamins/minerals without testing', 'Can be toxic (vitamin A, D, iron, zinc).']]),
    N('This app does not recommend medication. If you suspect a deficiency or health issue, see a doctor.', 'warn'),
  ]);

  // ------------------------- CAREER -------------------------
  const sqlGap = ['none', 'basic'].includes(sk.sql || 'none');
  sec('career', '5. Career & New Job Preparation', [
    P(`Target: ${role}. Timeline: ${p.jobTimeline}. Current levels: SQL ${lvl('sql')}, Python ${lvl('python')}, Excel ${lvl('excel')}, Power BI ${lvl('powerbi')}, Statistics ${lvl('stats')}. If you are already above the stated level, skip ahead in the weekly curriculum and spend the time on projects and interviews.`),
    H('Skills ranked by importance for analytics / automation roles'),
    T(['Rank', 'Skill', 'Why it matters', 'Hours/week'], [
      ['1', 'SQL', 'Tested in almost every analytics interview; most daily work', '3-4'],
      ['2', 'Excel', 'Universal; pivot tables, XLOOKUP, Power Query', '1-2'],
      ['3', 'Power BI + data visualisation', 'Dashboards are the visible deliverable', '2-3'],
      ['4', 'Data analysis / EDA & business problem solving', 'Turning data into decisions', '2'],
      ['5', 'Python (pandas, automation)', 'Cleaning, automation and AI workflows', '2-3'],
      ['6', 'Statistics', 'Correct conclusions, A/B tests, metrics', '1-2'],
      ['7', 'AI & automation fundamentals', 'Power Automate, scripts, LLM APIs; differentiates you', '1-2'],
      ['8', 'Interview prep + STAR stories', 'Converts skills into offers', '2-4 (rising)'],
      ['9', 'Communication & presentation', 'Explaining insights to non-technical leaders', '1'],
      ['10', 'Resume, LinkedIn, portfolio, applications', 'Gets interviews', '2-3 (rising)']]),
    H('13-week curriculum (Weekly study ≈ 9-10 h)'),
    T(['Week', 'Main focus', 'Practice target'], WEEKS.map((w, i) => [i + 1, w[0], w[1]])),
    H('Portfolio projects (3)'),
    UL(['Project 1 (weeks 4-8): SQL + Power BI dashboard on a business dataset (sales, inventory, order-to-cash or customer-care SLA data). Publish on GitHub with README and screenshots.', 'Project 2 (weeks 9-11): Python analysis or automation, e.g., clean messy order/invoice data, detect exceptions, generate a daily report email automatically.', 'Project 3 (weeks 11-13): AI-enabled workflow, e.g., classify support tickets/orders with an LLM or sentence embeddings and show impact (time saved, accuracy).']),
    H('Technical interview question bank'),
    T(['Area', 'Practice these'], [
      ['SQL', 'Second-highest salary; duplicates; top-N per group (window functions); LEFT JOIN vs INNER JOIN; GROUP BY + HAVING; running total; customers who did not order; month-over-month growth; correlated subquery; CASE WHEN bucketing; LIKE patterns; CTE vs subquery'],
      ['Excel', 'XLOOKUP vs VLOOKUP; pivot table build; SUMIFS; Power Query clean-up; dynamic arrays; dashboard best practices'],
      ['Python', 'List/dict operations; pandas groupby/merge/pivot; handling nulls and duplicates; apply vs vectorised operations; reading CSV/Excel/API; writing a clean function'],
      ['Power BI', 'Star schema; relationships; DAX CALCULATE; measures vs calculated columns; row-level security; performance tuning; refresh'],
      ['Statistics', 'Mean/median/mode; standard deviation; p-value; confidence interval; Type I/II errors; A/B test design; correlation vs causation'],
      ['Business', 'Define KPIs for a feature; investigate a drop in orders; prioritise 3 projects; estimate a market size; explain a dashboard to a CFO'],
      ['AI/automation', 'What is an LLM; prompt design; when automation is worth it; RPA vs code; data privacy; hallucination handling']]),
    H('Behavioral / STAR questions'),
    UL(['Tell me about yourself (60-90 s: present → past → future)', 'A time you solved a hard problem using data', 'A time you automated or improved a process', 'Handling conflict or a difficult stakeholder', 'A mistake you made and what you learned', 'Tight deadline or multiple priorities', 'Why this role, why this company, why are you leaving?', 'Write 6 STAR stories (Situation, Task, Action, Result with numbers) that each fit 2-3 questions.']),
    H('Communication & presentation'),
    UL(['Daily: explain one concept aloud in 2 minutes (record and listen)', 'Structure: Answer first, then 3 reasons, then next step', 'Present each project in 3 minutes: problem, approach, result, impact', 'Weekly: write one LinkedIn post or short insight about a project']),
    H('Resume & LinkedIn improvement'),
    UL(['One page, ATS-friendly (simple fonts, standard headings, no tables/graphics)', 'Each bullet: action verb + what + tool + measurable result (e.g., "Automated order validation, cutting handling time by 30%")', 'Headline: "Data/Business Analyst | SQL | Power BI | Python | Automation"', 'LinkedIn: photo, headline, About with keywords, featured projects, skills, 5-10 recommendations of connections added weekly', 'Tailor the top third of the resume to each job description']),
    H('Job applications & tracking'),
    T(['Weeks', 'Weekly applications', 'Extras'], [['1-2', '0', 'Resume, LinkedIn, STAR stories, target-company list (30 companies)'], ['3-4', '3 quality applications', 'Message 2 people per week'], ['5-8', '7', 'Referral requests, follow-ups after 5-7 days'], ['9-13', '10', 'Mock interviews 2/week, negotiation prep']]),
    P('Use the Jobs tab to track company, role, link, date, status, next step and follow-up date.'),
    N(sqlGap ? 'Your SQL is basic/none: treat weeks 1-4 as the most important block of the plan.' : 'You already have some SQL: use the early weeks to harden advanced topics (windows, CTEs) and move faster to projects.', 'tip'),
  ]);

  // ------------------------- TIMETABLE -------------------------
  sec('timetable', '6. Discipline & Time Management', [
    ...tt.warnings.map(w => N(w, 'warn')),
    P(`Built around your hours: work ${fmtT(toMin(p.workStart))}-${fmtT(toMin(p.workEnd))}${+p.commuteMin ? `, ${p.commuteMin} min each-way commute` : ', no commute'}, wake ${fmtT(toMin(p.wake))}, bed ${fmtT(toMin(p.sleep))}. It leaves 60-90 min of free time most days: sustainable, not extreme. Times are anchors; ±30 min is fine.`),
    H('Weekday (Mon-Fri)'), T(['Time', 'Activity', 'Notes'], tt.weekday.map(r => [r.time, r.activity, r.note])),
    H('Saturday'), T(['Time', 'Activity', 'Notes'], tt.saturday.map(r => [r.time, r.activity, r.note])),
    H('Sunday'), T(['Time', 'Activity', 'Notes'], tt.sunday.map(r => [r.time, r.activity, r.note])),
    H('Discipline rules'),
    UL(['Never miss twice. If the full routine is impossible, run the Minimum Day.', 'Plan tomorrow tonight (clothes, tiffin, workout kit, 3 priorities).', 'Habit stacking: attach new habits to existing ones (meditate right after brushing).', 'Make good habits easy and bad habits hard: charger outside the bedroom, social apps logged out.', 'Review weekly, adjust calmly: the plan serves you, not the other way round.', 'Rewards: planned entertainment and one treat meal per week.']),
  ]);

  // ------------------------- ROADMAP -------------------------
  const ph = (n, title, rows, ms) => [H(`Days ${n}: ${title}`), T(['Area', 'Goals'], rows), H('Weekly milestones'), UL(ms)];
  sec('roadmap', '7. 90-Day Roadmap', [
    ...ph('1-30', 'Foundation', [
      ['Fitness goals', `Learn technique, ${wk} sessions/week with ≥ 90% completion, 7,000 steps, add weight when top reps hit. Deload in week 4.`],
      ['Nutrition goals', `Hit ${c.protein} g protein ≥ 5 days/week; eat within ±200 kcal of ${c.target} on most days; water ${c.water} L; weekly grocery + Sunday prep.`],
      ['Meditation goals', 'Daily 5 → 8 min; breathing exercise at stress points; journal 3 lines nightly.'],
      ['Career goals', 'SQL basics-to-joins-CTEs-windows, Excel pivots, resume + LinkedIn rebuilt, 6 STAR stories drafted, 3-6 applications.'],
      ['Habits to develop', 'Fixed wake/sleep, no phone first 30 min, daily priority list, nightly shutdown, weekly review.'],
      ['Things to avoid', 'Over-training, chasing perfection, crash diets, skipping meals, comparing with others, doom-scrolling, too many courses at once.']],
      ['Week 1: set up system, log everything, complete profile baseline', 'Week 2: hit sleep and steps on 5 days', 'Week 3: first full week of lifts + protein targets', 'Week 4 (deload): measurements, review, adjust calories if weight flat']),
    ...ph('31-60', 'Progression', [
      ['Fitness goals', 'Progressive overload every week; RPE 8; 8,000 steps; measurements on Day 60. Deload in week 8.'],
      ['Nutrition goals', 'Adjust calories ±150-250 using 2-week average; consistent meal prep; vegetables ≥ 400 g.'],
      ['Meditation goals', '10 → 12 min; body scan and open monitoring; use breathing before stress events.'],
      ['Career goals', 'Power BI + DAX, Python/pandas, Project 1 published, 7 applications/week, 30-45 min interview prep daily.'],
      ['Habits to develop', 'Deep-work blocks, weekly networking messages, evidence log, consistent bedtime.'],
      ['Things to avoid', 'Skipping deloads, burning out on weekends, applying without tailoring, boredom-driven snacking, ignoring recovery.']],
      ['Week 5-6: new lifts add load; Power BI model done', 'Week 7: Python practice daily; applications at 7/week', 'Week 8 (deload): Project 1 on GitHub; measurements; review']),
    ...ph('61-90', 'Transformation', [
      ['Fitness goals', 'Heavier loads, higher effort (RPE 8-9), keep gaining 0.25-0.5%/week; Week 13 retest of lifts.'],
      ['Nutrition goals', 'Make eating automatic: repeat 3-4 favourite breakfasts/lunches/dinners, adapt when travelling.'],
      ['Meditation goals', '15 → 20 min; confidence and emotional discipline practices; journal weekly summary.'],
      ['Career goals', 'Statistics, business cases, AI/automation project, 2 mocks/week, 10 applications/week, negotiation prep.'],
      ['Habits to develop', 'Identity: "I am disciplined and consistent"; plan for decades by keeping the Minimum Day routine alive.'],
      ['Things to avoid', 'Sprinting then quitting; skipping sleep to study; vanity-metric focus; over-supplementing; self-criticism after misses.']],
      ['Week 9-10: statistics + business problem solving; Project 2', 'Week 11: AI/automation project; mock interviews', 'Week 12 (deload): Project 3 polish, final resume', 'Week 13: retest, final measurements, 90-day retrospective, plan next 90']),
  ]);

  // ------------------------- MINIMUM DAY -------------------------
  sec('minimum', 'Minimum Day routine', [
    P('Use this on difficult, travel, sick-day, or overloaded days. The goal is to keep the habit chain alive, not to make progress. Total time ≈ 40-50 minutes.'),
    T(['#', 'Minimum action', 'Time'], MIN_ITEMS(c).map((m, i) => [i + 1, m, ''])),
    UL(['If you are ill, rest is the minimum; skip the workout and walk.', 'A Minimum Day counts as a successful day (scored at 70%).', 'Return to the full routine the next day: no punishment, no catch-up.']),
  ]);

  return { complete: true, missing: [], calc: c, flags: fl, timetable: tt, sections };
}

const WEEKS = [
  ['SQL: SELECT, WHERE, ORDER, aggregates, GROUP BY/HAVING. Excel refresh', '15 SQL problems; clean one Excel dataset'],
  ['SQL: JOINs, CASE WHEN, NULLs. Excel: XLOOKUP, SUMIFS, pivot tables', '15 SQL problems; build a pivot report'],
  ['SQL: subqueries, CTEs. Excel Power Query. Resume + LinkedIn rebuild', '15 SQL problems; resume v1 live'],
  ['SQL: window functions (ROW_NUMBER, RANK, LAG). Start Project 1 data model (deload week)', '10 SQL window problems; Project 1 data sourced'],
  ['Power BI: import, Power Query, relationships, star schema', 'Model a dataset with 3+ tables'],
  ['Power BI: DAX (CALCULATE, filters, time intelligence), visuals, design rules', '10 DAX measures; 1-page dashboard'],
  ['Python: pandas load/clean/groupby/merge; Jupyter', '10 pandas exercises; clean one messy file'],
  ['Python: EDA, matplotlib/seaborn. Finish Project 1 and publish (deload week)', 'Project 1 on GitHub + README'],
  ['Statistics: distributions, sampling, confidence intervals, hypothesis testing, A/B tests', '10 stats problems; one A/B analysis'],
  ['Business problem solving: KPI trees, root-cause, case frameworks. Python automation scripts', '3 case studies; one automated script'],
  ['AI & automation: Power Automate/RPA concepts, LLM APIs, prompt design, evaluation. Project 3 kickoff', 'Small LLM or sentence-embedding classifier'],
  ['Mock interviews (SQL live, case, behavioural), portfolio polish (deload week)', '2 mocks; portfolio site/README polished'],
  ['Final: full interview loop, apply intensively, negotiation, retrospective', '10 applications; 3 mocks; next-90-day plan'],
];

function MIN_ITEMS(c) {
  return [
    'Wake up and get out of bed within 1 hour of your usual time; drink 500 ml water',
    '5 min of breathing or meditation',
    '10-min walk (or 5-min mobility, or 20 squats + 10 push-ups)',
    `Eat 3 protein-containing meals (target ≥ ${Math.round(c.protein * 0.8)} g protein: eggs/paneer/dal/curd/milk)`,
    `Drink at least ${Math.max(2, c.water - 0.5)} L of water`,
    '15 min of SQL/Python practice or 1 interview question aloud',
    'Write 3 lines in your journal: win, gratitude, tomorrow\'s first action',
    'In bed within 60 min of your usual bedtime, phone away',
  ];
}

module.exports = { build, MIN_ITEMS, MEALS };
