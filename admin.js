/* ============================================================
   admin.js — Navya Admin Dashboard
   Plain ES6, no framework. Requires navya-config.js + Supabase CDN.
   ============================================================ */

/* ── State ─────────────────────────────────────────────────── */
var _db          = null;   // supabase client
var _adminUser   = null;   // auth user object
var _profiles    = [];     // all profiles
var _checkins    = [];     // all checkins
var _tracks      = [];     // all symptom_tracks
var _views       = [];     // all guide_views
var _activeTab   = 'users';
var _search      = '';
var _detailUid   = null;

var MOOD_SCORE  = { rough: 1, tired: 2, okay: 3, good: 4, great: 5 };
var MOOD_EMOJI  = { rough: '😔', tired: '😴', okay: '🙂', good: '😊', great: '🌟' };
var MOOD_COLOR  = { rough: '#a73b21', tired: '#7d554f', okay: '#797c76', good: '#466743', great: '#274626' };

var SYM_LABELS = {
  'engorgement':                   { label: 'Breast engorgement',          severity: 'yellow' },
  'cracked-nipples':               { label: 'Cracked / sore nipples',       severity: 'yellow' },
  'cluster-feeding':               { label: 'Baby cluster feeding',         severity: 'green'  },
  'low-milk-supply-concern':       { label: 'Worried about milk supply',    severity: 'yellow' },
  'emotional-overwhelm-breastfeeding': { label: 'Tearful / overwhelmed',   severity: 'yellow' },
  'mastitis-symptoms':             { label: 'Hot, red breast with fever',   severity: 'red'    },
  'blocked-duct':                  { label: 'Tender lump in breast',        severity: 'yellow' },
  'sleepy-baby-at-breast':         { label: 'Baby falling asleep at breast',severity: 'yellow' },
};

/* ── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  var cfg = window.NAVYA_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    setRoot(configErrorHtml());
    return;
  }
  _db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  _db.auth.getSession().then(function (r) {
    var session = r && r.data && r.data.session;
    if (session && session.user) {
      _adminUser = session.user;
      checkAdminThenLoad();
    } else {
      showAdminLogin();
    }
  }).catch(function () { showAdminLogin(); });

  _db.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN' && session && session.user) {
      _adminUser = session.user;
      checkAdminThenLoad();
    } else if (event === 'SIGNED_OUT') {
      _adminUser = null;
      showAdminLogin();
    }
  });
});

/* ── Auth ───────────────────────────────────────────────────── */
function showAdminLogin() {
  hideTopbar();
  setRoot(
    '<div class="adm-center"><div class="adm-auth-card">' +
      '<div class="adm-auth-logo"><span class="material-symbols-outlined">admin_panel_settings</span></div>' +
      '<h1 class="adm-auth-title">Admin sign in</h1>' +
      '<p class="adm-auth-sub">Sign in with your Navya admin account</p>' +
      '<div id="adm-login-err" class="adm-error-msg" style="display:none;"></div>' +
      '<input class="adm-input" id="adm-email" type="email" placeholder="Email" autocomplete="email" />' +
      '<input class="adm-input" id="adm-pw"    type="password" placeholder="Password" autocomplete="current-password" />' +
      '<button class="adm-btn-primary" id="adm-login-btn" onclick="admSignIn()">Sign in</button>' +
    '</div></div>'
  );
}

function admSignIn() {
  var email = (document.getElementById('adm-email')  || {}).value || '';
  var pw    = (document.getElementById('adm-pw')     || {}).value || '';
  var errEl = document.getElementById('adm-login-err');
  var btn   = document.getElementById('adm-login-btn');
  if (!email || !pw) { if (errEl) { errEl.textContent = 'Enter email and password.'; errEl.style.display = ''; } return; }
  if (btn) btn.disabled = true;
  if (errEl) errEl.style.display = 'none';

  _db.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
    if (r.error) {
      if (errEl) { errEl.textContent = r.error.message; errEl.style.display = ''; }
      if (btn) btn.disabled = false;
    }
    // onAuthStateChange handles success
  }).catch(function (e) {
    if (errEl) { errEl.textContent = e.message || 'Sign-in failed.'; errEl.style.display = ''; }
    if (btn) btn.disabled = false;
  });
}

