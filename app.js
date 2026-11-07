'use strict';
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const mondayOf = s => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
  const nice = s => parse(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const short = s => parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const S = { profile: null, tab: localStorage.getItem('tab') || 'today', date: today(), monday: mondayOf(today()), planSec: 'overview', planCache: null };

  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }
  const getApiBase = () => (window.LIFEOS_API_BASE || localStorage.getItem('lifeos_api_base') || '').replace(/\/$/, '');

  function promptConnModal(msg) {
    const mc = $('#modal-container');
    if (!mc) return;
    const curBase = getApiBase();
    mc.innerHTML = `
      <div class="modal-overlay" id="modal-conn-bg">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m_title">
          <h2 id="m_title">Backend Connection &amp; Auth</h2>
          ${msg ? `<p style="color:var(--bad)">${esc(msg)}</p>` : '<p>Configure the API URL and login credentials. Same-origin Vercel deployments can leave the API URL empty.</p>'}
          <div style="margin-bottom:10px">
            <label for="cfg_api">Backend API URL</label>
            <input id="cfg_api" placeholder="Leave empty for this Vercel deployment" value="${esc(curBase)}">
            <span class="muted small">Leave empty if frontend &amp; backend are hosted on the same domain.</span>
          </div>
          <div class="grid two" style="margin-bottom:12px">
            <div><label for="cfg_user">Username</label><input id="cfg_user" value="admin"></div>
            <div><label for="cfg_pass">Password</label><input id="cfg_pass" type="password" placeholder="APP_PASSWORD"></div>
          </div>
          <div class="btn-row">
            <button class="btn" id="cfg_cancel">Cancel</button>
            <button class="btn pri" id="cfg_save">Save &amp; Connect</button>
          </div>
        </div>
      </div>`;

    $('#cfg_cancel').onclick = () => { mc.innerHTML = ''; };
    $('#cfg_save').onclick = () => {
      const u = $('#cfg_api').value.trim().replace(/\/$/, '');
      const usr = $('#cfg_user').value.trim();
      const pwd = $('#cfg_pass').value;
      if (u) localStorage.setItem('lifeos_api_base', u);
      else localStorage.removeItem('lifeos_api_base');
      if (pwd) {
        const token = 'Basic ' + btoa(usr + ':' + pwd);
        localStorage.setItem('lifeos_auth', token);
      }
      mc.innerHTML = '';
      toast('Connection settings saved');
      loadProfile().then(() => go(S.tab)).catch(e => {
        view.innerHTML = `<div class="card"><b>Connection failed:</b><p class="muted">${esc(e.message)}</p><p><button class="btn pri" id="retry_conn">Reconfigure API</button></p></div>`;
        const rc = $('#retry_conn'); if (rc) rc.onclick = () => promptConnModal();
      });
    };
  }

  async function api(path, method = 'GET', body) {
    const base = getApiBase();
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    const auth = localStorage.getItem('lifeos_auth');
    if (auth) headers['Authorization'] = auth;

    let r;
    try {
      r = await fetch(base + '/api' + path, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
    } catch (netErr) {
      const err = new Error(`Cannot reach backend API (${base || 'same-origin'}). Check if the backend is awake or click API button to configure.`);
      err.isNetwork = true;
      throw err;
    }

    if (r.status === 401) {
      promptConnModal('Authentication required by backend.');
      const e = new Error('Authentication required');
      e.status = 401;
      throw e;
    }

    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || r.statusText); e.data = j; e.status = r.status; throw e; }
    return j;
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ------------------------------------------------ router
  async function go(tab) {
    S.tab = tab; localStorage.setItem('tab', tab);
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    view.innerHTML = '<p class="muted">Loading…</p>';
    try {
      if (!S.profile || S.profileMissing) await loadProfile();
      if (S.profileMissing && S.profileMissing.length && tab !== 'profile') { tab = 'profile'; S.tab = 'profile'; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === 'profile')); }
      await ({ today: vToday, week: vWeek, plan: vPlan, progress: vProgress, jobs: vJobs, profile: vProfile }[tab])();
    } catch (e) {
      view.innerHTML = `<div class="card"><b>Something went wrong.</b><p class="muted">${esc(e.message)}</p><div class="row" style="margin-top:12px"><button class="btn pri" id="err_cfg">Configure API &amp; Auth</button><button class="btn" id="err_retry">Retry</button></div></div>`;
      const ec = $('#err_cfg'); if (ec) ec.onclick = () => promptConnModal();
      const er = $('#err_retry'); if (er) er.onclick = () => go(S.tab);
    }
    window.scrollTo(0, 0);
  }
  async function loadProfile() { const r = await api('/profile'); S.profile = r.profile; S.profileMissing = r.missing; S.required = r.required; }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
  const connBtn = $('#btn-conn'); if (connBtn) connBtn.onclick = () => promptConnModal();

  // ------------------------------------------------ TODAY
  async function vToday() {
    const d = await api('/day/' + S.date);
    S.day = d; renderToday();
  }
  function renderToday() {
    const d = S.day, st = d.state, min = st.mode === 'minimum', i = d.info;
    const items = min ? d.minItems : d.sections.flatMap(s => s.items);
    const done = items.filter(x => st.checks[x.id]).length;
    const pct = items.length ? Math.round(done / items.length * 100) : 0;
    const phaseTxt = i.before ? `Starts in ${1 - i.dayNumber} day(s)` : i.beyond ? `Day ${i.dayNumber} (post-90 maintenance)` : `Day ${i.dayNumber} of 90 · Week ${i.week} · Phase ${i.phase}: ${i.phaseName}`;
    const L = st.log || {};
    const inp = (k, label, step = 'any', ph = '') => `<div><label for="l_${k}">${label}</label><input id="l_${k}" data-log="${k}" type="number" inputmode="decimal" step="${step}" min="0" placeholder="${ph}" value="${L[k] ?? ''}"></div>`;
    view.innerHTML = `
    <div class="card hero">
      <div>
        <div class="row"><button class="btn sm" id="prev" aria-label="Previous day">◀</button><input type="date" id="dp" value="${d.date}" style="width:auto"><button class="btn sm" id="next" aria-label="Next day">▶</button><button class="btn sm" id="tod">Today</button></div>
        <h1 style="margin-top:10px">${esc(nice(d.date))}</h1>
        <span class="pill">${esc(phaseTxt)}</span> ${i.deload ? '<span class="pill">Deload week</span>' : ''} <span class="pill" id="streak">🔥 ${d.streak}-day streak</span>
      </div>
      <div class="row"><div class="ring" style="--p:${pct}"><span id="pct">${pct}%</span></div>
        <div><b id="cnt">${done}/${items.length} done</b><div class="muted small">Day score: <span id="dscore">${d.score.score ?? 0}</span>%</div></div></div>
    </div>
    <div class="card row"><div class="seg" role="group" aria-label="Day mode"><button data-mode="normal" class="${min ? '' : 'on'}">Full day</button><button data-mode="minimum" class="${min ? 'on' : ''}">Minimum Day</button></div>
      <span class="muted small grow">${min ? 'Hard day? These 8 items keep the chain alive (scored at 70%).' : 'Tick each item Done / Not done. Aim for ≥ 70% on a normal day.'}</span></div>
    ${min ? '<div class="minbanner"><b>Minimum Day:</b> do the basics, keep the streak, and resume the full plan tomorrow. No guilt, no catch-up.</div>' : ''}
    <div id="lists">${min ? sectionHtml({ id: 'min', title: 'Minimum Day', items: d.minItems }) : d.sections.map(sectionHtml).join('')}</div>
    <div class="card"><h2>Today's numbers</h2><div class="grid">
      ${inp('weight', 'Body weight (kg)', '0.1')}${inp('sleep', 'Sleep last night (h)', '0.1')}${inp('steps', 'Steps', '100')}${inp('water', 'Water (L)', '0.25')}
      ${inp('calories', 'Calories (kcal)', '10', d.calc ? '≈ ' + d.calc.target : '')}${inp('protein', 'Protein (g)', '1', d.calc ? '≈ ' + d.calc.protein : '')}${inp('studyH', 'Study hours', '0.25')}${inp('applications', 'Job applications', '1')}
      <div><label for="l_mood">Mood (1-5)</label><select id="l_mood" data-log="mood"><option value="">-</option>${[1, 2, 3, 4, 5].map(n => `<option ${L.mood == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label for="l_stress">Stress (1-5)</label><select id="l_stress" data-log="stress"><option value="">-</option>${[1, 2, 3, 4, 5].map(n => `<option ${L.stress == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div><div class="field" style="margin-top:12px"><label for="note">Note for today</label><textarea id="note" placeholder="Anything worth remembering…">${esc(st.note || '')}</textarea></div></div>`;
    $('#prev').onclick = () => { S.date = addDays(S.date, -1); vToday(); };
    $('#next').onclick = () => { S.date = addDays(S.date, 1); vToday(); };
    $('#tod').onclick = () => { S.date = today(); vToday(); };
    $('#dp').onchange = e => { if (e.target.value) { S.date = e.target.value; vToday(); } };
    view.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => { S.day = await api('/day/' + S.date, 'PUT', { mode: b.dataset.mode }); renderToday(); });
    view.querySelectorAll('.item input').forEach(cb => cb.onchange = async () => {
      const row = cb.closest('.item'); row.classList.toggle('done', cb.checked); row.querySelector('.st').textContent = cb.checked ? 'Done' : 'Not done';
      if (cb.checked) st.checks[cb.dataset.id] = true; else delete st.checks[cb.dataset.id];
      updateProgress();
      try { const r = await api('/day/' + S.date, 'PUT', { checks: { [cb.dataset.id]: cb.checked } }); S.day.score = r.score; S.day.streak = r.streak; $('#dscore').textContent = r.score.score ?? 0; $("#streak").textContent = `🔥 ${r.streak}-day streak`; }
      catch (e) { toast('Save failed: ' + e.message); }
    });
    view.querySelectorAll('[data-log]').forEach(el => el.onchange = async () => { try { await api('/day/' + S.date, 'PUT', { log: { [el.dataset.log]: el.value } }); st.log = Object.assign(st.log || {}, { [el.dataset.log]: el.value }); toast('Saved'); } catch (e) { toast(e.message); } });
    $('#note').onchange = async e => { await api('/day/' + S.date, 'PUT', { note: e.target.value }); toast('Saved'); };
  }
  function sectionHtml(sec) {
    const st = S.day.state; const n = sec.items.filter(x => st.checks[x.id]).length;
    return `<div class="card" data-sec="${sec.id}"><div class="sec-h"><h2>${esc(sec.title)}</h2><span class="muted small sc">${n}/${sec.items.length}</span></div><div class="bar"><i style="width:${n / sec.items.length * 100}%"></i></div>
    ${sec.items.map(it => `<label class="item ${st.checks[it.id] ? 'done' : ''}"><input type="checkbox" data-id="${it.id}" ${st.checks[it.id] ? 'checked' : ''}><span>${esc(it.text)}</span><b class="st">${st.checks[it.id] ? 'Done' : 'Not done'}</b></label>`).join('')}</div>`;
  }
  function updateProgress() {
    const d = S.day, st = d.state, min = st.mode === 'minimum';
    const secs = min ? [{ id: 'min', items: d.minItems }] : d.sections;
    let all = 0, dn = 0;
    secs.forEach(s => { const n = s.items.filter(x => st.checks[x.id]).length; all += s.items.length; dn += n; const el = view.querySelector(`[data-sec="${s.id}"]`); if (el) { el.querySelector('.sc').textContent = `${n}/${s.items.length}`; el.querySelector('.bar i').style.width = (n / s.items.length * 100) + '%'; } });
    const pct = all ? Math.round(dn / all * 100) : 0;
    $('#pct').textContent = pct + '%'; $('.ring').style.setProperty('--p', pct); $('#cnt').textContent = `${dn}/${all} done`;
  }

  // ------------------------------------------------ WEEK
  async function vWeek() {
    const r = await api(`/week/${S.monday}?today=${today()}`);
    const c = r.card, rv = r.review || {};
    const sundayDate = addDays(S.monday, 6);
    view.innerHTML = `
    <div class="card hero"><div><div class="row"><button class="btn sm" id="pw">◀ Prev</button><b>${short(c.monday)} - ${short(sundayDate)}</b><button class="btn sm" id="nw">Next ▶</button><button class="btn sm" id="tw">This week</button></div>
      <h1 style="margin-top:10px">Weekly Scorecard</h1><span class="pill">${esc(c.grade)}</span></div>
      <div class="ring" style="--p:${c.overall || 0}"><span>${c.overall ?? '-'}${c.overall == null ? '' : '%'}</span></div></div>
    <div class="card"><h2>Daily scores</h2><div class="daybars">${c.daily.map(x => `<div><i style="height:${Math.max(3, (x.score || 0) * 0.7)}px;${x.mode === 'minimum' ? 'opacity:.55' : ''}"></i>${parse(x.date).toLocaleDateString('en-IN', { weekday: 'short' })}<br>${x.score == null ? '-' : x.score}</div>`).join('')}</div><p class="muted small">Lighter bars = Minimum Day (scored at 70%).</p></div>
    <div class="card"><h2>15-point scorecard</h2><div class="tablewrap"><table><thead><tr><th>#</th><th>Metric</th><th>This week</th><th>Target</th></tr></thead><tbody>
      ${c.rows.map((x, i) => `<tr><td>${i + 1}</td><td><span class="dot ${x.status}"></span>${esc(x.label)}</td><td><b>${esc(x.value)}</b></td><td class="muted">${esc(x.target)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Values come from your daily checklist and numbers. Green = target met, amber = close, red = needs attention.</p></div>
    <div class="card"><h2>Suggestions for next week</h2><ul class="tight">${r.suggestions.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div class="card"><h2>Sunday Weekly Review</h2><p class="muted small">Complete on Sunday (${esc(short(sundayDate))}). Be honest and kind.</p>
      <div class="grid two"><div><label for="rv_wins">Wins this week</label><textarea id="rv_wins">${esc(rv.wins || '')}</textarea></div>
      <div><label for="rv_struggles">What was hard / what got in the way?</label><textarea id="rv_struggles">${esc(rv.struggles || '')}</textarea></div>
      <div><label for="rv_changes">One change for next week</label><textarea id="rv_changes">${esc(rv.changes || '')}</textarea></div>
      <div><label for="rv_priorities">Top 3 priorities next week</label><textarea id="rv_priorities">${esc(rv.priorities || '')}</textarea></div>
      <div><label for="rv_lifts">Lifts where you added reps or weight (count)</label><input id="rv_lifts" type="number" min="0" max="20" value="${rv.strengthLifts ?? ''}"></div>
      <div><label for="rv_energy">Energy level (1-5)</label><select id="rv_energy"><option value="">-</option>${[1, 2, 3, 4, 5].map(n => `<option ${rv.energy == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn pri" id="saverv">Save review</button><span class="muted small">${rv.updated ? 'Last saved ' + new Date(rv.updated).toLocaleString('en-IN') : ''}</span></div></div>`;
    $('#pw').onclick = () => { S.monday = addDays(S.monday, -7); vWeek(); };
    $('#nw').onclick = () => { S.monday = addDays(S.monday, 7); vWeek(); };
    $('#tw').onclick = () => { S.monday = mondayOf(today()); vWeek(); };
    $('#saverv').onclick = async () => {
      await api('/review/' + S.monday, 'PUT', { wins: $('#rv_wins').value, struggles: $('#rv_struggles').value, changes: $('#rv_changes').value, priorities: $('#rv_priorities').value, strengthLifts: $('#rv_lifts').value, energy: $('#rv_energy').value });
      toast('Review saved'); vWeek();
    };
  }

  // ------------------------------------------------ PLAN
  const PLAN_ORDER = ['overview', 'lifestyle', 'mind', 'fitness', 'nutrition', 'supplements', 'career', 'timetable', 'roadmap', 'minimum'];
  async function vPlan() {
    if (!S.planCache) S.planCache = await api('/plan');
    renderPlan();
  }
  function renderBlocks(blocks) {
    return blocks.map(b => {
      if (b.h) return `<h3>${esc(b.h)}</h3>`;
      if (b.p) return `<p>${esc(b.p)}</p>`;
      if (b.ul) return `<ul class="tight">${b.ul.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      if (b.note) return `<div class="note ${b.kind || ''}">${b.kind === 'doctor' ? '⚕️ ' : b.kind === 'warn' ? '⚠️ ' : '💡 '}${esc(b.note)}</div>`;
      if (b.table) return `<div class="tablewrap"><table><thead><tr>${b.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      return '';
    }).join('');
  }
  function renderPlan() {
    const pl = S.planCache, secs = PLAN_ORDER.map(id => pl.sections.find(s => s.id === id)).filter(Boolean);
    const cur = secs.find(s => s.id === S.planSec) || secs[0];
    view.innerHTML = `<div class="row" style="justify-content:space-between"><h1>Your 90-Day Plan</h1><button class="btn" onclick="window.print()">Print / Save PDF</button></div>
    <div class="chips">${secs.map(s => `<button class="chip ${s.id === cur.id ? 'on' : ''}" data-s="${s.id}">${esc(s.title)}</button>`).join('')}</div>
    <div class="card"><h2>${esc(cur.title)}</h2>${renderBlocks(cur.blocks)}</div>`;
    view.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { S.planSec = b.dataset.s; renderPlan(); window.scrollTo(0, 0); });
  }

  // ------------------------------------------------ PROGRESS
  async function vProgress() {
    const { progress } = await api('/progress');
    const f = (k, l, st = '0.1') => `<div><label for="p_${k}">${l}</label><input id="p_${k}" type="number" step="${st}" min="0"></div>`;
    view.innerHTML = `<h1>Monthly measurements & strength</h1>
    <div class="card"><p class="muted small">Log on Day 1 and every 4 weeks (Days 30, 60, 90). Same time of day, same conditions.</p><div class="grid">
      <div><label for="p_date">Date</label><input id="p_date" type="date" value="${today()}"></div>
      ${f('weight', 'Weight (kg)')}${f('waist', 'Waist (cm)')}${f('chest', 'Chest (cm)')}${f('arm', 'Upper arm (cm)')}${f('thigh', 'Thigh (cm)')}${f('hips', 'Hips (cm)')}
      ${f('squat', 'Squat best set (kg × reps → kg)', '0.5')}${f('bench', 'Bench press (kg)', '0.5')}${f('deadlift', 'Deadlift (kg)', '0.5')}${f('row', 'Row (kg)', '0.5')}${f('ohp', 'Overhead press (kg)', '0.5')}
      <div><label for="p_note">Note</label><input id="p_note" type="text" maxlength="200"></div></div>
      <p><button class="btn pri" id="addp">Add entry</button></p></div>
    <div class="card"><h2>Weight trend</h2>${chart(progress)}</div>
    <div class="card"><h2>History</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Wt</th><th>Waist</th><th>Chest</th><th>Arm</th><th>Thigh</th><th>Hips</th><th>Sq</th><th>Bench</th><th>DL</th><th>Row</th><th>OHP</th><th></th></tr></thead><tbody>
    ${progress.length ? progress.slice().reverse().map(e => `<tr><td>${esc(e.date)}</td>${['weight', 'waist', 'chest', 'arm', 'thigh', 'hips', 'squat', 'bench', 'deadlift', 'row', 'ohp'].map(k => `<td>${e[k] ?? ''}</td>`).join('')}<td><button class="btn sm danger" data-del="${e.id}">✕</button></td></tr>`).join('') : '<tr><td colspan="13" class="muted">No entries yet.</td></tr>'}</tbody></table></div></div>`;
    $('#addp').onclick = async () => {
      const b = { date: $('#p_date').value, note: $('#p_note').value };
      ['weight', 'waist', 'chest', 'arm', 'thigh', 'hips', 'squat', 'bench', 'deadlift', 'row', 'ohp'].forEach(k => b[k] = $('#p_' + k).value);
      try { await api('/progress', 'POST', b); toast('Added'); vProgress(); } catch (e) { toast(e.message); }
    };
    view.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Delete this entry?')) { await api('/progress/' + b.dataset.del, 'DELETE'); vProgress(); } });
  }
  function chart(rows) {
    const pts = rows.filter(r => r.weight != null); if (pts.length < 2) return '<p class="muted">Add at least two weight entries to see the trend.</p>';
    const W = 640, H = 220, m = 34, ws = pts.map(p => p.weight), lo = Math.min(...ws) - 1, hi = Math.max(...ws) + 1;
    const x = i => m + i * (W - 2 * m) / (pts.length - 1), y = v => H - m - (v - lo) / (hi - lo) * (H - 2 * m);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend"><polyline fill="none" stroke="#0f766e" stroke-width="3" points="${pts.map((p, i) => `${x(i)},${y(p.weight)}`).join(' ')}"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.weight)}" r="4" fill="#0f766e"/><text x="${x(i)}" y="${y(p.weight) - 9}" font-size="11" text-anchor="middle" fill="currentColor">${p.weight}</text><text x="${x(i)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="currentColor">${short(p.date)}</text>`).join('')}</svg>`;
  }

  // ------------------------------------------------ JOBS
  const STATUS = ['Wishlist', 'Applied', 'Referral asked', 'Screening', 'Technical', 'HR / Final', 'Offer', 'Rejected', 'Withdrawn'];
  async function vJobs() {
    const { jobs } = await api('/jobs');
    const cnt = s => jobs.filter(j => j.status === s).length;
    view.innerHTML = `<h1>Job applications tracker</h1>
    <div class="card row"><span class="pill">${jobs.length} total</span><span class="pill">${cnt('Applied')} applied</span><span class="pill">${jobs.filter(j => ['Screening', 'Technical', 'HR / Final'].includes(j.status)).length} in interview</span><span class="pill">${cnt('Offer')} offers</span></div>
    <div class="card"><div class="grid"><div><label for="j_company">Company</label><input id="j_company"></div><div><label for="j_role">Role</label><input id="j_role"></div><div><label for="j_link">Link</label><input id="j_link" placeholder="https://…"></div>
      <div><label for="j_status">Status</label><select id="j_status">${STATUS.map(s => `<option ${s === 'Applied' ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label for="j_date">Applied on</label><input id="j_date" type="date" value="${today()}"></div><div><label for="j_fu">Follow-up date</label><input id="j_fu" type="date" value="${addDays(today(), 6)}"></div>
      <div><label for="j_next">Next step</label><input id="j_next"></div></div><p><button class="btn pri" id="addj">Add application</button></p></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Applied</th><th>Follow-up</th><th>Next step</th><th></th></tr></thead><tbody>
    ${jobs.length ? jobs.slice().reverse().map(j => `<tr><td>${j.link ? `<a href="${esc(/^https?:\/\//.test(j.link) ? j.link : '#')}" target="_blank" rel="noopener noreferrer">${esc(j.company)}</a>` : esc(j.company)}</td><td>${esc(j.role)}</td>
      <td><select data-st="${j.id}">${STATUS.map(s => `<option ${s === j.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td>${esc(j.appliedOn || '')}</td><td>${esc(j.followUp || '')}</td><td>${esc(j.nextStep || '')}</td><td><button class="btn sm danger" data-dj="${j.id}">✕</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted">No applications yet. Weeks 1-2 are for resume/LinkedIn; start applying in week 3.</td></tr>'}</tbody></table></div></div>`;
    $('#addj').onclick = async () => {
      if (!$('#j_company').value.trim()) return toast('Company is required');
      await api('/jobs', 'POST', { company: $('#j_company').value, role: $('#j_role').value, link: $('#j_link').value, status: $('#j_status').value, appliedOn: $('#j_date').value, followUp: $('#j_fu').value, nextStep: $('#j_next').value });
      toast('Added'); vJobs();
    };
    view.querySelectorAll('[data-st]').forEach(s => s.onchange = async () => { await api('/jobs/' + s.dataset.st, 'PUT', { status: s.value }); toast('Updated'); });
    view.querySelectorAll('[data-dj]').forEach(b => b.onclick = async () => { if (confirm('Delete this application?')) { await api('/jobs/' + b.dataset.dj, 'DELETE'); vJobs(); } });
  }

  // ------------------------------------------------ PROFILE
  const OPT = {
    gender: [['male', 'Male'], ['female', 'Female'], ['other', 'Other / prefer not to say']],
    experience: [['beginner', 'Beginner (< 6 months)'], ['intermediate', 'Intermediate (6 months - 2 years)'], ['advanced', 'Advanced (2+ years)']],
    dietPref: [['veg', 'Vegetarian'], ['egg', 'Eggetarian'], ['nonveg', 'Non-vegetarian']],
    equipment: [['gym', 'Gym'], ['home_dumbbells', 'Home with dumbbells/bands'], ['home_none', 'Home, no equipment']],
    activity: [['sedentary', 'Sedentary (desk job, little walking)'], ['light', 'Lightly active (some walking, 1-3 days/week)'], ['moderate', 'Moderately active (3-5 days/week)'], ['active', 'Very active / physical job']],
    workoutTime: [['evening', 'After work (evening)'], ['morning', 'Before work (morning)']], trainDays: [['4', '4 days'], ['5', '5 days']],
    skill: [['none', 'None'], ['basic', 'Basic'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']],
  };
  async function vProfile() {
    await loadProfile(); const p = S.profile || { skills: {}, startDate: today(), workoutTime: 'evening', commuteMin: 0, trainDays: 4 };
    const sel = (k, label, opts, req = true) => `<div><label for="f_${k}">${label}${req ? ' *' : ''}</label><select id="f_${k}"><option value="">Select…</option>${opts.map(([v, t]) => `<option value="${v}" ${String(p[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    const num = (k, label, ex = '', st = 'any', req = true) => `<div><label for="f_${k}">${label}${req ? ' *' : ''}</label><input id="f_${k}" type="number" inputmode="decimal" step="${st}" value="${p[k] ?? ''}" placeholder="${ex}"></div>`;
    const tm = (k, label, def) => `<div><label for="f_${k}">${label} *</label><input id="f_${k}" type="time" value="${p[k] || def || ''}"></div>`;
    const sk = (k, l) => `<div><label for="f_sk_${k}">${l}</label><select id="f_sk_${k}">${OPT.skill.map(([v, t]) => `<option value="${v}" ${(p.skills || {})[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    view.innerHTML = `<h1>Your profile</h1>
    ${S.profileMissing && S.profileMissing.length ? `<div class="note doctor">Complete the fields marked * to unlock your personalised daily, weekly and 90-day plan. No calorie targets are guessed: they are calculated only from your numbers.</div>` : ''}
    <form id="pf" class="card"><h2>About you</h2><div class="grid">
      <div><label for="f_name">Name</label><input id="f_name" value="${esc(p.name || '')}"></div>${num('age', 'Age', '28', '1')}${sel('gender', 'Gender', OPT.gender)}${num('heightCm', 'Height (cm)', '172')}${num('weightKg', 'Current weight (kg)', '60', '0.1')}${num('targetWeightKg', 'Target weight (kg)', '68', '0.1')}
      ${sel('experience', 'Training experience', OPT.experience)}${sel('activity', 'Daily activity (outside training)', OPT.activity)}${sel('dietPref', 'Dietary preference', OPT.dietPref)}</div>
      <div style="margin-top:12px"><label for="f_conditions">Medical conditions / injuries (or "none")</label><input id="f_conditions" value="${esc(p.conditions || '')}" placeholder="e.g., knee pain, thyroid, none"></div>
      <h2 style="margin-top:18px">Schedule</h2><div class="grid">${tm('workStart', 'Work starts', '09:30')}${tm('workEnd', 'Work ends', '18:00')}${num('commuteMin', 'Commute one-way (min, 0 if WFH)', '0', '5', false)}${tm('wake', 'Wake-up time', '06:00')}${tm('sleep', 'Bedtime', '22:30')}${sel('workoutTime', 'Preferred workout time', OPT.workoutTime, false)}${sel('equipment', 'Where will you train?', OPT.equipment)}${sel('trainDays', 'Training days / week', OPT.trainDays)}
      <div><label for="f_startDate">Plan start date (Day 1) *</label><input id="f_startDate" type="date" value="${p.startDate || today()}"></div></div>
      <h2 style="margin-top:18px">Career</h2><div class="grid">
      <div><label for="f_targetRole">Target job / role *</label><input id="f_targetRole" value="${esc(p.targetRole || '')}" placeholder="e.g., Data Analyst / BI Analyst / Automation Specialist"></div>
      <div><label for="f_jobTimeline">Timeline to change jobs *</label><input id="f_jobTimeline" value="${esc(p.jobTimeline || '')}" placeholder="e.g., 3-6 months"></div>
      ${sk('sql', 'SQL level')}${sk('python', 'Python level')}${sk('excel', 'Excel level')}${sk('powerbi', 'Power BI level')}${sk('stats', 'Statistics level')}</div>
      <p><button class="btn pri" type="submit">Save profile & build my plan</button> <span id="perr" class="muted"></span></p></form>
    <div class="card"><h2>Backup</h2><p class="muted small">Your data is stored in the configured database (Neon, Supabase, or local). Download a backup or restore one.</p><div class="row"><button class="btn" id="btn_dl_backup">Download backup</button><input type="file" id="imp" accept=".json" style="width:auto"></div></div>
    <div class="card"><h2>Backend Connection &amp; Credentials</h2><p class="muted small">Configured backend URL: <b>${esc(getApiBase() || 'Same origin / Local')}</b></p><div class="row"><button class="btn" id="p_cfg_btn">⚙️ Configure API &amp; Auth</button><button class="btn danger" id="p_logout_btn">Clear Saved Credentials</button></div></div>`;
    $('#pf').onsubmit = async e => {
      e.preventDefault(); const g = id => $('#f_' + id).value;
      const body = { name: g('name'), age: g('age'), gender: g('gender'), heightCm: g('heightCm'), weightKg: g('weightKg'), targetWeightKg: g('targetWeightKg'), experience: g('experience'), activity: g('activity'), dietPref: g('dietPref'), conditions: g('conditions'),
        workStart: g('workStart'), workEnd: g('workEnd'), commuteMin: g('commuteMin') || 0, wake: g('wake'), sleep: g('sleep'), workoutTime: g('workoutTime') || 'evening', equipment: g('equipment'), trainDays: g('trainDays'), startDate: g('startDate'),
        targetRole: g('targetRole'), jobTimeline: g('jobTimeline'), skills: { sql: g('sk_sql'), python: g('sk_python'), excel: g('sk_excel'), powerbi: g('sk_powerbi'), stats: g('sk_stats') } };
      try { await api('/profile', 'PUT', body); S.planCache = null; await loadProfile(); toast('Profile saved'); S.date = today(); go('plan'); }
      catch (err) { $('#perr').textContent = err.message; $('#perr').style.color = 'var(--bad)'; }
    };
    $('#btn_dl_backup').onclick = async () => {
      try {
        const data = await api('/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'lifeos-backup.json'; a.click();
        URL.revokeObjectURL(url);
        toast('Backup downloaded');
      } catch (err) { toast('Export failed: ' + err.message); }
    };
    $('#p_cfg_btn').onclick = () => promptConnModal();
    $('#p_logout_btn').onclick = () => { localStorage.removeItem('lifeos_auth'); toast('Credentials cleared'); go('profile'); };
    $('#imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (confirm('Replace ALL current data with this backup?')) { await api('/import', 'POST', j); S.profile = null; S.planCache = null; toast('Restored'); go('today'); } } catch (err) { toast('Invalid backup: ' + err.message); } };
  }

  go(S.tab);
})();
