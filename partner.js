/* ============================================================
   Navya — partner.js
   Partner / family view. Read-only access to mom's daily logs.
   Partner can add their own note per day.

   Access contract (strict):
   READ:  navya_checkin_*        (mom's check-ins)
          navya_mom_name         (display name)
          navya_birth_date       (day calculation)
          navya_partner_pin      (authentication)
          navya_partner_name     (display name)
   WRITE: navya_partner_note_*   (partner notes only — never modifies mom's data)

   This file does NOT import or reference app.js state.
   ============================================================ */

/* ─── DATA ACCESS (read-only helpers) ─────────────────────── */

var PDB = {
  get: function(key, fallback) {
    if (fallback === undefined) fallback = null;
    try { var v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch(e) { return fallback; }
  },
  // WRITE ONLY to partner_note keys
  setNote: function(isoDate, note) {
    try {
      localStorage.setItem('navya_partner_note_' + isoDate, JSON.stringify({
        date: isoDate, note: note, saved_at: new Date().toISOString()
      }));
      return true;
    } catch(e) { return false; }
  },
  getNote: function(isoDate) {
    return PDB.get('navya_partner_note_' + isoDate, null);
  },
  getMomCheckin: function(isoDate) {
    return PDB.get('navya_checkin_' + isoDate, null);
  },
  getAllCheckins: function() {
    var result = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('navya_checkin_')) {
        try { result.push(JSON.parse(localStorage.getItem(key))); }
        catch(e) { /* skip */ }
      }
    }
    return result.sort(function(a, b) { return b.date > a.date ? 1 : -1; });
  },
  getProfile: function() {
    return {
      momName:      PDB.get('navya_mom_name', 'Mama'),
      partnerPIN:   PDB.get('navya_partner_pin', null),
      partnerName:  PDB.get('navya_partner_name', 'Partner'),
      birthDate:    PDB.get('navya_birth_date', null),
    };
  },
};

/* ─── STATE ─────────────────────────────────────────────────── */
var pAuthenticated = false;
var pCurrentScreen = 'pin';

var MOODS = [
  { key: 'rough', emoji: '😔', label: 'Rough' },
  { key: 'tired', emoji: '😴', label: 'Tired' },
  { key: 'okay',  emoji: '🙂', label: 'Okay'  },
  { key: 'good',  emoji: '😊', label: 'Good'  },
  { key: 'great', emoji: '🌟', label: 'Great' },
];

var CHECKIN_SYMPTOMS = [
  { slug: 'engorgement',      label: 'Breast engorgement',              severity: 'yellow' },
  { slug: 'cracked-nipples',  label: 'Cracked / sore nipples',          severity: 'yellow' },
  { slug: 'cluster-feeding',  label: 'Baby cluster feeding',            severity: 'green'  },
  { slug: 'low-milk-supply-concern', label: 'Worried about milk supply',severity: 'yellow' },
  { slug: 'emotional-overwhelm-breastfeeding', label: 'Tearful / overwhelmed', severity: 'yellow' },
  { slug: 'mastitis-symptoms', label: 'Hot, red breast with fever',     severity: 'red'    },
  { slug: 'blocked-duct',     label: 'Tender lump in breast',           severity: 'yellow' },
  { slug: 'sleepy-baby-at-breast', label: 'Baby falling asleep feeding',severity: 'yellow' },
];

/* ─── UTILS ─────────────────────────────────────────────────── */

function pSetContent(html) {
  var root = document.getElementById('partner-root');
  root.innerHTML = html;
  root.scrollTop = 0;
}

function pEsc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function pGetTodayISO() {
  return new Date().toISOString().slice(0,10);
}

function pGetCurrentDay(birthDateStr) {
  if (!birthDateStr) return 1;
  try {
    var birth = new Date(birthDateStr);
    var today = new Date();
    var diff  = Math.floor((today - birth) / 86400000) + 1;
    return Math.min(Math.max(diff, 1), 40);
  } catch(e) { return 1; }
}

function pShowToast(msg) {
  var toast = document.getElementById('p-notif-toast');
  var body  = document.getElementById('p-notif-body');
  if (!toast || !body) return;
  body.textContent = msg;
  toast.classList.add('visible');
  setTimeout(function() { toast.classList.remove('visible'); }, 3500);
}