function admLogout() {
  _db.auth.signOut();
  hideTopbar();
}

/* ── Admin check + data load ────────────────────────────────── */
function checkAdminThenLoad() {
  setRoot('<div class="adm-loading"><span class="material-symbols-outlined adm-spin" style="font-size:2rem;color:#c6edbf;">refresh</span> Checking access…</div>');

  _db.from('profiles').select('is_admin, mom_name').eq('id', _adminUser.id).maybeSingle()
    .then(function (r) {
      if (!r.data || !r.data.is_admin) {
        hideTopbar();
        setRoot(accessDeniedHtml());
        return;
      }
      showTopbar();
      document.getElementById('adm-admin-email').textContent = _adminUser.email || '';
      loadAllData();
    })
    .catch(function (e) {
      setRoot('<div class="adm-center"><p style="color:#a73b21;">Error: ' + esc(e.message) + '</p></div>');
    });
}

function loadAllData() {
  setRoot('<div class="adm-loading"><span class="material-symbols-outlined adm-spin" style="font-size:2rem;color:#c6edbf;">refresh</span> Loading data…</div>');

  Promise.all([
    _db.from('profiles').select('*').order('created_at', { ascending: false }),
    _db.from('checkins').select('*').order('date', { ascending: false }),
    _db.from('symptom_tracks').select('*'),
    _db.from('guide_views').select('*'),
  ]).then(function (results) {
    _profiles = (results[0].data || []);
    _checkins = (results[1].data || []);
    _tracks   = (results[2].data || []);
    _views    = (results[3].data || []);
    renderDashboard();
  }).catch(function (e) {
    setRoot('<div class="adm-center"><p style="color:#a73b21;">Failed to load data: ' + esc(e.message) + '</p></div>');
  });
}

/* ── Dashboard ──────────────────────────────────────────────── */
function renderDashboard() {
  // Aggregate stats
  var nonAdminProfiles = _profiles.filter(function (p) { return !p.is_admin; });
  var totalUsers   = nonAdminProfiles.length;
  var guestUsers   = nonAdminProfiles.filter(function (p) { return p.is_guest; }).length;
  var totalCIs     = _checkins.length;
  var moodedCIs    = _checkins.filter(function (c) { return c.mood; });
  var avgMood      = moodedCIs.length
    ? (moodedCIs.reduce(function (s, c) { return s + (MOOD_SCORE[c.mood] || 3); }, 0) / moodedCIs.length).toFixed(1)
    : '—';
  var totalTracks  = _tracks.length;
  var resolved     = _tracks.filter(function (t) { return t.status === 'resolved'; }).length;
  var resRate      = totalTracks ? Math.round(resolved / totalTracks * 100) : 0;

  var html =
    '<div class="adm-main">' +
    summaryHtml(totalUsers, guestUsers, totalCIs, avgMood, resRate) +
    '<div class="adm-tabs">' +
      tabBtn('users',    'group',       'Users')    +
      tabBtn('symptoms', 'favorite',    'Symptoms') +
      tabBtn('guides',   'menu_book',   'Guide usage') +
    '</div>' +
    '<div id="adm-tab-content"></div>' +
    '</div>';

  setRoot(html);
  showTab(_activeTab);
}

function summaryHtml(users, guests, cis, avgMood, resRate) {
  var registered = users - guests;
  return '<div class="adm-summary">' +
    statCard(users,       'Total users',    registered + ' registered · ' + guests + ' guest') +
    statCard(cis,         'Check-ins',      'total logged') +
    statCard(avgMood + ' / 5', 'Avg mood', 'across all check-ins') +
    statCard(resRate + '%',    'Resolution rate', resolved + ' of ' + _tracks.length + ' issues cleared') +
  '</div>';
}

var resolved = 0; // will be set in renderDashboard

