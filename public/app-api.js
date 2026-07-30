/* ============================================================
   LPT Connect — production data layer.
   Loaded AFTER the inline app script. It shares the page's global
   lexical scope (DB, STATE, DOMAINS, clinicInfo, soapDraft, assessDraft…)
   and overrides the demo/in-memory functions with real API calls.
   The UI, rendering and workflow are untouched.
   ============================================================ */
(function () {
  'use strict';
  if (!window.API_ENABLED) return;

  let csrf = null;

  async function api(path, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const headers = {};
    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    const res = await fetch('/api' + path, {
      method,
      credentials: 'include',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_) { data = { raw: text }; } }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  window.api = api;

  /* ---------- helpers: date revival & array filling ---------- */
  const D = (v) => (v == null ? null : new Date(v));
  function fill(arr, items) { arr.length = 0; (items || []).forEach((x) => arr.push(x)); }
  function ensureDomains(c) {
    if (!c.progress) c.progress = {};
    if (window.DOMAINS) DOMAINS.forEach((d) => { if (!c.progress[d]) c.progress[d] = []; });
  }
  function reviveProgress(progress) {
    if (!progress) return progress;
    Object.keys(progress).forEach((d) => (progress[d] || []).forEach((p) => { p.date = D(p.date); }));
    return progress;
  }
  function reviveSession(s) { if (s) s.date = D(s.date); return s; }
  function reviveGoal(g) { if (g && g.started) g.started = D(g.started); return g; }
  function reviveHP(h) { if (h && h.assigned) h.assigned = D(h.assigned); return h; }
  function reviveTool(t) { if (t && t.date) t.date = D(t.date); return t; }
  function reviveChild(c) {
    c.dob = D(c.dob); c.startDate = D(c.startDate);
    (c.sessions || []).forEach(reviveSession);
    (c.goals || []).forEach(reviveGoal);
    (c.homeProgrammes || []).forEach(reviveHP);
    (c.tools || []).forEach(reviveTool);
    if (c.assessment && c.assessment.date) c.assessment.date = D(c.assessment.date);
    reviveProgress(c.progress);
    if (!c.tools) c.tools = [];
    if (c.assessment === undefined) c.assessment = null;
    ensureDomains(c);
    return c;
  }

  function applyMe(me) {
    STATE.user = {
      id: me.id, name: me.name, email: me.email, title: me.title || 'Therapist',
      initials: me.initials || '', color: me.color || '#3B82F6', role: me.role, spec: me.spec || '',
    };
    if (me.role === 'parent') { STATE.role = 'parent'; STATE.isAdmin = false; }
    else { STATE.role = 'therapist'; STATE.isAdmin = me.role === 'admin'; } // admins use the therapist UI
  }

  /* ---------- bootstrap: hydrate DB from the server ---------- */
  async function bootstrap() {
    const data = await api('/bootstrap');
    csrf = data.csrfToken || csrf;
    fill(DB.therapists, data.therapists);
    fill(DB.parents, data.parents);
    fill(DB.children, (data.children || []).map(reviveChild));
    fill(DB.activities, data.activities || []);
    if (data.clinic) Object.assign(clinicInfo, data.clinic);
    applyMe(data.me);
    return data;
  }
  window.bootstrap = bootstrap;

  // Wipe any demo seed that ran in the inline script — production data comes from the API.
  try { fill(DB.therapists, []); fill(DB.parents, []); fill(DB.children, []); fill(DB.activities, []); } catch (_) {}

  // Resume an existing session on reload (so refresh keeps you signed in).
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const me = await api('/auth/me');
      csrf = me.csrfToken || csrf;
      await bootstrap();
      enterApp();
    } catch (_) { /* not logged in — show login screen (default) */ }
  });

  /* ============================================================
     AUTH
     ============================================================ */
  window.doLogin = async function () {
    const email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
    const password = document.getElementById('loginPass').value || '';
    if (!email) { toast('Email required', 'Please enter your email address', 'warn'); return; }
    if (!password) { toast('Password required', 'Please enter your password', 'warn'); return; }
    try {
      await api('/auth/login', { method: 'POST', body: { email, password, role: loginRole } });
      await bootstrap();
      enterApp();
      toast('Welcome back', 'Signed in as ' + STATE.user.name, 'success');
    } catch (e) { toast('Sign in failed', e.message, 'warn'); }
  };

  window.submitAuth = function () {
    return authMode === 'signup' ? window.doSignup() : window.doLogin();
  };

  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('authBtn');
    if (btn && !btn._apiAuthBound) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.submitAuth();
      });
      btn._apiAuthBound = true;
    }
    ['loginEmail', 'loginPass'].forEach((id) => {
      const input = document.getElementById(id);
      if (input && !input._apiAuthBound) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            window.submitAuth();
          }
        });
        input._apiAuthBound = true;
      }
    });
  });

  window.doSignup = async function () {
    const name = (document.getElementById('suName').value || '').trim();
    const email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
    const pass = document.getElementById('loginPass').value || '';
    const pass2 = document.getElementById('loginPass2').value || '';
    if (!name) { toast('Name required', 'Please enter your full name', 'warn'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Valid email required', 'Please enter a valid email address', 'warn'); return; }
    if (pass.length < 6) { toast('Weak password', 'Use at least 6 characters', 'warn'); return; }
    if (pass !== pass2) { toast("Passwords don't match", 'Please re-enter your password', 'warn'); return; }
    const title = loginRole === 'therapist' ? document.getElementById('suTitle').value : undefined;
    try {
      await api('/auth/signup', { method: 'POST', body: { role: loginRole, name, email, password: pass, title } });
      await bootstrap();
      enterApp();
      toast('Account created', 'Welcome to LPT Connect, ' + name.split(' ')[0] + '!', 'success');
    } catch (e) { toast('Sign up failed', e.message, 'warn'); }
  };

  window.logout = async function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
    csrf = null;
    fill(DB.therapists, []); fill(DB.parents, []); fill(DB.children, []); fill(DB.activities, []);
    document.getElementById('app').style.display = 'none';
    document.getElementById('login').style.display = 'grid';
    STATE.role = null; STATE.user = null; STATE.childId = null; STATE.isAdmin = false;
    const gs = document.getElementById('globalSearch'); if (gs) gs.value = '';
  };

  /* ============================================================
     CHILDREN
     ============================================================ */
  window.saveChild = async function (id) {
    const name = document.getElementById('f_name').value.trim();
    if (!name) { toast('Name required', "Please enter the child's full name", 'warn'); return; }
    const pemail = document.getElementById('f_pemail').value.trim().toLowerCase();
    if (pemail && !/^\S+@\S+\.\S+$/.test(pemail)) { toast('Invalid parent email', 'Enter a valid email or leave it blank', 'warn'); return; }
    const pnameRaw = document.getElementById('f_pname').value.trim();
    const dobVal = document.getElementById('f_dob').value;
    const body = {
      name, gender: document.getElementById('f_gender').value,
      diagnosis: document.getElementById('f_diag').value.trim() || 'Under assessment',
      therapistId: document.getElementById('f_th').value,
      referral: document.getElementById('f_ref').value,
      dob: dobVal || null, parentEmail: pemail || null, parentName: pnameRaw || null,
    };
    try {
      if (id) {
        const updated = reviveChild(await api('/children/' + id, { method: 'PUT', body }));
        const i = DB.children.findIndex((c) => c.id === id); if (i >= 0) DB.children[i] = updated;
        closeModal();
        if (STATE.view === 'childWorkspace') navigate('childWorkspace', { childId: id, tab: STATE.tab }); else refreshChildGrid();
        toast('Profile updated', name + "'s profile has been saved", 'success');
      } else {
        const created = reviveChild(await api('/children', { method: 'POST', body }));
        DB.children.unshift(created);
        closeModal();
        if (STATE.view === 'children') refreshChildGrid();
        toast('Child enrolled', name + ' added — complete the Initial Assessment to set a baseline', 'success');
      }
    } catch (e) { toast('Could not save', e.message, 'warn'); }
  };

  window.archiveChild = function (id) {
    const c = childById(id);
    openConfirm(`Archive ${c.name}?`, 'This child will be moved to your archived list. You can restore them any time.', async () => {
      try {
        const updated = reviveChild(await api('/children/' + id + '/archive', { method: 'POST' }));
        const i = DB.children.findIndex((x) => x.id === id); if (i >= 0) DB.children[i] = updated;
        closeModal();
        toast(updated.status === 'archived' ? 'Child archived' : 'Child restored',
          c.name + (updated.status === 'archived' ? ' moved to archive' : ' is active again'), 'info');
        if (STATE.view === 'childWorkspace') navigate('children'); else refreshChildGrid();
      } catch (e) { toast('Could not update', e.message, 'warn'); }
    }, c.status === 'archived' ? 'Restore' : 'Archive');
  };

  /* ============================================================
     GOALS
     ============================================================ */
  window.saveGoal = async function (cid, gid) {
    const c = childById(cid); const title = document.getElementById('g_title').value.trim();
    if (!title) { toast('Goal needed', 'Please write a goal statement', 'warn'); return; }
    const body = {
      title, domain: document.getElementById('g_domain').value,
      target: parseInt(document.getElementById('g_target').value) || 80,
      progress: parseInt(document.getElementById('g_prog').value) || 0,
    };
    try {
      if (gid) { const g = reviveGoal(await api(`/children/${cid}/goals/${gid}`, { method: 'PUT', body })); const i = c.goals.findIndex((x) => x.id === gid); if (i >= 0) c.goals[i] = g; }
      else { const g = reviveGoal(await api(`/children/${cid}/goals`, { method: 'POST', body })); c.goals.push(g); }
      closeModal(); navigate('childWorkspace', { tab: 'goals' });
      toast(gid ? 'Goal updated' : 'Goal added', 'Saved to ' + c.name.split(' ')[0] + "'s plan", 'success');
    } catch (e) { toast('Could not save goal', e.message, 'warn'); }
  };

  window.adjustGoal = async function (cid, gid, delta) {
    const c = childById(cid); const g = c.goals.find((x) => x.id === gid);
    const progress = Math.max(0, Math.min(100, g.progress + delta));
    try {
      const ng = reviveGoal(await api(`/children/${cid}/goals/${gid}`, { method: 'PUT', body: { progress } }));
      Object.assign(g, ng); navigate('childWorkspace', { tab: 'goals' });
      toast('Goal updated', `Progress now ${g.progress}%`, 'info');
    } catch (e) { toast('Could not update', e.message, 'warn'); }
  };

  window.achieveGoal = async function (cid, gid) {
    const c = childById(cid); const g = c.goals.find((x) => x.id === gid);
    try {
      const ng = reviveGoal(await api(`/children/${cid}/goals/${gid}`, { method: 'PUT', body: { status: 'achieved', progress: 100 } }));
      Object.assign(g, ng); navigate('childWorkspace', { tab: 'goals' });
      toast('Goal achieved', 'Wonderful — goal marked as achieved!', 'success');
    } catch (e) { toast('Could not update', e.message, 'warn'); }
  };

  /* ============================================================
     HOME PROGRAMMES
     ============================================================ */
  window.saveHP = async function (cid, hid) {
    const c = childById(cid); const t = document.getElementById('h_t').value.trim();
    if (!t) { toast('Title needed', 'Please name the activity', 'warn'); return; }
    const body = {
      t, obj: document.getElementById('h_obj').value || '—', mat: document.getElementById('h_mat').value || '—',
      instr: document.getElementById('h_instr').value || '—', freq: document.getElementById('h_freq').value || 'As needed',
      out: document.getElementById('h_out').value || '—',
    };
    try {
      if (hid) { const h = reviveHP(await api(`/children/${cid}/hp/${hid}`, { method: 'PUT', body })); const i = c.homeProgrammes.findIndex((x) => x.id === hid); if (i >= 0) c.homeProgrammes[i] = h; }
      else { const h = reviveHP(await api(`/children/${cid}/hp`, { method: 'POST', body })); c.homeProgrammes.unshift(h); }
      closeModal(); navigate('childWorkspace', { tab: 'hp' });
      toast(hid ? 'Activity updated' : 'Home programme updated', `Saved for ${c.name.split(' ')[0]}`, 'success');
    } catch (e) { toast('Could not save', e.message, 'warn'); }
  };

  /* ============================================================
     SOAP SESSIONS (+ auto-save drafts)
     ============================================================ */
  function parseGoalsWorked() {
    if (typeof soapDraft._goals === 'string') return soapDraft._goals.split(',').map((x) => x.trim()).filter(Boolean);
    return soapDraft.goalsWorked || [];
  }
  function draftBody() {
    return {
      duration: parseInt(soapDraft.duration) || 45,
      subjective: soapDraft.subjective || '', objective: soapDraft.objective || '',
      assessment: soapDraft.assessment || '', plan: soapDraft.plan || '',
      activities: (soapDraft.activities || '').split('\n').map((x) => x.trim()).filter(Boolean),
      response: soapDraft.response || '', observation: soapDraft.observation || '',
      parentSummary: soapDraft.parentSummary || '', homeProgramme: soapDraft.homeProgramme || '',
      nextPlan: soapDraft.nextPlan || '', goalsWorked: parseGoalsWorked(),
    };
  }

  let _asTimer = null, _draftPromise = null;
  function setAutosaveHint(txt) {
    const foot = document.querySelector('.modal-foot'); if (!foot) return;
    let el = document.getElementById('autosaveHint');
    if (!el) {
      el = document.createElement('span'); el.id = 'autosaveHint';
      el.style.cssText = 'margin-right:auto;font-size:12px;color:var(--slate-500);font-weight:600;align-self:center';
      foot.insertBefore(el, foot.firstChild);
    }
    el.textContent = '✓ ' + txt;
  }
  async function autosaveSoap() {
    const cid = window._soapCid; if (!cid) return;
    const body = draftBody();
    try {
      if (!window._soapDraftId) {
        if (!_draftPromise) _draftPromise = api(`/children/${cid}/soap/draft`, { method: 'POST', body });
        const d = await _draftPromise; window._soapDraftId = d.id; _draftPromise = null;
      } else {
        await api(`/children/${cid}/soap/${window._soapDraftId}`, { method: 'PATCH', body });
      }
      setAutosaveHint('Draft saved');
    } catch (e) { _draftPromise = null; setAutosaveHint('Autosave paused'); }
  }
  function scheduleAutosave() { clearTimeout(_asTimer); _asTimer = setTimeout(autosaveSoap, 1200); }

  const _openSoapEditor = window.openSoapEditor;
  window.openSoapEditor = function (cid, dupId) {
    window._soapDraftId = null;           // fresh draft per editor open
    _draftPromise = null;
    _openSoapEditor(cid, dupId);
  };

  const _bindSoap = window.bindSoap;
  window.bindSoap = function () {
    _bindSoap();
    const pane = document.getElementById('soapEdPane');
    if (pane && !pane._autosaveBound) { pane.addEventListener('input', scheduleAutosave); pane._autosaveBound = true; }
  };

  window.saveSoap = async function () {
    const cid = window._soapCid; const c = childById(cid);
    const body = draftBody();
    body.parentSummary = body.parentSummary || 'Session completed. Please see the home programme.';
    body.homeProgramme = body.homeProgramme || '—';
    body.nextPlan = body.nextPlan || '—';
    if (window._soapDraftId) body.sid = window._soapDraftId;
    try {
      const out = await api(`/children/${cid}/soap`, { method: 'POST', body });
      const session = reviveSession(out.session);
      const i = c.sessions.findIndex((s) => s.id === session.id);
      if (i >= 0) c.sessions[i] = session; else c.sessions.unshift(session);
      c.sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      c.progress = reviveProgress(out.progress); ensureDomains(c);
      window._soapDraftId = null;
      closeModal(); navigate('childWorkspace', { childId: cid, tab: 'soap' });
      toast('Session saved', 'SOAP note signed and stored', 'success');
    } catch (e) { toast('Could not save session', e.message, 'warn'); }
  };

  /* ============================================================
     ASSESSMENT (baseline questionnaire + standardised tools)
     ============================================================ */
  window.saveAssessment = async function (cid) {
    const c = childById(cid); ensureDraft(c);
    if (draftAnsweredCount() === 0) { toast('Nothing to save', 'Rate at least one skill first', 'warn'); return; }
    const answers = {};
    DOMAINS.forEach((d) => { answers[d] = assessDraft.answers[d].map((v) => (v === null ? 0 : v)); });
    try {
      const out = await api(`/children/${cid}/assessment`, { method: 'POST', body: { answers } });
      c.progress = reviveProgress(out.progress); ensureDomains(c);
      if (out.assessment && out.assessment.date) out.assessment.date = new Date(out.assessment.date);
      c.assessment = out.assessment;
      progressDomain = DOMAINS[0];
      navigate('childWorkspace', { childId: cid, tab: 'progress' });
      toast('Baseline saved', 'Assessment results are now plotted on the progress charts', 'success');
    } catch (e) { toast('Could not save assessment', e.message, 'warn'); }
  };

  window.saveTool = async function (cid, tid) {
    const c = childById(cid);
    const code = document.getElementById('t_code').value;
    const opt = document.querySelector('#t_code option:checked');
    const presetName = opt && opt.dataset ? opt.dataset.name : '';
    const custom = code === 'OTHER';
    const name = custom ? (document.getElementById('t_name').value.trim() || 'Assessment') : (presetName || code);
    const realCode = custom ? (name.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase() || 'ASMT') : code;
    const date = document.getElementById('t_date').value || null;
    const body = { code: realCode, name, date, result: document.getElementById('t_result').value.trim(), notes: document.getElementById('t_notes').value.trim() };
    try {
      if (tid) { const tl = reviveTool(await api(`/children/${cid}/assessment/tools/${tid}`, { method: 'PUT', body })); const i = c.tools.findIndex((x) => x.id === tid); if (i >= 0) c.tools[i] = tl; }
      else { const tl = reviveTool(await api(`/children/${cid}/assessment/tools`, { method: 'POST', body })); if (!c.tools) c.tools = []; c.tools.unshift(tl); }
      closeModal(); navigate('childWorkspace', { childId: cid, tab: 'assessment' });
      toast(tid ? 'Assessment updated' : 'Assessment added', name + ' recorded', 'success');
    } catch (e) { toast('Could not save', e.message, 'warn'); }
  };

  window.deleteTool = function (cid, tid) {
    const c = childById(cid);
    openConfirm('Remove assessment?', 'This standardised result will be deleted.', async () => {
      try {
        await api(`/children/${cid}/assessment/tools/${tid}`, { method: 'DELETE' });
        c.tools = c.tools.filter((x) => x.id !== tid);
        closeModal(); navigate('childWorkspace', { childId: cid, tab: 'assessment' });
        toast('Removed', 'Assessment deleted', 'info');
      } catch (e) { toast('Could not remove', e.message, 'warn'); }
    }, 'Remove');
  };

  /* ============================================================
     REPORTS — generate + store a PDF on the server, then download.
     (printReport() keeps the pixel-styled browser print.)
     ============================================================ */
  window.exportPDF = async function () {
    const cid = STATE.childId;
    if (!cid) { return openReportWindow(true); }
    toast('Generating PDF', 'Preparing a stored PDF report…', 'info');
    try {
      const rep = await api(`/children/${cid}/reports`, { method: 'POST' });
      const a = document.createElement('a');
      a.href = `/api/children/${cid}/reports/${rep.id}/download`;
      a.download = rep.filename || 'report.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      toast('Report saved', 'A PDF report has been generated and stored', 'success');
    } catch (e) { toast('Could not generate PDF', e.message, 'warn'); }
  };

  /* ============================================================
     CLINIC SETTINGS
     ============================================================ */
  window.saveClinic = async function () {
    const body = {
      name: document.getElementById('cl_name').value, tagline: document.getElementById('cl_tag').value,
      address: document.getElementById('cl_addr').value, phone: document.getElementById('cl_phone').value,
      email: document.getElementById('cl_email').value,
    };
    try {
      if (STATE.isAdmin) { await api('/settings/clinic', { method: 'PUT', body }); Object.assign(clinicInfo, body); toast('Clinic updated', 'Clinic information saved for everyone', 'success'); }
      else { Object.assign(clinicInfo, body); toast('Saved', 'Updated locally — an administrator can change clinic-wide details', 'info'); }
    } catch (e) { toast('Could not save', e.message, 'warn'); }
  };

  /* ============================================================
     ADMIN — user management (added into Settings, admins only)
     ============================================================ */
  const _settingsPane = window.settingsPane;
  window.settingsPane = function () {
    if (STATE.settingsTab === 'users' && STATE.isAdmin) return usersPane();
    return _settingsPane();
  };
  window.renderSettings = function () {
    const tabs = [['clinic', 'Clinic Information', 'building'], ['profile', 'Therapist Profile', 'user'], ['theme', 'Application Theme', 'palette'], ['about', 'About', 'info']];
    if (STATE.isAdmin) tabs.splice(1, 0, ['users', 'User Management', 'user']);
    return `<div class="page-head"><div><h1>Settings</h1><p>Manage your clinic, profile and preferences.</p></div></div>
      <div class="grid" style="grid-template-columns:230px 1fr;align-items:start">
        <div class="section"><div class="section-body"><div class="set-nav">
          ${tabs.map((t) => `<button class="${STATE.settingsTab === t[0] ? 'active' : ''}" onclick="STATE.settingsTab='${t[0]}';navigate('settings')">${icon(t[2])} ${t[1]}</button>`).join('')}
        </div></div></div>
        <div id="setPane">${settingsPane()}</div>
      </div>`;
  };

  window.__users = [];
  function usersPane() {
    setTimeout(loadUsers, 0);
    return `<div class="section"><div class="section-head"><div>${icon('user')}</div><h3>User management</h3>
      <div class="actions"><button class="btn btn-sm btn-primary" onclick="openUserEditor()">${icon('plus')} Add user</button></div></div>
      <div class="section-body" id="usersPaneBody"><p class="muted">Loading users…</p></div></div>`;
  }
  async function loadUsers() {
    const body = document.getElementById('usersPaneBody'); if (!body) return;
    try {
      const users = await api('/users'); window.__users = users;
      body.innerHTML = '<div class="domain-list">' + users.map((u) => `
        <div class="drow">
          <div class="dname" style="width:auto;flex:1">
            <b>${u.name}</b> <span class="chip chip-grey">${u.role}</span>${u.active ? '' : ' <span class="chip chip-amber">inactive</span>'}
            <div class="muted" style="font-size:12px">${u.email}${u.title ? ' · ' + u.title : ''}</div>
          </div>
          <div class="actions" style="gap:6px">
            <button class="btn btn-sm btn-ghost" onclick="openUserEditor('${u.id}')">${icon('edit')} Edit</button>
            <button class="btn btn-sm btn-ghost" onclick="resetUserPassword('${u.id}')">Reset password</button>
            ${u.id !== STATE.user.id ? `<button class="btn btn-sm btn-ghost" onclick="deactivateUser('${u.id}')">${icon('x')}</button>` : ''}
          </div>
        </div>`).join('') + '</div>';
    } catch (e) { body.innerHTML = '<p class="muted">Could not load users: ' + e.message + '</p>'; }
  }
  window.openUserEditor = function (id) {
    const u = id ? (window.__users.find((x) => x.id === id) || {}) : {};
    const editing = !!id;
    const roles = ['therapist', 'admin', 'parent'];
    openModal(`
      <div class="modal-head"><h3>${editing ? 'Edit user' : 'Add user'}</h3><button class="x" onclick="closeModal()">${icon('x')}</button></div>
      <div class="modal-body"><div class="form-grid">
        <div class="field"><label>Full name</label><input id="u_name" class="input" value="${u.name || ''}"></div>
        <div class="field"><label>Role</label><select id="u_role" class="input">${roles.map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="field full"><label>Email</label><input id="u_email" class="input" type="email" value="${u.email || ''}" ${editing ? 'disabled' : ''}></div>
        <div class="field full"><label>Role / title</label><input id="u_title" class="input" value="${u.title || ''}" placeholder="e.g. Occupational Therapist"></div>
        ${editing ? '' : `<div class="field full"><label>Temporary password</label><input id="u_pass" class="input" type="text" placeholder="min 6 characters"></div>`}
      </div></div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser('${editing ? id : ''}')">${icon('save')} ${editing ? 'Save' : 'Create user'}</button></div>`, 'lg');
  };
  window.saveUser = async function (id) {
    const name = document.getElementById('u_name').value.trim();
    const role = document.getElementById('u_role').value;
    const title = document.getElementById('u_title').value.trim();
    if (!name) { toast('Name required', 'Please enter a name', 'warn'); return; }
    try {
      if (id) { await api('/users/' + id, { method: 'PUT', body: { name, role, title } }); }
      else {
        const email = document.getElementById('u_email').value.trim().toLowerCase();
        const password = document.getElementById('u_pass').value;
        if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Valid email required', '', 'warn'); return; }
        if (password.length < 6) { toast('Weak password', 'Use at least 6 characters', 'warn'); return; }
        await api('/users', { method: 'POST', body: { name, role, title, email, password } });
      }
      closeModal(); navigate('settings'); toast('Saved', 'User ' + (id ? 'updated' : 'created'), 'success');
    } catch (e) { toast('Could not save user', e.message, 'warn'); }
  };
  window.resetUserPassword = function (id) {
    openModal(`
      <div class="modal-head"><h3>Reset password</h3><button class="x" onclick="closeModal()">${icon('x')}</button></div>
      <div class="modal-body"><div class="field"><label>New temporary password</label><input id="rp_pass" class="input" type="text" placeholder="min 6 characters"></div></div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="doResetPassword('${id}')">${icon('save')} Set password</button></div>`, 'sm');
  };
  window.doResetPassword = async function (id) {
    const password = document.getElementById('rp_pass').value;
    if (password.length < 6) { toast('Weak password', 'Use at least 6 characters', 'warn'); return; }
    try { await api('/users/' + id + '/reset-password', { method: 'POST', body: { password } }); closeModal(); toast('Password reset', 'Share the new password securely', 'success'); }
    catch (e) { toast('Could not reset', e.message, 'warn'); }
  };
  window.deactivateUser = function (id) {
    const u = window.__users.find((x) => x.id === id) || {};
    openConfirm('Deactivate user?', `${u.name || 'This user'} will no longer be able to sign in. You can re-enable them later from the database.`, async () => {
      try { await api('/users/' + id, { method: 'DELETE' }); closeModal(); navigate('settings'); toast('Deactivated', 'User can no longer sign in', 'info'); }
      catch (e) { toast('Could not deactivate', e.message, 'warn'); }
    }, 'Deactivate');
  };
})();