function pSetNavActive(id) {
  document.querySelectorAll('.nb-btn').forEach(function(b) { b.classList.remove('active'); });
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function pNavigate(screen) {
  if (!pAuthenticated) { pShowPIN(); return; }
  pCurrentScreen = screen;
  var navMap = { today: 'pnb-today', history: 'pnb-history', note: 'pnb-note' };
  pSetNavActive(navMap[screen] || 'pnb-today');
  if (screen === 'today')   pShowToday();
  else if (screen === 'history') pShowHistory();
  else if (screen === 'note')    pShowNote();
}

/* ─── SCREEN: PIN ENTRY ──────────────────────────────────────── */

function pShowPIN() {
  var nav = document.querySelector('.nav-bottom');
  if (nav) nav.style.display = 'none';

  var profile = PDB.getProfile();

  if (!profile.partnerPIN) {
    pSetContent(
      '<div class="pin-wrap">' +
      '<div class="pin-icon"><span class="material-symbols-outlined">lock</span></div>' +
      '<h2 class="pin-title">No access set up</h2>' +
      '<p class="pin-sub">' + pEsc(profile.momName) + ' hasn\'t set up partner access yet. Ask them to go to Settings in Navya and create a partner PIN.</p>' +
      '<a href="index.html" style="display:inline-block;margin-top:1rem;color:var(--primary);font-weight:700;text-decoration:none;">Go to Navya</a>' +
      '</div>'
    );
    return;
  }

  pSetContent(
    '<div class="pin-wrap">' +
    '<div class="pin-icon"><span class="material-symbols-outlined">favorite</span></div>' +
    '<h2 class="pin-title">Partner view</h2>' +
    '<p class="pin-sub">Enter your PIN to see ' + pEsc(profile.momName) + '\'s daily log and baby info.</p>' +
    '<div class="pin-input-row">' +
      [0,1,2,3].map(function(i) {
        return '<input class="pin-digit" id="ppin-' + i + '" maxlength="1" inputmode="numeric" type="password" oninput="pPinInput(this,' + i + ')" />';
      }).join('') +
    '</div>' +
    '<p class="pin-error" id="pin-error-msg"></p>' +
    '<button class="pin-submit" id="pin-submit-btn" onclick="pVerifyPIN()" disabled>Enter</button>' +
    '<p class="pin-no-access">This is a convenience PIN for a shared device. It does not encrypt your data.</p>' +
    '</div>'
  );

  requestAnimationFrame(function() {
    var el = document.getElementById('ppin-0');
    if (el) el.focus();
  });
}

function pPinInput(el, idx) {
  el.value = el.value.replace(/\D/g,'').slice(-1);
  if (el.value && idx < 3) {
    var next = document.getElementById('ppin-' + (idx+1));
    if (next) next.focus();
  }
  // Enable submit when all 4 filled
  var all = [0,1,2,3].every(function(i) {
    var d = document.getElementById('ppin-' + i);
    return d && d.value.length === 1;
  });
  var btn = document.getElementById('pin-submit-btn');
  if (btn) btn.disabled = !all;
}

function pVerifyPIN() {
  var entered = [0,1,2,3].map(function(i) {
    var d = document.getElementById('ppin-' + i);
    return d ? d.value : '';
  }).join('');

  var stored  = PDB.get('navya_partner_pin', null);
  var errEl   = document.getElementById('pin-error-msg');

  if (entered === stored) {
    pAuthenticated = true;
    var nav = document.querySelector('.nav-bottom');
    if (nav) nav.style.display = '';
    var profile = PDB.getProfile();
    var topName = document.getElementById('partner-top-name');
    if (topName) topName.textContent = pEsc(profile.partnerName) + '\'s view';
    pNavigate('today');
  } else {
    if (errEl) errEl.textContent = 'Incorrect PIN. Try again.';
    [0,1,2,3].forEach(function(i) {
      var d = document.getElementById('ppin-' + i);
      if (d) d.value = '';
    });
    requestAnimationFrame(function() {
      var el = document.getElementById('ppin-0');
      if (el) el.focus();
    });
  }
}

/* ─── SCREEN: TODAY'S SUMMARY ───────────────────────────────── */

function pShowToday() {
  var profile  = PDB.getProfile();
  var today    = pGetTodayISO();
  var day      = pGetCurrentDay(profile.birthDate);
  var checkin  = PDB.getMomCheckin(today);
  var pNote    = PDB.getNote(today);

  var mood = checkin && checkin.mood ? MOODS.find(function(m) { return m.key === checkin.mood; }) : null;

  var sympHtml = '';
  if (checkin && checkin.symptoms && checkin.symptoms.length) {
    sympHtml = '<div style="margin-top:.625rem;">' +
      '<p style="font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--on-surface-var);margin-bottom:.375rem;">Logged symptoms</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:.3rem;">' +
      checkin.symptoms.map(function(slug) {
        var sym = CHECKIN_SYMPTOMS.find(function(s) { return s.slug === slug; });
        if (!sym) return '';
        var cls = sym.severity === 'red' ? 'note-sym-pill red' : sym.severity === 'green' ? 'note-sym-pill green' : 'note-sym-pill yellow';
        return '<span class="' + cls + '">' + pEsc(sym.label) + '</span>';
      }).join('') +
      '</div></div>';
  }

  var noteHtml = '';
  if (checkin && checkin.note_text) {
    noteHtml = '<div style="margin-top:.625rem;"><p style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--on-surface-var);margin-bottom:.3rem;">Her note</p><p style="font-size:.875rem;color:var(--on-surface);line-height:1.55;">' + pEsc(checkin.note_text) + '</p></div>';
  }
  var voiceHtml = '';
  if (checkin && checkin.voice_transcript) {
    voiceHtml = '<div style="margin-top:.5rem;"><span class="material-symbols-outlined" style="font-size:.875rem;vertical-align:middle;color:var(--primary);">mic</span> <em style="font-size:.875rem;color:var(--on-surface-var);">' + pEsc(checkin.voice_transcript) + '</em></div>';
  }

  var hasRed = checkin && (checkin.symptoms||[]).some(function(slug) {
    return CHECKIN_SYMPTOMS.some(function(c) { return c.slug === slug && c.severity === 'red'; });
  });

  var alertBanner = hasRed
    ? '<div style="background:rgba(253,121,90,.07);border-left:3px solid var(--error);border-radius:.75rem;padding:.875rem;margin-bottom:1.125rem;display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--error);flex-shrink:0;">warning</span><p style="font-size:.875rem;color:var(--on-surface);line-height:1.5;">She\'s noted a symptom that may need medical attention. Check in with her today.</p></div>'
    : '';

  var partnerNoteHtml = pNote && pNote.note
    ? '<div class="partner-summary-card" style="border:1.5px solid var(--secondary-container);">' +
        '<p class="psc-label">Your note today</p>' +
        '<p style="font-size:.875rem;color:var(--on-surface);line-height:1.55;">' + pEsc(pNote.note) + '</p>' +
        '<button onclick="pNavigate(\'note\')" style="font-size:.75rem;color:var(--secondary);background:none;border:none;font-weight:700;cursor:pointer;margin-top:.375rem;">Edit note</button>' +
      '</div>'
    : '<button class="partner-note-save" onclick="pNavigate(\'note\')" style="margin-bottom:1.125rem;">' +
        '<span class="material-symbols-outlined" style="font-size:1rem;">edit_note</span> Add note for today' +
      '</button>';

  pSetContent(
    '<div>' +
    '<div class="partner-banner"><span class="material-symbols-outlined">visibility</span>Read-only view — you can\'t edit ' + pEsc(profile.momName) + '\'s data</div>' +
    alertBanner +

    '<div class="partner-summary-card">' +
      '<p class="psc-label">Today</p>' +
      '<div class="psc-day">' + day + '<span style="font-size:.875rem;font-weight:400;color:var(--on-surface-var);"> / 40</span></div>' +
      '<div class="psc-name">' + pEsc(profile.momName) + '</div>' +
      (checkin
        ? (mood ? '<div class="psc-mood">' + mood.emoji + ' Mood: ' + pEsc(mood.label) + '</div>' : '') +
          sympHtml + noteHtml + voiceHtml
        : '<p class="psc-no-data">No check-in logged yet today.</p>') +
    '</div>' +

    partnerNoteHtml +

    (checkin ? '<button class="partner-note-save" style="background:var(--surface-high);color:var(--on-surface);margin-top:0;" onclick="pShowBabyToday()"><span class="material-symbols-outlined" style="font-size:1rem;">child_care</span> See baby info for today</button>' : '') +
    '</div>'
  );
}

function pShowBabyToday() {
  // Load meal_plan.json to get baby info for today
  var profile = PDB.getProfile();
  var day     = pGetCurrentDay(profile.birthDate);
  fetch('./meal_plan.json')
    .then(function(r) { return r.json(); })
    .then(function(plan) {
      var d = plan[Math.min(day,40)-1];
      var b = (d && d.baby) ? d.baby : {};
      var signsWell  = (b.signs_feeding_well||[]).map(function(s) { return '<li>' + pEsc(s) + '</li>'; }).join('');
      var signsWatch = (b.signs_to_watch    ||[]).map(function(s) { return '<li>' + pEsc(s) + '</li>'; }).join('');
      pSetContent(
        '<div>' +
        '<button class="back-btn" onclick="pNavigate(\'today\')"><span class="material-symbols-outlined">arrow_back</span> Today</button>' +
        '<h1 style="font-family:var(--font-head);font-size:1.375rem;color:var(--on-surface);margin-bottom:1rem;">Baby on Day ' + day + '</h1>' +
        '<div class="baby-grid">' +
          '<div class="baby-info-card"><p class="bi-label">Feeding type</p><p class="bi-val">' + pEsc(b.feeding_type||'Breastfeeding') + '</p></div>' +
          '<div class="baby-info-card"><p class="bi-label">Feeds per day</p><p class="bi-val">' + pEsc(b.feeds_per_day||'8-12') + '</p></div>' +
        '</div>' +
        (b.what_to_expect ? '<div class="baby-expect"><p class="be-label">What to expect today</p><p class="be-text">' + pEsc(b.what_to_expect) + '</p></div>' : '') +
        ((signsWell||signsWatch) ? '<div class="signs-grid">' +
          (signsWell  ? '<div class="signs-box signs-well"><div class="sb-header"><span class="material-symbols-outlined">check_circle</span> Signs all is well</div><ul class="sb-list">' + signsWell + '</ul></div>' : '') +
          (signsWatch ? '<div class="signs-box signs-watch"><div class="sb-header"><span class="material-symbols-outlined">warning</span> Signs to watch</div><ul class="sb-list">' + signsWatch + '</ul></div>' : '') +
        '</div>' : '') +
        (b.latch_tip ? '<div class="latch-tip"><p class="lt-label">Latch & feeding guidance</p><p class="lt-text">' + pEsc(b.latch_tip) + '</p></div>' : '') +
        '<div style="margin-top:1rem;font-size:.75rem;color:var(--on-surface-var);line-height:1.55;background:var(--surface-low);border-radius:.75rem;padding:.875rem;">How you can help: offer water or warm soup before feeds, keep the room quiet, take the baby for a walk after feeding so she can rest.</div>' +
        '</div>'
      );
    })
    .catch(function() {
      pShowToast('Could not load baby info. Check your connection.');
    });
}

/* ─── SCREEN: HISTORY ───────────────────────────────────────── */

function pShowHistory() {
  var checkins = PDB.getAllCheckins();
  if (!checkins.length) {
    pSetContent(
      '<div>' +
      '<h1 style="font-family:var(--font-head);font-size:1.625rem;color:var(--on-surface);margin-bottom:1.125rem;">Check-in history</h1>' +
      '<div class="notes-empty"><span class="material-symbols-outlined">history</span><p>No check-ins logged yet.</p></div>' +
      '</div>'
    );
    return;
  }

  var items = checkins.slice(0,20).map(function(c) {
    var mood = MOODS.find(function(m) { return m.key === c.mood; });
    var hasRed = (c.symptoms||[]).some(function(s) {
      return CHECKIN_SYMPTOMS.some(function(cx) { return cx.slug === s && cx.severity === 'red'; });
    });
    var pn = PDB.getNote(c.date);
    return '<div class="note-item">' +
      '<div class="note-dot" style="' + (hasRed ? 'background:var(--error);' : '') + '"></div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="note-day">Day ' + c.day + ' \u00b7 ' + c.date + '</div>' +
        (mood ? '<div class="note-mood-row"><span class="note-mood-emoji">' + mood.emoji + '</span><span class="note-mood-label">' + pEsc(mood.label) + '</span></div>' : '') +
        ((c.symptoms||[]).length ? '<div style="font-size:.6875rem;color:var(--on-surface-var);margin-top:.25rem;">' + c.symptoms.length + ' symptom(s) logged</div>' : '') +
        (c.note_text ? '<div class="note-text" style="margin-top:.25rem;">' + pEsc(c.note_text.slice(0,80)) + (c.note_text.length>80?'...':'') + '</div>' : '') +
        (pn && pn.note ? '<div style="margin-top:.375rem;padding:.375rem .5rem;background:rgba(255,218,212,.2);border-radius:.5rem;font-size:.75rem;color:var(--secondary);"><strong>Your note:</strong> ' + pEsc(pn.note.slice(0,60)) + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  pSetContent(
    '<div>' +
    '<h1 style="font-family:var(--font-head);font-size:1.625rem;color:var(--on-surface);margin-bottom:.375rem;">Check-in history</h1>' +
    '<p style="font-size:.875rem;color:var(--on-surface-var);margin-bottom:1.125rem;">' + checkins.length + ' day' + (checkins.length!==1?'s':'') + ' logged</p>' +
    '<div class="note-timeline">' + items + '</div>' +
    '</div>'
  );
}

/* ─── SCREEN: ADD PARTNER NOTE ──────────────────────────────── */

function pShowNote() {
  var today   = pGetTodayISO();
  var existing = PDB.getNote(today);

  pSetContent(
    '<div>' +
    '<h1 style="font-family:var(--font-head);font-size:1.625rem;color:var(--on-surface);margin-bottom:.375rem;">My note today</h1>' +
    '<p style="font-size:.875rem;color:var(--on-surface-var);margin-bottom:1.125rem;">' + today + ' — your note is visible to you only (not shown to her).</p>' +
    '<textarea class="partner-note-textarea" id="p-note-text" placeholder="e.g. She seemed tired this evening. Made bone broth. Baby latched well twice...">' + pEsc((existing && existing.note) || '') + '</textarea>' +
    '<button class="partner-note-save" onclick="pSaveNote()">' +
      '<span class="material-symbols-outlined" style="font-size:1rem;">check_circle</span> Save note' +
    '</button>' +

    '<div class="partner-section-label" style="margin-top:1.5rem;">How to support today</div>' +
    '<div style="background:var(--surface-white);border-radius:.75rem;padding:1rem;box-shadow:0 4px 16px rgba(48,51,47,.07);">' +
      '<ul style="list-style:none;display:flex;flex-direction:column;gap:.625rem;font-size:.875rem;color:var(--on-surface);line-height:1.55;">' +
        '<li style="display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--primary);font-size:1rem;flex-shrink:0;">water_drop</span>Make sure she drinks 8–10 glasses of water today</li>' +
        '<li style="display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--primary);font-size:1rem;flex-shrink:0;">hotel</span>Encourage at least one uninterrupted sleep block (90+ min)</li>' +
        '<li style="display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--secondary);font-size:1rem;flex-shrink:0;">restaurant</span>Offer warm food — soups, dal, khichdi are ideal</li>' +
        '<li style="display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--secondary);font-size:1rem;flex-shrink:0;">child_care</span>Take the baby for a short carry so she can rest hands-free</li>' +
        '<li style="display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--tertiary);font-size:1rem;flex-shrink:0;">favorite</span>Just say "You\'re doing amazing" — it matters more than you think</li>' +
      '</ul>' +
    '</div>' +
    '</div>'
  );
}

function pSaveNote() {
  var el = document.getElementById('p-note-text');
  if (!el) return;
  var note = el.value.trim();
  if (!note) { pShowToast('Note is empty — nothing saved.'); return; }
  var ok = PDB.setNote(pGetTodayISO(), note);
  if (ok) pShowToast('Note saved!');
  else    pShowToast('Could not save note. Storage may be full.');
}

/* ─── INIT ──────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function() {
  var nav = document.querySelector('.nav-bottom');
  if (nav) nav.style.display = 'none'; // hidden until authenticated
  pShowPIN();
});