function statCard(val, label, sub) {
  return '<div class="adm-stat-card"><div class="adm-stat-val">' + val + '</div><div class="adm-stat-label">' + esc(label) + '</div><div class="adm-stat-sub">' + esc(sub) + '</div></div>';
}

function tabBtn(id, icon, label) {
  return '<button class="adm-tab' + (_activeTab === id ? ' active' : '') + '" onclick="showTab(\'' + id + '\')">' +
    '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">' + icon + '</span> ' + esc(label) +
  '</button>';
}

/* ── Tab switching ───────────────────────────────────────────── */
function showTab(tab) {
  _activeTab = tab;
  _detailUid = null;

  // Update tab active class
  document.querySelectorAll('.adm-tab').forEach(function (b) {
    b.classList.toggle('active', b.textContent.toLowerCase().indexOf(tab === 'users' ? 'user' : tab === 'symptoms' ? 'symptom' : 'guide') > -1);
  });

  var el = document.getElementById('adm-tab-content');
  if (!el) return;

  if (tab === 'users')    el.innerHTML = renderUsersTab();
  if (tab === 'symptoms') el.innerHTML = renderSymptomsTab();
  if (tab === 'guides')   el.innerHTML = renderGuidesTab();
}

/* ── Users tab ───────────────────────────────────────────────── */
function renderUsersTab() {
  var nonAdmins = _profiles.filter(function (p) { return !p.is_admin; });

  return '<div>' +
    '<div class="adm-search-wrap">' +
      '<span class="material-symbols-outlined adm-search-icon">search</span>' +
      '<input class="adm-search" id="adm-user-search" placeholder="Search by name or email…" oninput="filterUsers(this.value)" value="' + esc(_search) + '" />' +
    '</div>' +
    '<div class="adm-table-wrap"><table class="adm-table">' +
      '<thead><tr>' +
        '<th>User</th><th>Day</th><th>Last check-in</th><th>Check-ins</th><th>Avg mood</th><th>Streak</th><th>Top symptom</th>' +
      '</tr></thead>' +
      '<tbody id="adm-users-body">' + renderUserRows(nonAdmins, _search) + '</tbody>' +
    '</table></div></div>';
}

function filterUsers(q) {
  _search = q.toLowerCase();
  var tbody = document.getElementById('adm-users-body');
  if (tbody) tbody.innerHTML = renderUserRows(_profiles.filter(function (p) { return !p.is_admin; }), _search);
}

function renderUserRows(profiles, q) {
  var filtered = q ? profiles.filter(function (p) {
    return (p.mom_name||'').toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q);
  }) : profiles;

  if (!filtered.length) return '<tr><td colspan="7" class="adm-empty">No users found</td></tr>';

  return filtered.map(function (p) {
    var cis     = _checkins.filter(function (c) { return c.user_id === p.id; });
    var day     = dayFromBirth(p.birth_date);
    var lastCI  = cis.length ? cis.sort(function(a,b){return b.date>a.date?1:-1;})[0] : null;
    var avgM    = avgMoodScore(cis);
    var streak  = calcStreak(cis);
    var topSym  = topSymptom(cis);
    var initial = (p.mom_name||'M')[0].toUpperCase();
    var isRose  = (p.delivery_type === 'csection');

    var subLabel = p.is_guest
      ? '<span class="adm-pill adm-pill-grey" style="font-size:.625rem;">Guest</span>'
      : '<span style="color:#797c76;">' + esc(p.email||'') + '</span>';

    return '<tr class="clickable" onclick="showUserDetail(\'' + p.id + '\')">' +
      '<td><div class="adm-name-cell"><div class="adm-avatar ' + (isRose?'adm-avatar-rose':'') + '">' + esc(initial) + '</div>' +
        '<div><div style="font-weight:700;font-size:.875rem;">' + esc(p.mom_name||'Unknown') + '</div>' +
        '<div style="font-size:.6875rem;margin-top:.1rem;">' + subLabel + '</div></div></div></td>' +
      '<td>' + (day ? '<span class="adm-pill adm-pill-grey">Day ' + day + '</span>' : '—') + '</td>' +
      '<td>' + (lastCI ? formatDate(lastCI.date) : '<span style="color:#797c76;">Never</span>') + '</td>' +
      '<td><strong>' + cis.length + '</strong></td>' +
      '<td>' + (avgM ? '<span title="' + avgM.toFixed(1) + '">' + moodEmoji(avgM) + '</span>' : '—') + '</td>' +
      '<td>' + (streak > 0 ? streak + ' day' + (streak>1?'s':'') : '—') + '</td>' +
      '<td>' + (topSym ? '<span class="adm-pill adm-pill-' + (SYM_LABELS[topSym]||{severity:'grey'}).severity + '">' + esc((SYM_LABELS[topSym]||{label:topSym}).label) + '</span>' : '—') + '</td>' +
    '</tr>';
  }).join('');
}

/* ── Symptoms tab ────────────────────────────────────────────── */
function renderSymptomsTab() {
  var counts = {}, resolvedCounts = {}, totalTracked = {};
  _checkins.forEach(function (c) {
    (c.symptoms || []).forEach(function (s) { counts[s] = (counts[s]||0) + 1; });
  });
  _tracks.forEach(function (t) {
    totalTracked[t.slug] = (totalTracked[t.slug]||0) + 1;
    if (t.status === 'resolved') resolvedCounts[t.slug] = (resolvedCounts[t.slug]||0) + 1;
  });

  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  if (!keys.length) return '<div class="adm-empty">No symptom data yet.</div>';

  var maxCount = counts[keys[0]] || 1;

  var bars = keys.map(function (slug) {
    var info     = SYM_LABELS[slug] || { label: slug, severity: 'green' };
    var pct      = Math.round(counts[slug] / maxCount * 100);
    var total    = totalTracked[slug] || 0;
    var res      = resolvedCounts[slug] || 0;
    var resLabel = total ? Math.round(res/total*100) + '% resolved' : 'not tracked';
    return '<div class="adm-bar-row">' +
      '<div class="adm-bar-label" title="' + esc(info.label) + '">' + esc(info.label) + '</div>' +
      '<div class="adm-bar-track"><div class="adm-bar-fill ' + esc(info.severity) + '" style="width:' + pct + '%"></div></div>' +
      '<div class="adm-bar-count">' + counts[slug] + '</div>' +
      '<div class="adm-bar-res">' + esc(resLabel) + '</div>' +
    '</div>';
  }).join('');

  return '<div class="adm-table-wrap" style="padding:1.25rem;">' +
    '<p style="font-size:.8125rem;color:#797c76;margin-bottom:1rem;">Symptom frequency across all users (bar = relative count). Resolution % = users who marked it resolved.</p>' +
    '<div style="display:flex;gap:.5rem;margin-bottom:.75rem;font-size:.6875rem;font-weight:700;color:#797c76;text-transform:uppercase;letter-spacing:.06em;">' +
      '<span style="width:200px;">Symptom</span><span style="flex:1;">Frequency</span><span style="width:40px;text-align:right;">Count</span><span style="width:80px;text-align:right;">Resolved</span>' +
    '</div>' +
    '<div class="adm-bar-list">' + bars + '</div>' +
  '</div>';
}

/* ── Guide usage tab ─────────────────────────────────────────── */
function renderGuidesTab() {
  var counts = {};
  _views.forEach(function (v) { counts[v.slug] = (counts[v.slug]||0) + 1; });
  var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

  if (!keys.length) return '<div class="adm-empty">No guide views tracked yet.</div>';

  var maxCount = counts[keys[0]] || 1;

  var bars = keys.map(function (slug) {
    var info = SYM_LABELS[slug] || { label: slug, severity: 'green' };
    var pct  = Math.round(counts[slug] / maxCount * 100);
    var uniqueUsers = new Set(_views.filter(function(v){return v.slug===slug;}).map(function(v){return v.user_id;})).size;
    return '<div class="adm-bar-row">' +
      '<div class="adm-bar-label">' + esc(info.label) + '</div>' +
      '<div class="adm-bar-track"><div class="adm-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="adm-bar-count">' + counts[slug] + '</div>' +
      '<div class="adm-bar-res">' + uniqueUsers + ' user' + (uniqueUsers!==1?'s':'') + '</div>' +
    '</div>';
  }).join('');

  return '<div class="adm-table-wrap" style="padding:1.25rem;">' +
    '<p style="font-size:.8125rem;color:#797c76;margin-bottom:1rem;">Which symptom guides are opened most. Count = total opens, Users = unique users.</p>' +
    '<div style="display:flex;gap:.5rem;margin-bottom:.75rem;font-size:.6875rem;font-weight:700;color:#797c76;text-transform:uppercase;letter-spacing:.06em;">' +
      '<span style="width:200px;">Guide card</span><span style="flex:1;">Views</span><span style="width:40px;text-align:right;">Total</span><span style="width:80px;text-align:right;">Users</span>' +
    '</div>' +
    '<div class="adm-bar-list">' + bars + '</div>' +
  '</div>';
}

/* ── User detail ──────────────────────────────────────────────── */
function showUserDetail(uid) {
  _detailUid = uid;
  var profile   = _profiles.find(function (p) { return p.id === uid; });
  var userCIs   = _checkins.filter(function (c) { return c.user_id === uid; }).sort(function(a,b){return b.date>a.date?1:-1;});
  var userTracks= _tracks.filter(function (t) { return t.user_id === uid; });
  var userViews = _views.filter(function (v) { return v.user_id === uid; });
  if (!profile) return;

  var day     = dayFromBirth(profile.birth_date);
  var initial = (profile.mom_name||'M')[0].toUpperCase();
  var avgM    = avgMoodScore(userCIs);
  var streak  = calcStreak(userCIs);
  var resolvedCount = userTracks.filter(function(t){return t.status==='resolved';}).length;

  // Check-in history rows
  var ciRows = userCIs.map(function (c) {
    var syms = (c.symptoms||[]).map(function(s){
      var info = SYM_LABELS[s]||{label:s,severity:'grey'};
      return '<span class="adm-pill adm-pill-' + info.severity + '">' + esc(info.label) + '</span>';
    }).join('');
    return '<div class="adm-ci-row">' +
      '<div class="adm-ci-date">' + esc(formatDate(c.date)) + '</div>' +
      '<div class="adm-ci-mood">' + (MOOD_EMOJI[c.mood]||'—') + '</div>' +
      '<div class="adm-ci-sym">' + (syms||'<span style="color:#797c76;font-size:.75rem;">None</span>') + '</div>' +
      (c.note_text ? '<div class="adm-ci-note">' + esc(c.note_text.slice(0,80)) + (c.note_text.length>80?'…':'') + '</div>' : '') +
    '</div>';
  }).join('');

  // Symptom tracker rows
  var trackRows = userTracks.map(function (t) {
    var badge = t.status === 'resolved'
      ? '<span class="adm-pill adm-pill-green">✓ ' + t.days_to_resolve + 'd</span>'
      : '<span class="adm-pill adm-pill-yellow">Ongoing ' + Math.max(0,(dayFromBirth(profile.birth_date)||0) - (t.first_seen_day||0)) + 'd</span>';
    return '<tr><td>' + esc(t.title||t.slug) + '</td><td>Day ' + (t.first_seen_day||'?') + '</td><td>' + badge + '</td><td>' + esc(t.note||'') + '</td></tr>';
  }).join('');

  // Guide views
  var viewCounts = {};
  userViews.forEach(function(v){ viewCounts[v.slug]=(viewCounts[v.slug]||0)+1; });
  var viewPills = Object.keys(viewCounts).sort(function(a,b){return viewCounts[b]-viewCounts[a];}).map(function(slug){
    var info = SYM_LABELS[slug]||{label:slug};
    return '<span class="adm-pill adm-pill-grey">' + esc(info.label) + ' ×' + viewCounts[slug] + '</span>';
  }).join('');

  var el = document.getElementById('adm-tab-content');
  if (!el) return;

  el.innerHTML =
    '<div class="adm-detail">' +
    '<button class="adm-back-btn" onclick="showTab(\'users\')"><span class="material-symbols-outlined" style="font-size:1.125rem;">arrow_back</span> All users</button>' +

    '<div class="adm-user-hero">' +
      '<div class="adm-user-hero-avatar">' + esc(initial) + '</div>' +
      '<div style="flex:1;">' +
        '<div class="adm-user-hero-name">' + esc(profile.mom_name||'Unknown') + '</div>' +
        '<div class="adm-user-hero-meta">' +
          (profile.is_guest ? '<span class="adm-pill adm-pill-grey" style="margin-right:.375rem;">Guest</span>' : esc(profile.email||'') + ' · ') +
          esc(profile.delivery_type==='csection'?'C-section':'Normal delivery') + ' · ' + (day?'Day '+day:'Day ?') +
        '</div>' +
        '<div class="adm-detail-chips">' +
          '<span class="adm-pill adm-pill-grey">' + userCIs.length + ' check-ins</span>' +
          (avgM ? '<span class="adm-pill adm-pill-green">' + moodEmoji(avgM) + ' ' + avgM.toFixed(1) + ' avg mood</span>' : '') +
          (streak > 0 ? '<span class="adm-pill adm-pill-yellow">' + streak + '-day streak</span>' : '') +
          (resolvedCount > 0 ? '<span class="adm-pill adm-pill-green">' + resolvedCount + ' resolved</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="adm-section-title">Mood journey</div>' +
    '<div class="adm-graph-wrap">' + buildDetailGraph(userCIs) + '</div>' +

    '<div class="adm-section-title">Check-in history (' + userCIs.length + ')</div>' +
    (ciRows || '<p style="font-size:.875rem;color:#797c76;">No check-ins yet.</p>') +

    (userTracks.length ? '<div class="adm-section-title">Symptom tracker</div>' +
      '<div class="adm-table-wrap"><table class="adm-table">' +
        '<thead><tr><th>Symptom</th><th>First seen</th><th>Status</th><th>Note</th></tr></thead>' +
        '<tbody>' + trackRows + '</tbody></table></div>' : '') +

    (viewPills ? '<div class="adm-section-title">Guide cards viewed</div><div style="display:flex;flex-wrap:wrap;gap:.375rem;">' + viewPills + '</div>' : '') +

    '</div>';
}

/* ── Mini mood graph for user detail ────────────────────────── */
function buildDetailGraph(checkins) {
  var sorted = checkins.filter(function(c){return c.mood&&c.day;})
    .sort(function(a,b){return a.day-b.day;});
  if (!sorted.length) return '<p style="font-size:.8125rem;color:#797c76;">No mood data yet.</p>';

  var PL=32,PR=8,PT=10,PB=22,VW=480,VH=120;
  var W=VW-PL-PR, H=VH-PT-PB;
  function xPos(d){ return PL+(d-1)/39*W; }
  function yPos(s){ return PT+H-(s-1)/4*H; }

  var segments=[],seg=[];
  for(var i=0;i<sorted.length;i++){
    if(i>0&&sorted[i].day-sorted[i-1].day>5){if(seg.length){segments.push(seg);seg=[];}}
    seg.push({x:xPos(sorted[i].day),y:yPos(MOOD_SCORE[sorted[i].mood]||3),mood:sorted[i].mood});
  }
  if(seg.length)segments.push(seg);

  var lines=segments.filter(function(s){return s.length>1;}).map(function(s){
    return '<polyline fill="none" stroke="#466743" stroke-width="2" stroke-linecap="round" opacity=".55" points="'+s.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ')+'" />';
  }).join('');

  var dots=sorted.map(function(c){
    return '<circle cx="'+xPos(c.day).toFixed(1)+'" cy="'+yPos(MOOD_SCORE[c.mood]||3).toFixed(1)+'" r="4" fill="'+(MOOD_COLOR[c.mood]||'#466743')+'" stroke="white" stroke-width="1.5" />';
  }).join('');

  var xGrid=[1,10,20,30,40].map(function(d){
    var x=xPos(d).toFixed(1);
    return '<line x1="'+x+'" y1="'+PT+'" x2="'+x+'" y2="'+(PT+H)+'" stroke="#e8e9e3" stroke-width="1" />'+
           '<text x="'+x+'" y="'+(PT+H+14)+'" text-anchor="middle" font-size="9" fill="#797c76">'+d+'</text>';
  }).join('');

  return '<svg viewBox="0 0 '+VW+' '+VH+'" width="100%" style="max-height:130px;display:block;">' +
    xGrid+lines+dots+
    '<text x="'+(PL+W/2).toFixed(1)+'" y="'+(VH-2)+'" text-anchor="middle" font-size="8" fill="#797c76">day (1–40)</text>'+
  '</svg>';
}

/* ── Helpers ─────────────────────────────────────────────────── */
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setRoot(html) {
  var el = document.getElementById('adm-root');
  if (el) el.innerHTML = html;
}

function showTopbar() {
  var el = document.getElementById('adm-topbar');
  if (el) el.style.display = '';
}

function hideTopbar() {
  var el = document.getElementById('adm-topbar');
  if (el) el.style.display = 'none';
}

function dayFromBirth(birthDate) {
  if (!birthDate) return null;
  try {
    var diff = Math.floor((new Date() - new Date(birthDate)) / 86400000) + 1;
    return Math.min(Math.max(diff, 1), 40);
  } catch (e) { return null; }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch (e) { return iso; }
}

function avgMoodScore(cis) {
  var moodCIs = cis.filter(function(c){return c.mood;});
  if (!moodCIs.length) return null;
  return moodCIs.reduce(function(s,c){return s+(MOOD_SCORE[c.mood]||3);},0)/moodCIs.length;
}

function moodEmoji(score) {
  if (score >= 4.5) return '🌟';
  if (score >= 3.5) return '😊';
  if (score >= 2.5) return '🙂';
  if (score >= 1.5) return '😴';
  return '😔';
}

function calcStreak(cis) {
  var today = new Date();
  var streak = 0;
  for (var d = 0; d <= 40; d++) {
    var dt = new Date(today); dt.setDate(dt.getDate() - d);
    var iso = dt.toISOString().slice(0, 10);
    if (cis.some(function(c){return c.date===iso;})) { streak++; }
    else if (d > 0) { break; }
  }
  return streak;
}

function topSymptom(cis) {
  var counts = {};
  cis.forEach(function(c){ (c.symptoms||[]).forEach(function(s){ counts[s]=(counts[s]||0)+1; }); });
  return Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];})[0] || null;
}

function admToast(msg) {
  var el = document.getElementById('adm-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(function(){ el.classList.remove('visible'); }, 2500);
}

/* ── Error / access denied screens ──────────────────────────── */
function configErrorHtml() {
  return '<div class="adm-center"><div class="adm-auth-card">' +
    '<div class="adm-auth-logo" style="background:#fde8e3;color:#a73b21;"><span class="material-symbols-outlined">error</span></div>' +
    '<h1 class="adm-auth-title" style="font-size:1.25rem;">Not configured</h1>' +
    '<p style="font-size:.875rem;color:#5d605b;">Fill in <code>navya-config.js</code> with your Supabase URL and anon key.</p>' +
  '</div></div>';
}

function accessDeniedHtml() {
  return '<div class="adm-center"><div class="adm-auth-card">' +
    '<div class="adm-auth-logo" style="background:#fde8e3;color:#a73b21;"><span class="material-symbols-outlined">lock</span></div>' +
    '<h1 class="adm-auth-title" style="font-size:1.25rem;">Access denied</h1>' +
    '<p style="font-size:.875rem;color:#5d605b;margin-bottom:.5rem;">Your account does not have admin access. Ask a super-admin to run this in Supabase SQL Editor:</p>' +
    '<div class="adm-access-denied"><pre>update public.profiles\nset is_admin = true\nwhere email = \'' + esc(_adminUser ? _adminUser.email : 'your@email.com') + '\';</pre></div>' +
    '<button class="adm-btn-primary" style="margin-top:1.25rem;" onclick="admLogout()">Sign out</button>' +
  '</div></div>';
}
