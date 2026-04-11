/* ============================================================
   Navya — app.js
   Plain ES6 single-page app. No frameworks, no build step.

   Sections:
     1.  CONSTANTS
     2.  STATE
     3.  localStorage helpers (DB)
     4.  ROUTER
     5.  UTILS
     6.  SCREEN — ONBOARDING
     7.  SCREEN — HOME
     8.  SCREEN — CHECK-IN
     9.  SCREEN — SYMPTOMS (list + detail)
     10. SCREEN — MEAL PLAN (home + day detail)
     11. SCREEN — NOTES LOG
     12. SCREEN — SETTINGS
     13. VoiceRecorder class
     14. NotifManager class
     15. INIT
   ============================================================ */

/* ─────────────────────────────────────────────────────────────
   1. CONSTANTS
   ──────────────────────────────────────────────────────────── */

const CHECK_IN_SYMPTOMS = [
  { slug: 'engorgement',      label: 'Breast engorgement',       note: 'Very common Days 2–5 — milk coming in',           severity: 'yellow' },
  { slug: 'cracked-nipples',  label: 'Cracked / sore nipples',   note: 'Check latch if persisting beyond Day 3',           severity: 'yellow' },
  { slug: 'cluster-feeding',  label: 'Baby cluster feeding',     note: 'Normal — baby is stimulating your supply',         severity: 'green'  },
  { slug: 'low-milk-supply-concern', label: 'Worried about milk supply', note: 'Feed frequently; supply follows demand',  severity: 'yellow' },
  { slug: 'emotional-overwhelm-breastfeeding', label: 'Tearful / emotionally overwhelmed', note: 'Baby blues peak Days 3-5, temporary', severity: 'yellow' },
  { slug: 'mastitis-symptoms', label: 'Hot, red breast with fever', note: 'Seek medical advice promptly',               severity: 'red'    },
  { slug: 'blocked-duct',     label: 'Tender lump in breast',    note: 'Warm compress + massage while feeding',           severity: 'yellow' },
  { slug: 'sleepy-baby-at-breast', label: 'Baby falling asleep while feeding', note: 'Gentle skin-to-skin, tickle feet', severity: 'yellow' },
];

const MOODS = [
  { key: 'rough',  emoji: '😔', label: 'Rough'  },
  { key: 'tired',  emoji: '😴', label: 'Tired'  },
  { key: 'okay',   emoji: '🙂', label: 'Okay'   },
  { key: 'good',   emoji: '😊', label: 'Good'   },
  { key: 'great',  emoji: '🌟', label: 'Great'  },
];

const PHASES = [
  { days: [1,7],   label: 'Phase 1 — Days 1-7',   theme: 'Rest, warmth & first healing foods',   icon: 'spa',            iconClass: 'qc-icon-green'  },
  { days: [8,14],  label: 'Phase 2 — Days 8-14',  theme: 'Milk establishment & strength',         icon: 'water_drop',     iconClass: 'qc-icon-rose'   },
  { days: [15,21], label: 'Phase 3 — Days 15-21', theme: 'Strength rebuilding',                   icon: 'fitness_center', iconClass: 'qc-icon-yellow' },
  { days: [22,35], label: 'Phase 4 — Days 22-35', theme: 'Full diet recovery',                    icon: 'restaurant',     iconClass: 'qc-icon-blue'   },
  { days: [36,40], label: 'Phase 5 — Days 36-40', theme: 'Milestone & celebration',               icon: 'celebration',    iconClass: 'qc-icon-rose'   },
];

/* ─────────────────────────────────────────────────────────────
   2. STATE
   ──────────────────────────────────────────────────────────── */

let allCards        = [];
let mealPlan        = [];
let currentDay      = 1;
let voiceRec        = null;
let notifMgr        = null;
let _currentUserId  = null;   // set on Supabase login
let _authMode       = 'login'; // 'login' | 'signup'
let _intendedHash   = null;    // deep-link hash captured before async auth runs

/* ─────────────────────────────────────────────────────────────
   3. localStorage helpers (DB)
   ──────────────────────────────────────────────────────────── */

const DB = {
  get(key, fallback) {
    if (fallback === undefined) fallback = null;
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { showToast('Could not save data. Storage may be full.'); return false; }
  },
  getProfile() {
    return {
      name:         DB.get('navya_mom_name', 'Mama'),
      deliveryType: DB.get('navya_delivery_type', 'vaginal'),
      birthDate:    DB.get('navya_birth_date', null),
      partnerPIN:   DB.get('navya_partner_pin', null),
      partnerName:  DB.get('navya_partner_name', 'Partner'),
      partnerToken: DB.get('navya_partner_token', null),
    };
  },
  getCheckin(isoDate) {
    return DB.get('navya_checkin_' + isoDate, null);
  },
  saveCheckin(isoDate, data) {
    return DB.set('navya_checkin_' + isoDate, data);
  },
  getAllCheckins() {
    var result = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('navya_checkin_')) {
        try { result.push(JSON.parse(localStorage.getItem(key))); }
        catch (e) { /* skip */ }
      }
    }
    return result.sort(function(a, b) { return b.date > a.date ? 1 : -1; });
  },
  getNotifPrefs() {
    return DB.get('navya_notif_prefs', {
      feed_enabled:    false,
      feed_minutes:    180,
      checkin_enabled: false,
      checkin_hour:    20,
      last_feed_ack:   null,
    });
  },
  getSymptomTrack(slug) {
    return DB.get('navya_symptom_track_' + slug, null);
  },
  saveSymptomTrack(slug, data) {
    return DB.set('navya_symptom_track_' + slug, data);
  },
  getAllSymptomTracks() {
    var result = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('navya_symptom_track_')) {
        try { result.push(JSON.parse(localStorage.getItem(key))); }
        catch (e) { /* skip */ }
      }
    }
    return result.sort(function(a, b) { return (a.first_seen_date > b.first_seen_date) ? -1 : 1; });
  },
};

/* ─────────────────────────────────────────────────────────────
   4. ROUTER  (hash-based)
   ──────────────────────────────────────────────────────────── */

function navigate(hash) {
  location.hash = hash;
}

function route(hash) {
  if (!hash) hash = location.hash;
  var parts = (hash.replace('#','') || 'home').split('/');
  var base  = parts[0];
  var param = parts[1];

  var nav = document.querySelector('.nav-bottom');
  if (base === 'onboarding') {
    if (nav) nav.style.display = 'none';
  } else {
    if (nav) nav.style.display = '';
    setNavActive(base);
  }

  updateTopBar();

  switch (base) {
    case 'onboarding': showOnboarding();                               break;
    case 'login':      showLogin();                                     break;
    case 'home':       showHome();                                      break;
    case 'checkin':    showCheckin();                                   break;
    case 'symptoms':   showSymptomList();                               break;
    case 'symptom':    showSymptomDetail(param);                        break;
    case 'meal-plan':  loadMealPlan(null);                              break;
    case 'meal-day':   showMealDay(parseInt(param, 10) || currentDay); break;
    case 'notes':      showNotes();                                     break;
    case 'journey':    showJourney();                                   break;
    case 'settings':   showSettings();                                  break;
    default:           showHome();
  }

  // Analytics: screen view (skip login/onboarding noise)
  if (window.PH && base !== 'login' && base !== 'onboarding') {
    PH.screen(base === 'symptom' ? 'guide_detail' : base, param ? { slug: param } : undefined);
  }
}

window.addEventListener('hashchange', function() { route(location.hash); });

function setNavActive(base) {
  document.querySelectorAll('.nb-btn').forEach(function(b) { b.classList.remove('active'); });
  var map = { home: 'nb-home', checkin: 'nb-checkin', symptoms: 'nb-symptoms', symptom: 'nb-symptoms',
              'meal-plan': 'nb-meal', 'meal-day': 'nb-meal', notes: 'nb-home',
              journey: 'nb-journey', settings: 'nb-settings' };
  var id = map[base];
  if (id) { var el = document.getElementById(id); if (el) el.classList.add('active'); }
}

/* ─────────────────────────────────────────────────────────────
   5. UTILS
   ──────────────────────────────────────────────────────────── */

function setContent(html) {
  var root = document.getElementById('app-root');
  root.innerHTML = html;
  root.scrollTop = 0;
  var first = root.firstElementChild;
  if (first) {
    first.classList.remove('screen-enter');
    void first.offsetWidth;
    first.classList.add('screen-enter');
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getTodayISO() {
  return new Date().toISOString().slice(0,10);
}

function getCurrentDay() {
  var stored = localStorage.getItem('navya_birth_date');
  if (!stored) return 1;
  try {
    var birth = new Date(JSON.parse(stored));
    var today = new Date();
    var diff  = Math.floor((today - birth) / 86400000) + 1;
    return Math.min(Math.max(diff, 1), 40);
  } catch (e) { return 1; }
}

function getPhaseForDay(day) {
  return PHASES.find(function(p) { return day >= p.days[0] && day <= p.days[1]; }) || PHASES[0];
}

function getPhaseIndex(day) {
  return Math.max(0, PHASES.findIndex(function(p) { return day >= p.days[0] && day <= p.days[1]; }));
}

function timeOfDay() {
  var h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function updateTopBar() {
  var day   = getCurrentDay();
  var badge = document.getElementById('top-bar-right');
  if (badge) {
    badge.innerHTML = '<div class="nav-top-badge"><span class="material-symbols-outlined" style="font-size:.875rem;">calendar_today</span> Day ' + day + '</div>';
  }
}

function showToast(message, durationMs) {
  if (!durationMs) durationMs = 3500;
  var toast = document.getElementById('notif-toast');
  var body  = document.getElementById('notif-toast-body');
  if (!toast || !body) return;
  body.textContent = message;
  toast.classList.add('visible');
  setTimeout(function() { toast.classList.remove('visible'); }, durationMs);
}

/* ─────────────────────────────────────────────────────────────
   6. SCREEN — ONBOARDING  (5 steps)
   ──────────────────────────────────────────────────────────── */

var obStep = 1;
var obData = {};

function showOnboarding(step) {
  if (!step) step = 1;
  obStep = step;

  var dots = [1,2,3,4,5].map(function(i) {
    var cls = i < step ? 'ob-dot done' : i === step ? 'ob-dot active' : 'ob-dot';
    return '<div class="' + cls + '"></div>';
  }).join('');

  var body = '';

  if (step === 1) {
    body = '<p class="ob-question">What\'s your name?</p>' +
      '<p class="ob-sub">We\'ll use this to personalise your daily care.</p>' +
      '<input class="ob-text-input" id="ob-name" type="text" placeholder="e.g. Priya" autocomplete="given-name" value="' + esc(obData.name||'') + '" oninput="obData.name=this.value" />' +
      '<p class="ob-footer">Question 1 of 5</p>' +
      '<button class="ob-cta" onclick="obNext()">Continue <span class="material-symbols-outlined" style="font-size:1.1rem;">arrow_forward</span></button>';
  } else if (step === 2) {
    var today = getTodayISO();
    body = '<p class="ob-question">When was your baby born?</p>' +
      '<p class="ob-sub">This calculates your Day 1-40 recovery journey.</p>' +
      '<input class="ob-date-input" id="ob-date" type="date" max="' + today + '" value="' + esc(obData.birthDate||'') + '" oninput="obData.birthDate=this.value" />' +
      '<p class="ob-footer">Question 2 of 5</p>' +
      '<button class="ob-cta" onclick="obNext()">Continue <span class="material-symbols-outlined" style="font-size:1.1rem;">arrow_forward</span></button>' +
      '<p class="ob-skip" onclick="obPrev()">Back</p>';
  } else if (step === 3) {
    var v = obData.deliveryType === 'vaginal' ? ' selected' : '';
    var c = obData.deliveryType === 'csection' ? ' selected' : '';
    body = '<p class="ob-question">What type of delivery did you have?</p>' +
      '<p class="ob-sub">This personalises your recovery guidance for Days 1-40.</p>' +
      '<div class="ob-options">' +
      '<button class="ob-option' + v + '" onclick="obPickDelivery(\'vaginal\',this)">' +
        '<div class="ob-option-icon"><span class="material-symbols-outlined">healing</span></div>' +
        '<div><div style="font-weight:700;">Normal delivery</div><div style="font-size:.75rem;color:var(--on-surface-var);margin-top:.1rem;">Vaginal birth, with or without stitches</div></div>' +
      '</button>' +
      '<button class="ob-option' + c + '" onclick="obPickDelivery(\'csection\',this)">' +
        '<div class="ob-option-icon"><span class="material-symbols-outlined">medical_services</span></div>' +
        '<div><div style="font-weight:700;">C-section</div><div style="font-size:.75rem;color:var(--on-surface-var);margin-top:.1rem;">Caesarean delivery</div></div>' +
      '</button>' +
      '</div>' +
      '<p class="ob-footer">Question 3 of 5</p>' +
      '<button class="ob-cta" onclick="obNext()">Continue <span class="material-symbols-outlined" style="font-size:1.1rem;">arrow_forward</span></button>' +
      '<p class="ob-skip" onclick="obPrev()">Back</p>';
  } else if (step === 4) {
    var pinInputs = [0,1,2,3].map(function(i) {
      var val = obData.pin && obData.pin[i] ? obData.pin[i] : '';
      return '<input class="ob-pin-digit" id="pin-' + i + '" maxlength="1" inputmode="numeric" type="password" value="' + val + '" oninput="obPinInput(this,' + i + ')" />';
    }).join('');
    body = '<p class="ob-question">Add a partner or family member</p>' +
      '<p class="ob-sub">They can view your daily log via a 4-digit PIN. You can skip this and set it in Settings later.</p>' +
      '<input class="ob-text-input" id="ob-partner-name" type="text" placeholder="Partner\'s name (e.g. Raj)" value="' + esc(obData.partnerName||'') + '" oninput="obData.partnerName=this.value" style="margin-bottom:.875rem;" />' +
      '<p style="font-size:.75rem;font-weight:700;color:var(--on-surface-var);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem;">4-digit PIN for partner access</p>' +
      '<div class="ob-pin-row">' + pinInputs + '</div>' +
      '<p style="font-size:.75rem;color:var(--on-surface-var);line-height:1.55;">This PIN is a convenience gate for a shared device — not encryption.</p>' +
      '<p class="ob-footer">Question 4 of 5</p>' +
      '<button class="ob-cta" onclick="obNext()">Continue <span class="material-symbols-outlined" style="font-size:1.1rem;">arrow_forward</span></button>' +
      '<p class="ob-skip" onclick="obNext()">Skip — set up later in Settings</p>' +
      '<p class="ob-skip" onclick="obPrev()">Back</p>';
  } else if (step === 5) {
    var yn = obData.notifs === 'yes' ? ' selected' : '';
    var nn = obData.notifs === 'no' ? ' selected' : '';
    body = '<p class="ob-question">Turn on care reminders?</p>' +
      '<p class="ob-sub">Navya can remind you for feeds and your daily check-in while the app is open in your browser.</p>' +
      '<div class="ob-options">' +
      '<button class="ob-option' + yn + '" onclick="obPickNotif(\'yes\',this)">' +
        '<div class="ob-option-icon"><span class="material-symbols-outlined">notifications_active</span></div>' +
        '<div><div style="font-weight:700;">Yes, enable reminders</div><div style="font-size:.75rem;color:var(--on-surface-var);margin-top:.1rem;">Feed every 3h + daily check-in at 8pm</div></div>' +
      '</button>' +
      '<button class="ob-option' + nn + '" onclick="obPickNotif(\'no\',this)">' +
        '<div class="ob-option-icon"><span class="material-symbols-outlined">notifications_off</span></div>' +
        '<div><div style="font-weight:700;">No, I\'ll check manually</div><div style="font-size:.75rem;color:var(--on-surface-var);margin-top:.1rem;">You can enable reminders later in Settings</div></div>' +
      '</button>' +
      '</div>' +
      '<div class="settings-notif-note" style="margin-top:.875rem;">' +
        '<span class="material-symbols-outlined">info</span>' +
        'Reminders work while this browser tab is open. They are not phone push notifications.' +
      '</div>' +
      '<p class="ob-footer">Question 5 of 5</p>' +
      '<button class="ob-cta" onclick="obFinish()"><span class="material-symbols-outlined" style="font-size:1.1rem;">check_circle</span> Start my journey</button>' +
      '<p class="ob-skip" onclick="obPrev()">Back</p>';
  }

  setContent('<div class="ob-wrap"><div class="ob-progress">' + dots + '</div>' + body + '</div>');

  requestAnimationFrame(function() {
    var el = document.querySelector('.ob-text-input, .ob-date-input');
    if (el) el.focus();
  });
}

function obNext() {
  if (obStep === 1 && !(obData.name && obData.name.trim())) {
    var el = document.getElementById('ob-name');
    if (el) el.focus();
    return;
  }
  if (obStep < 5) showOnboarding(obStep + 1);
}
function obPrev() {
  if (obStep > 1) showOnboarding(obStep - 1);
}
function obPickDelivery(type, el) {
  obData.deliveryType = type;
  el.closest('.ob-options').querySelectorAll('.ob-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
}
function obPickNotif(choice, el) {
  obData.notifs = choice;
  el.closest('.ob-options').querySelectorAll('.ob-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
}
function obPinInput(el, idx) {
  el.value = el.value.replace(/\D/g,'').slice(-1);
  if (!obData.pin) obData.pin = ['','','',''];
  obData.pin[idx] = el.value;
  if (el.value && idx < 3) { var next = document.getElementById('pin-' + (idx+1)); if (next) next.focus(); }
}

function obFinish() {
  DB.set('navya_mom_name',      (obData.name || 'Mama').trim());
  DB.set('navya_birth_date',    obData.birthDate || getTodayISO());
  DB.set('navya_delivery_type', obData.deliveryType || 'vaginal');
  if (obData.partnerName && obData.partnerName.trim()) DB.set('navya_partner_name', obData.partnerName.trim());
  if (obData.pin && obData.pin.join('').length === 4)  DB.set('navya_partner_pin', obData.pin.join(''));

  // Persist to Supabase so onboarding is not repeated on next login
  if (window.SB && SB.isReady() && _currentUserId) {
    SB.saveProfile(_currentUserId, {
      mom_name:      (obData.name || 'Mama').trim(),
      birth_date:    obData.birthDate || getTodayISO(),
      delivery_type: obData.deliveryType || 'vaginal',
      partner_name:  (obData.partnerName || 'Partner').trim(),
    });
  }

  var finishNav = function() {
    DB.set('navya_onboarded', true);
    if (window.PH) PH.capture('onboarding_completed', {
      delivery_type: obData.deliveryType || 'vaginal',
      has_partner:   !!(obData.partnerName && obData.partnerName.trim()),
      notifs_opted:  obData.notifs === 'yes',
    });
    navigate('#home');
  };

  if (obData.notifs === 'yes') {
    notifMgr.requestPermission().then(function(perm) {
      if (perm === 'granted') {
        notifMgr.scheduleFeedReminder(180);
        notifMgr.scheduleCheckinReminder(20);
        notifMgr.savePrefs({ feed_enabled: true, feed_minutes: 180, checkin_enabled: true, checkin_hour: 20 });
      }
      finishNav();
    });
  } else {
    finishNav();
  }
}

/* ─────────────────────────────────────────────────────────────
   7. SCREEN — HOME
   ──────────────────────────────────────────────────────────── */

function showHome() {
  var day     = getCurrentDay();
  currentDay  = day;
  var profile = DB.getProfile();
  var phase   = getPhaseForDay(day);
  var phIdx   = getPhaseIndex(day);
  var today   = getTodayISO();
  var checkin = DB.getCheckin(today);
  var done    = !!checkin;

  var meal = mealPlan.length >= day ? mealPlan[day-1] : null;
  var meals = (meal && meal.mom && meal.mom.meals) ? meal.mom.meals : {};

  var mealHtml = meal
    ? '<div class="dhc-meal-grid">' +
        '<div class="dhc-meal-item"><div class="dhc-meal-label">Breakfast</div><div class="dhc-meal-name">' + esc((meals.breakfast && meals.breakfast.name) || '-') + '</div></div>' +
        '<div class="dhc-meal-item"><div class="dhc-meal-label">Lunch</div><div class="dhc-meal-name">' + esc((meals.lunch && meals.lunch.name) || '-') + '</div></div>' +
        '<div class="dhc-meal-item"><div class="dhc-meal-label">Dinner</div><div class="dhc-meal-name">' + esc((meals.dinner && meals.dinner.name) || '-') + '</div></div>' +
      '</div>'
    : '';

  var ciStatus = done
    ? '<div style="display:flex;align-items:center;gap:.4rem;font-size:.75rem;font-weight:700;color:var(--primary);margin-bottom:1rem;"><span class="material-symbols-outlined" style="font-size:.875rem;">check_circle</span> Check-in done today</div>'
    : '<div style="display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--on-surface-var);margin-bottom:1rem;"><span class="material-symbols-outlined" style="font-size:.875rem;">radio_button_unchecked</span> Check-in not done yet</div>';

  var encs = [
    { h: 'Rest is healing, Mama.', p: 'Your body is doing extraordinary work. Let others carry everything else.' },
    { h: 'Milk is establishing.', p: 'Every feed builds your supply. You\'re doing more than you know.' },
    { h: 'You\'re getting stronger every day.', p: 'The hardest part is behind you. Your body is rebuilding beautifully.' },
    { h: 'Full recovery is happening.', p: 'Your body knows exactly what to do. Trust the process.' },
    { h: 'You made it to the final stretch.', p: '40 days of love, healing, and nourishment. You did this.' },
  ];
  var e = encs[Math.min(phIdx, encs.length - 1)];

  var focusTip = (meal && meal.mom && meal.mom.focus) ? meal.mom.focus.slice(0,80) : '';

  setContent(
    '<div>' +
    '<div class="greeting-time">' + esc(timeOfDay()) + '</div>' +
    '<h1 class="greeting-name">' + esc(profile.name) + ' \uD83C\uDF31</h1>' +
    '<p class="greeting-sub">' + esc(done ? 'Here\'s your day at a glance.' : 'Log today\'s check-in when you\'re ready.') + '</p>' +

    '<div class="day-hero-card">' +
      '<div class="dhc-top">' +
        '<div>' +
          '<div class="dhc-day-label">Your journey</div>' +
          '<div class="dhc-day-num">' + day + ' <span style="font-size:.75rem;font-weight:400;color:var(--on-surface-var);">of 40</span></div>' +
        '</div>' +
        '<span class="pill pill-green">Phase ' + (phIdx+1) + '</span>' +
      '</div>' +
      '<div class="dhc-phase-tag">' + esc(phase.label) + '</div>' +
      '<div class="dhc-phase-title">' + esc(phase.theme) + '</div>' +
      (focusTip ? '<div class="dhc-phase-tip">' + esc(focusTip) + '</div>' : '') +
      mealHtml +
      '<button class="cta-btn" style="height:44px;font-size:.875rem;" onclick="navigate(\'#meal-day/' + day + '\')">' +
        '<span class="material-symbols-outlined" style="font-size:1rem;">restaurant_menu</span> View today\'s meals' +
      '</button>' +
    '</div>' +

    '<div class="quick-grid">' +
      '<button class="quick-card" onclick="navigate(\'#checkin\')">' +
        '<div class="qc-icon qc-icon-green"><span class="material-symbols-outlined">health_metrics</span></div>' +
        '<div class="qc-title">Daily check-in</div>' +
        '<div class="qc-sub">' + (done ? 'Update today\'s log' : 'Log symptoms + mood') + '</div>' +
      '</button>' +
      '<button class="quick-card" onclick="navigate(\'#symptoms\')">' +
        '<div class="qc-icon qc-icon-rose"><span class="material-symbols-outlined">favorite</span></div>' +
        '<div class="qc-title">Breastfeeding</div>' +
        '<div class="qc-sub">Symptoms & guidance</div>' +
      '</button>' +
      '<button class="quick-card" onclick="navigate(\'#meal-day/' + day + '\')">' +
        '<div class="qc-icon qc-icon-yellow"><span class="material-symbols-outlined">child_care</span></div>' +
        '<div class="qc-title">Baby today</div>' +
        '<div class="qc-sub">Feeding signs & tips</div>' +
      '</button>' +
      '<button class="quick-card" onclick="navigate(\'#notes\')">' +
        '<div class="qc-icon qc-icon-blue"><span class="material-symbols-outlined">notes</span></div>' +
        '<div class="qc-title">My journal</div>' +
        '<div class="qc-sub">View past logs</div>' +
      '</button>' +
    '</div>' +

    ciStatus +

    '<div class="encouragement-card">' +
      '<h4>' + esc(e.h) + '</h4>' +
      '<p>' + esc(e.p) + '</p>' +
      '<span class="material-symbols-outlined deco">favorite</span>' +
    '</div>' +
    '</div>'
  );
}

/* ─────────────────────────────────────────────────────────────
   8. SCREEN — CHECK-IN
   ──────────────────────────────────────────────────────────── */

var _ciState = { symptoms: [], symptomTimes: {}, mood: null, note: '', voiceText: '' };
var _voiceBlob = null;

function showCheckin() {
  var day   = getCurrentDay();
  var today = getTodayISO();
  var prev  = DB.getCheckin(today);
  var vrOk  = VoiceRecorder.isSupported();

  if (prev) {
    _ciState.symptoms     = prev.symptoms      || [];
    _ciState.symptomTimes = prev.symptom_times || {};
    _ciState.mood         = prev.mood          || null;
    _ciState.note         = prev.note_text     || '';
    _ciState.voiceText    = prev.voice_transcript || '';
  } else {
    _ciState = { symptoms: [], symptomTimes: {}, mood: null, note: '', voiceText: '' };
  }

  var sympHtml = CHECK_IN_SYMPTOMS.map(function(s) {
    var chk = _ciState.symptoms.indexOf(s.slug) > -1;
    return '<div class="ci-item ' + (chk ? 'checked' : '') + '" onclick="ciToggle(this,\'' + esc(s.slug) + '\')" role="checkbox" aria-checked="' + chk + '">' +
      '<div class="ci-checkbox"><span class="material-symbols-outlined">check</span></div>' +
      '<div><div class="ci-text">' + esc(s.label) + '</div><div class="ci-normal">' + esc(s.note) + '</div></div>' +
    '</div>';
  }).join('');

  var moodHtml = MOODS.map(function(m) {
    return '<button class="mood-btn ' + (_ciState.mood === m.key ? 'selected' : '') + '" onclick="ciSetMood(\'' + m.key + '\',this)">' +
      '<span class="mood-emoji">' + m.emoji + '</span>' +
      '<span class="mood-label">' + esc(m.label) + '</span>' +
    '</button>';
  }).join('');

  var voiceHtml = vrOk
    ? '<div class="voice-row">' +
        '<button class="voice-mic-btn" id="ci-mic-btn" onclick="ciToggleVoice()" title="Record voice note" aria-label="Record voice note">' +
          '<span class="material-symbols-outlined" id="ci-mic-icon">mic</span>' +
        '</button>' +
        '<div class="voice-transcript-box" id="ci-transcript">' +
          (_ciState.voiceText ? esc(_ciState.voiceText) : '<span style="color:var(--on-surface-var);font-style:italic;">Tap mic to dictate your note...</span>') +
        '</div>' +
      '</div>' +
      '<div id="ci-voice-status" class="voice-status" style="display:none;">Recording...</div>'
    : '<p class="voice-unsupported">Voice notes require Chrome or Edge on Android/desktop. Type your note below instead.</p>';

  var hasRed = _ciState.symptoms.some(function(slug) {
    return CHECK_IN_SYMPTOMS.some(function(c) { return c.slug === slug && c.severity === 'red'; });
  });
  var reassurance = buildReassurance(day, hasRed);

  setContent(
    '<div>' +
    '<div class="ci-header">' +
      '<p class="ci-day-label">Day ' + day + ' check-in</p>' +
      '<div class="ci-day-big">' + day + '</div>' +
      '<p class="ci-question">How are you feeling today?</p>' +
    '</div>' +

    '<div class="ci-section-label">Symptoms (tick all that apply)</div>' +
    '<div class="ci-checklist">' + sympHtml + '</div>' +

    '<div class="ci-section-label" style="margin-top:1.125rem;">How\'s your mood?</div>' +
    '<div class="mood-row">' + moodHtml + '</div>' +

    '<div class="ci-section-label">Voice note</div>' +
    voiceHtml +

    '<div class="ci-section-label" style="margin-top:.75rem;">Text note</div>' +
    '<textarea class="ci-note-input" id="ci-note" placeholder="Anything you want to remember from today..." oninput="_ciState.note=this.value">' + esc(_ciState.note) + '</textarea>' +

    reassurance +

    '<button class="ci-save-btn" onclick="ciSave()">' +
      '<span class="material-symbols-outlined" style="font-size:1rem;">check_circle</span>' +
      ' Save today\'s log' +
    '</button>' +
    '</div>'
  );
}

function buildReassurance(day, hasRed) {
  if (hasRed) {
    return '<div class="reassurance-card" id="ci-reassurance" style="background:rgba(253,121,90,.07);border-left:3px solid var(--error);">' +
      '<div class="rc-icon"><span class="material-symbols-outlined" style="color:var(--error);">warning</span></div>' +
      '<h3 class="rc-title">Please seek medical advice</h3>' +
      '<p class="rc-body">You\'ve noted a symptom that needs prompt attention. Please contact your midwife, lactation consultant, or doctor today.</p>' +
    '</div>';
  }
  var dateLabel = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return '<div class="reassurance-card" id="ci-reassurance">' +
    '<div class="rc-icon"><span class="material-symbols-outlined">favorite</span></div>' +
    '<h3 class="rc-title">You\'re doing great, Mama.</h3>' +
    '<p class="rc-body">Day ' + day + ' \u00b7 ' + dateLabel + ' — you\'re showing up. That\'s everything.</p>' +
  '</div>';
}

function ciToggle(el, slug) {
  var idx = _ciState.symptoms.indexOf(slug);
  if (idx > -1) {
    _ciState.symptoms.splice(idx, 1);
    delete _ciState.symptomTimes[slug];
    el.classList.remove('checked');
    el.setAttribute('aria-checked','false');
  } else {
    _ciState.symptoms.push(slug);
    _ciState.symptomTimes[slug] = new Date().toISOString();
    el.classList.add('checked');
    el.setAttribute('aria-checked','true');
  }
  var hasRed = _ciState.symptoms.some(function(s) {
    return CHECK_IN_SYMPTOMS.some(function(c) { return c.slug === s && c.severity === 'red'; });
  });
  var rc = document.getElementById('ci-reassurance');
  if (rc) rc.outerHTML = buildReassurance(getCurrentDay(), hasRed);
}

function ciSetMood(key, btn) {
  _ciState.mood = key;
  btn.closest('.mood-row').querySelectorAll('.mood-btn').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}

function ciToggleVoice() {
  if (!voiceRec) {
    voiceRec = new VoiceRecorder({
      onTranscript: function(text) {
        var box = document.getElementById('ci-transcript');
        if (box) { box.textContent = text; box.classList.add('interim'); }
      },
      onFinal: function(text) {
        _ciState.voiceText = (_ciState.voiceText ? _ciState.voiceText + ' ' : '') + text;
        var box = document.getElementById('ci-transcript');
        if (box) { box.textContent = _ciState.voiceText; box.classList.remove('interim'); }
      },
      onAudioBlob: function(blob) { _voiceBlob = blob; },
      onError: function(msg) { showToast(msg); ciVoiceStop(); },
    });
  }

  if (voiceRec.isRecording) {
    voiceRec.stop();
    ciVoiceStop();
  } else {
    voiceRec.start().then(function() {
      var btn    = document.getElementById('ci-mic-btn');
      var icon   = document.getElementById('ci-mic-icon');
      var status = document.getElementById('ci-voice-status');
      if (btn)    btn.classList.add('recording');
      if (icon)   icon.textContent = 'stop';
      if (status) status.style.display = '';
    }).catch(function() {
      showToast('Microphone access denied. Please allow mic in browser settings.');
    });
  }
}

function ciVoiceStop() {
  var btn    = document.getElementById('ci-mic-btn');
  var icon   = document.getElementById('ci-mic-icon');
  var status = document.getElementById('ci-voice-status');
  if (btn)    btn.classList.remove('recording');
  if (icon)   icon.textContent = 'mic';
  if (status) status.style.display = 'none';
}

function ciSave() {
  // Disable button immediately to prevent double-tap
  var saveBtn = document.querySelector('.ci-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  var textarea = document.getElementById('ci-note');
  if (textarea) _ciState.note = textarea.value;

  var today = getTodayISO();
  var day   = getCurrentDay();

  var record = {
    date:             today,
    day:              day,
    symptoms:         _ciState.symptoms.slice(),
    symptom_times:    Object.assign({}, _ciState.symptomTimes),
    mood:             _ciState.mood,
    note_text:        _ciState.note,
    voice_transcript: _ciState.voiceText,
    saved_at:         new Date().toISOString(),
  };

  function doSave(rec) {
    // localStorage save — DB.set returns false and shows its own toast on failure
    var saved = DB.saveCheckin(today, rec);
    if (!saved) {
      // Storage failed — re-enable button so user can retry
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    // Supabase sync (best-effort, errors logged but not shown)
    if (window.SB && SB.isReady() && _currentUserId) {
      SB.saveCheckin(_currentUserId, rec).catch(function(e) {
        console.warn('[Navya] Supabase checkin sync failed:', e);
      });
    }

    if (window.PH) PH.capture('checkin_saved', {
      day:           day,
      mood:          _ciState.mood || null,
      symptom_count: _ciState.symptoms.length,
      has_note:      !!(rec.note_text && rec.note_text.trim()),
      has_voice:     !!(rec.voice_transcript && rec.voice_transcript.trim()),
    });

    showToast('Check-in saved! Great work today.');
    setTimeout(function() { navigate('#home'); }, 1200);
  }

  if (_voiceBlob) {
    var reader = new FileReader();
    reader.onloadend = function() {
      record.voice_b64 = reader.result;
      doSave(record);
    };
    reader.readAsDataURL(_voiceBlob);
    _voiceBlob = null;
  } else {
    _voiceBlob = null;
    doSave(record);
  }
}

/* ─────────────────────────────────────────────────────────────
   9. SCREEN — SYMPTOMS LIST + DETAIL
   ──────────────────────────────────────────────────────────── */

function showSymptomList() {
  if (!allCards.length) { loadCards(null); return; }

  // Group by category
  var catOrder = ['Breastfeeding', 'Mom recovery', 'Mental health', 'Newborn care', 'Baby health'];
  var grouped = {};
  allCards.forEach(function(card) {
    var cat = card.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(card);
  });

  var html = catOrder.concat(Object.keys(grouped).filter(function(c){return catOrder.indexOf(c)===-1;})).map(function(cat) {
    var cards = grouped[cat];
    if (!cards || !cards.length) return '';
    var cardsHtml = cards.map(function(card) {
      var pillCls = card.severity === 'red'
        ? 'pill" style="background:var(--error-container);color:var(--error);"'
        : card.severity === 'green' ? 'pill pill-green"' : 'pill pill-yellow"';
      var pillLbl = card.severity === 'red' ? 'Urgent' : card.severity === 'green' ? 'Normal' : 'Attention';
      return '<button class="symptom-card" onclick="navigate(\'#symptom/' + esc(card.slug) + '\')">' +
        '<div class="symptom-card__top">' +
          '<div>' +
            '<p class="symptom-card__title">' + esc(card.title_user||card.title||card.slug) + '</p>' +
          '</div>' +
          '<span class="' + pillCls + '">' + pillLbl + '</span>' +
        '</div>' +
        '<div class="symptom-card__action">View guide <span class="material-symbols-outlined">arrow_forward</span></div>' +
      '</button>';
    }).join('');
    return '<div style="margin-bottom:1.5rem;">' +
      '<p style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--primary);margin-bottom:.625rem;">' + esc(cat) + '</p>' +
      '<div class="symptom-list-grid">' + cardsHtml + '</div>' +
    '</div>';
  }).join('');

  setContent(
    '<div>' +
    '<div class="page-header"><h1>Symptoms<br>& guides</h1><p>Tap any concern to get guidance, dos & don\'ts, and red flags.</p></div>' +
    html +
    '<div class="encouragement-card"><h4>You\'re doing great, Mama.</h4><p>It\'s normal to have questions. Every concern deserves an answer.</p><span class="material-symbols-outlined deco">favorite</span></div>' +
    '</div>'
  );
}

function showSymptomDetail(slug) {
  if (!allCards.length) { loadCards(slug); return; }
  var card = allCards.find(function(c) { return c.slug === slug; });
  if (!card) { showSymptomList(); return; }

  // Log guide view for analytics
  if (window.SB && SB.isReady() && _currentUserId) {
    SB.logGuideView(_currentUserId, slug).catch(function(){});
  }

  // Auto-record first encounter if not already tracked
  var track = DB.getSymptomTrack(slug);
  if (!track) {
    var day = getCurrentDay();
    track = { slug: slug, title: card.title_user || card.title || slug,
               first_seen_date: getTodayISO(), first_seen_day: day,
               status: 'ongoing', resolved_date: null, resolved_day: null,
               days_to_resolve: null, note: '' };
    DB.saveSymptomTrack(slug, track);
    if (window.SB && SB.isReady() && _currentUserId) {
      SB.saveSymptomTrack(_currentUserId, track).catch(function(){});
    }
  }

  var pillCls = card.severity === 'red'
    ? 'pill" style="background:var(--error-container);color:var(--error);"'
    : card.severity === 'green' ? 'pill pill-green"' : 'pill pill-yellow"';
  var pillLbl = card.severity === 'red' ? 'Urgent' : card.severity === 'green' ? 'Normal' : 'Attention';

  var stepsHtml = (card.steps || card.immediate_relief_steps || []).map(function(s, i) {
    return '<div class="step-item">' +
      '<div class="step-num">' + (i+1) + '</div>' +
      '<div><div class="step-title">' + esc(s.title||s) + '</div>' + (s.desc||s.description ? '<div class="step-desc">' + esc(s.desc||s.description) + '</div>' : '') + '</div>' +
    '</div>';
  }).join('');

  var dosHtml   = (card.dos||[]).map(function(d) { return '<li>' + esc(d) + '</li>'; }).join('');
  var dontsHtml = (card.donts||[]).map(function(d) { return '<li>' + esc(d) + '</li>'; }).join('');
  var flagsHtml = (card.red_flags||[]).map(function(f) { return '<li>' + esc(f) + '</li>'; }).join('');

  setContent(
    '<div>' +
    '<button class="back-btn" onclick="navigate(\'#symptoms\')"><span class="material-symbols-outlined">arrow_back</span> Symptoms</button>' +
    '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.875rem;">' +
      '<span class="' + pillCls + '">' + pillLbl + '</span>' +
      (card.category ? '<span class="pill pill-grey">' + esc(card.category) + '</span>' : '') +
    '</div>' +
    '<h1 style="font-size:1.5rem;color:var(--on-surface);line-height:1.2;margin-bottom:.375rem;">' + esc(card.title_user||card.title||card.slug) + '</h1>' +
    ((card.clinical_name||card.title_clinical) ? '<p style="display:flex;align-items:center;gap:.3rem;color:var(--primary);font-weight:600;font-size:.875rem;margin-bottom:1.25rem;"><span class="material-symbols-outlined" style="font-size:1rem;">clinical_notes</span>Clinical: ' + esc(card.clinical_name||card.title_clinical) + '</p>' : '') +

    (card.what_it_is ? '<div class="detail-intro"><h3>What this likely is</h3><p>' + esc(card.what_it_is) + '</p>' + ((card.timing||card.peak_timing) ? '<p style="margin-top:.5rem;"><strong style="color:var(--primary-dim);font-weight:700;">Typical timing:</strong> ' + esc(card.timing||card.peak_timing) + '</p>' : '') + '</div>' : '') +

    (stepsHtml ? '<div class="section-divider"><h3>Immediate relief steps</h3></div>' + stepsHtml : '') +

    ((dosHtml || dontsHtml) ? '<div class="dos-donts">' +
      (dosHtml ? '<div class="dos-box"><div class="box-header"><span class="material-symbols-outlined">check_circle</span> Do\'s</div><ul class="box-list">' + dosHtml + '</ul></div>' : '') +
      (dontsHtml ? '<div class="donts-box"><div class="box-header"><span class="material-symbols-outlined">cancel</span> Don\'ts</div><ul class="box-list">' + dontsHtml + '</ul></div>' : '') +
    '</div>' : '') +

    (flagsHtml ? '<div class="red-flags"><div class="rf-header"><span class="material-symbols-outlined">warning</span> Red flags — see a doctor if...</div><ul class="rf-list">' + flagsHtml + '</ul></div>' : '') +

    ((card.when_to_expect||card.when_to_expect_improvement) ? '<div style="background:rgba(198,237,191,.15);border-radius:.75rem;padding:.875rem;margin-bottom:1.25rem;display:flex;gap:.5rem;"><span class="material-symbols-outlined" style="color:var(--primary);font-size:1.125rem;flex-shrink:0;margin-top:.1rem;">hourglass_empty</span><div><p style="font-size:.8125rem;font-weight:700;color:var(--on-surface);margin-bottom:.2rem;">When to expect improvement</p><p style="font-size:.8125rem;color:var(--on-surface-var);line-height:1.55;">' + esc(card.when_to_expect||card.when_to_expect_improvement) + '</p></div></div>' : '') +

    renderSymptomTracker(slug) +
    '</div>'
  );
}

function renderSymptomTracker(slug) {
  var track = DB.getSymptomTrack(slug);
  if (!track) return '';

  var sinceLabel = 'First logged: Day ' + track.first_seen_day + ' (' + track.first_seen_date + ')';

  if (track.status === 'resolved') {
    var daysLabel = track.days_to_resolve === 0
      ? 'Resolved same day'
      : 'Resolved in ' + track.days_to_resolve + ' day' + (track.days_to_resolve !== 1 ? 's' : '');
    return (
      '<div class="sym-tracker resolved">' +
        '<div class="sym-tracker-header">' +
          '<span class="material-symbols-outlined">check_circle</span>' +
          '<span>' + daysLabel + '</span>' +
        '</div>' +
        '<div class="sym-tracker-meta">' + esc(sinceLabel) + ' · Resolved ' + esc(track.resolved_date) + '</div>' +
        (track.note ? '<div class="sym-tracker-note">' + esc(track.note) + '</div>' : '') +
        '<button class="sym-tracker-reopen" onclick="symptomMarkOngoing(\'' + esc(slug) + '\')">Mark as ongoing again</button>' +
      '</div>'
    );
  }

  var daysOngoing = getCurrentDay() - track.first_seen_day;
  var ongoingLabel = daysOngoing <= 0 ? 'Noticed today' : 'Ongoing for ' + daysOngoing + ' day' + (daysOngoing !== 1 ? 's' : '');

  return (
    '<div class="sym-tracker ongoing">' +
      '<div class="sym-tracker-header">' +
        '<span class="material-symbols-outlined">pending</span>' +
        '<span>Track this issue</span>' +
      '</div>' +
      '<div class="sym-tracker-meta">' + esc(sinceLabel) + ' · ' + ongoingLabel + '</div>' +
      '<textarea class="sym-tracker-input" id="sym-note-' + esc(slug) + '" placeholder="Optional note (e.g. what helped…)" rows="2">' + esc(track.note || '') + '</textarea>' +
      '<div class="sym-tracker-actions">' +
        '<button class="sym-btn-resolved" onclick="symptomMarkResolved(\'' + esc(slug) + '\')">' +
          '<span class="material-symbols-outlined">check_circle</span> Resolved' +
        '</button>' +
        '<button class="sym-btn-ongoing" onclick="symptomSaveNote(\'' + esc(slug) + '\')">' +
          '<span class="material-symbols-outlined">save</span> Save note' +
        '</button>' +
      '</div>' +
    '</div>'
  );
}

function symptomMarkResolved(slug) {
  var track = DB.getSymptomTrack(slug);
  if (!track) return;
  var noteEl = document.getElementById('sym-note-' + slug);
  var today  = getTodayISO();
  var day    = getCurrentDay();
  track.status         = 'resolved';
  track.resolved_date  = today;
  track.resolved_day   = day;
  track.days_to_resolve = Math.max(0, day - track.first_seen_day);
  track.note           = noteEl ? noteEl.value.trim() : track.note;
  DB.saveSymptomTrack(slug, track);
  if (window.SB && SB.isReady() && _currentUserId) { SB.saveSymptomTrack(_currentUserId, track).catch(function(){}); }
  if (window.PH) PH.capture('symptom_resolved', { slug: slug, days_to_resolve: track.days_to_resolve });
  showSymptomDetail(slug);
  showToast('Marked as resolved in ' + track.days_to_resolve + ' day' + (track.days_to_resolve !== 1 ? 's' : '') + '.');
}

function symptomMarkOngoing(slug) {
  var track = DB.getSymptomTrack(slug);
  if (!track) return;
  track.status        = 'ongoing';
  track.resolved_date = null;
  track.resolved_day  = null;
  track.days_to_resolve = null;
  DB.saveSymptomTrack(slug, track);
  if (window.SB && SB.isReady() && _currentUserId) { SB.saveSymptomTrack(_currentUserId, track).catch(function(){}); }
  showSymptomDetail(slug);
}

function symptomSaveNote(slug) {
  var track  = DB.getSymptomTrack(slug);
  if (!track) return;
  var noteEl = document.getElementById('sym-note-' + slug);
  if (!noteEl) return;
  track.note = noteEl.value.trim();
  DB.saveSymptomTrack(slug, track);
  if (window.SB && SB.isReady() && _currentUserId) { SB.saveSymptomTrack(_currentUserId, track).catch(function(){}); }
  showToast('Note saved.');
}

function loadCards(afterSlug) {
  setContent('<div style="padding:2rem 0;text-align:center;color:var(--on-surface-var);"><span class="material-symbols-outlined" style="font-size:2.5rem;display:block;margin-bottom:.5rem;color:var(--primary-container);">spa</span>Loading symptom guide...</div>');
  fetch('./bf_symptom_cards.json')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(d) {
      allCards = d;
      if (afterSlug) showSymptomDetail(afterSlug); else showSymptomList();
    })
    .catch(function() {
      setContent('<div style="padding:2rem;text-align:center;"><p style="color:var(--error);font-weight:700;margin-bottom:.75rem;">Could not load symptom guide.</p><button class="ob-cta" onclick="loadCards(null)">Retry</button></div>');
    });
}

/* ─────────────────────────────────────────────────────────────
   10. SCREEN — MEAL PLAN
   ──────────────────────────────────────────────────────────── */

function loadMealPlan(afterDay) {
  if (mealPlan.length) { if (afterDay) showMealDay(afterDay); else showMealPlanHome(); return; }
  setContent('<div style="padding:2rem 0;text-align:center;color:var(--on-surface-var);"><span class="material-symbols-outlined" style="font-size:2.5rem;display:block;margin-bottom:.5rem;color:var(--primary-container);">restaurant_menu</span>Loading meal plan...</div>');
  fetch('./meal_plan.json')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(d) {
      mealPlan = d;
      if (afterDay) showMealDay(afterDay); else showMealPlanHome();
    })
    .catch(function() {
      setContent('<div style="padding:2rem;text-align:center;"><p style="color:var(--error);font-weight:700;margin-bottom:.75rem;">Could not load meal plan.</p><button class="ob-cta" onclick="loadMealPlan(null)">Retry</button></div>');
    });
}

function showMealPlanHome() {
  if (!mealPlan.length) { loadMealPlan(null); return; }
  var day = getCurrentDay();

  var dayPills = Array.from({length:40}, function(_, i) {
    var n = i+1;
    var cls = n < day ? 'day-pill past' : n === day ? 'day-pill today' : 'day-pill';
    return '<button class="' + cls + '" onclick="navigate(\'#meal-day/' + n + '\')">' + n + '</button>';
  }).join('');

  var todayMeal = mealPlan[day-1];
  var m = (todayMeal && todayMeal.mom && todayMeal.mom.meals) ? todayMeal.mom.meals : {};

  var phaseCards = PHASES.map(function(ph, i) {
    return '<button class="phase-card" onclick="navigate(\'#meal-day/' + ph.days[0] + '\')">' +
      '<div class="ph-icon ph-icon-' + (i+1) + '"><span class="material-symbols-outlined">' + ph.icon + '</span></div>' +
      '<div style="flex:1;min-width:0;"><div class="ph-name">' + esc(ph.label) + '</div><div class="ph-theme">' + esc(ph.theme) + '</div></div>' +
      '<div class="ph-chevron"><span class="material-symbols-outlined">chevron_right</span></div>' +
    '</button>';
  }).join('');

  setContent(
    '<div>' +
    '<div class="page-header"><h1>40-Day<br>meal plan</h1><p>Personalised for your recovery — day by day.</p></div>' +
    '<div style="margin:.875rem 0 .5rem;"><p class="strip-label">Your journey — day ' + day + ' of 40</p><div class="day-strip">' + dayPills + '</div></div>' +
    '<div class="today-summary">' +
      '<p class="ts-label">Today \u00b7 Day ' + day + '</p>' +
      '<h2 class="ts-h2">' + esc((todayMeal && todayMeal.phase) || '') + '</h2>' +
      '<p class="ts-theme">' + esc((todayMeal && todayMeal.phase_theme) || '') + '</p>' +
      '<div class="meal-preview-row">' +
        '<div class="meal-preview-item"><span class="mp-label">Breakfast</span><span class="mp-name">' + esc((m.breakfast && m.breakfast.name) || '-') + '</span></div>' +
        '<div class="meal-preview-item"><span class="mp-label">Lunch</span><span class="mp-name">' + esc((m.lunch && m.lunch.name) || '-') + '</span></div>' +
        '<div class="meal-preview-item"><span class="mp-label">Dinner</span><span class="mp-name">' + esc((m.dinner && m.dinner.name) || '-') + '</span></div>' +
      '</div>' +
      '<button class="cta-btn" style="height:44px;font-size:.875rem;" onclick="navigate(\'#meal-day/' + day + '\')"><span class="material-symbols-outlined" style="font-size:1rem;">restaurant_menu</span> View today\'s full plan</button>' +
    '</div>' +
    '<p style="font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--on-surface-var);margin-bottom:.625rem;">Browse by phase</p>' +
    phaseCards +
    '<div class="encouragement-card" style="margin-top:.5rem;"><h4>You are nourishing two lives.</h4><p>Every warm meal you eat feeds your recovery and your baby.</p><span class="material-symbols-outlined deco">restaurant</span></div>' +
    '</div>'
  );
}

var _mealTab = 'mom';

function showMealDay(dayNum) {
  if (!mealPlan.length) { loadMealPlan(dayNum); return; }
  var idx = Math.min(Math.max(dayNum, 1), 40) - 1;
  var d = mealPlan[idx];
  if (!d) { showMealPlanHome(); return; }

  var m   = d.mom  || {};
  var b   = d.baby || {};
  var meals = m.meals || {};

  var mealSectionHeader = function(label, icon) {
    return '<div style="display:flex;align-items:center;gap:.4rem;margin:.875rem 0 .5rem;">' +
      '<span class="material-symbols-outlined" style="font-size:1rem;color:var(--primary);">' + icon + '</span>' +
      '<span style="font-size:.875rem;font-weight:700;color:var(--on-surface);">' + label + '</span>' +
    '</div>';
  };

  var mealItem = function(label, icon, item) {
    if (!item) return '';
    return mealSectionHeader(label, icon) +
      '<div class="meal-item-card">' +
        '<p class="meal-item-name">' + esc(item.name) + '</p>' +
        (item.why ? '<p class="meal-item-why">' + esc(item.why) + '</p>' : '') +
        (item.recipe_tip ? '<p class="meal-item-tip">' + esc(item.recipe_tip) + '</p>' : '') +
      '</div>';
  };

  var snacks = (meals.snacks || []);
  var snacksHtml = snacks.length
    ? mealSectionHeader('Snacks', 'nutrition') +
      '<div class="meal-item-card">' +
        '<p class="meal-item-label"><span class="material-symbols-outlined" style="font-size:.875rem;vertical-align:middle;">emoji_food_beverage</span> Throughout the day</p>' +
        '<div class="snacks-list">' +
        snacks.map(function(s) { return '<div class="snack-item">' + esc(s) + '</div>'; }).join('') +
        '</div>' +
      '</div>'
    : '';

  var avoidHtml = (m.foods_to_avoid || []).length
    ? '<div class="avoid-box">' +
        '<div class="avoid-box__header"><span class="material-symbols-outlined" style="font-size:1rem;">block</span> Foods to avoid today</div>' +
        '<ul>' + m.foods_to_avoid.map(function(f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
      '</div>'
    : '';

  var momContent =
    (m.focus ? '<div style="background:var(--surface-low);border-radius:.75rem;padding:1rem;margin-bottom:1rem;"><p style="font-size:.875rem;color:var(--on-surface-var);line-height:1.65;">' + esc(m.focus) + '</p></div>' : '') +
    mealItem('Breakfast', 'breakfast_dining', meals.breakfast) +
    mealItem('Lunch',     'lunch_dining',     meals.lunch) +
    mealItem('Dinner',    'dinner_dining',    meals.dinner) +
    snacksHtml + avoidHtml +
    (m.hydration    ? '<div class="hydration-row"><span class="material-symbols-outlined">water_drop</span><p>' + esc(m.hydration) + '</p></div>' : '') +
    (m.tradition_note ? '<div class="tradition-row"><span class="material-symbols-outlined">auto_awesome</span><p>' + esc(m.tradition_note) + '</p></div>' : '');

  var signsWell  = (b.signs_feeding_well || []).map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('');
  var signsWatch = (b.signs_to_watch     || []).map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('');
  var babyContent =
    '<div class="baby-grid">' +
      '<div class="baby-info-card"><p class="bi-label">Feeding type</p><p class="bi-val">' + esc(b.feeding_type || 'Breastfeeding') + '</p></div>' +
      '<div class="baby-info-card"><p class="bi-label">Feeds per day</p><p class="bi-val">' + esc(b.feeds_per_day || '8-12') + '</p></div>' +
    '</div>' +
    (b.what_to_expect ? '<div class="baby-expect"><p class="be-label">What to expect today</p><p class="be-text">' + esc(b.what_to_expect) + '</p></div>' : '') +
    ((signsWell || signsWatch) ? '<div class="signs-grid">' +
      (signsWell  ? '<div class="signs-box signs-well"><div class="sb-header"><span class="material-symbols-outlined">check_circle</span> Signs all is well</div><ul class="sb-list">' + signsWell + '</ul></div>' : '') +
      (signsWatch ? '<div class="signs-box signs-watch"><div class="sb-header"><span class="material-symbols-outlined">warning</span> Signs to watch</div><ul class="sb-list">' + signsWatch + '</ul></div>' : '') +
    '</div>' : '') +
    (b.latch_tip ? '<div class="latch-tip"><p class="lt-label">Latch & feeding guidance</p><p class="lt-text">' + esc(b.latch_tip) + '</p></div>' : '');

  var prevBtn = dayNum > 1  ? '<button class="day-nav-prev" onclick="navigate(\'#meal-day/' + (dayNum-1) + '\')"><span class="material-symbols-outlined" style="font-size:.9375rem;">arrow_back</span> Day ' + (dayNum-1) + '</button>' : '<div></div>';
  var nextBtn = dayNum < 40 ? '<button class="day-nav-next" onclick="navigate(\'#meal-day/' + (dayNum+1) + '\')">Day ' + (dayNum+1) + ' <span class="material-symbols-outlined" style="font-size:.9375rem;">arrow_forward</span></button>' : '<div></div>';

  setContent(
    '<div>' +
    '<button class="back-btn" onclick="navigate(\'#meal-plan\')"><span class="material-symbols-outlined">arrow_back</span> Meal plan</button>' +
    '<div style="display:flex;gap:.375rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
      '<span class="pill pill-grey">Day ' + dayNum + '</span>' +
      '<span class="pill pill-grey">' + esc(d.phase||'') + '</span>' +
    '</div>' +
    '<h1 style="font-size:1.375rem;color:var(--on-surface);line-height:1.25;margin-bottom:1.125rem;">' + esc(d.phase_theme||'') + '</h1>' +

    '<div class="meal-tabs">' +
      '<button class="meal-tab ' + (_mealTab==='mom' ? 'active mom-tab' : '') + '" id="tab-mom" onclick="switchMealTab(\'mom\')"><span class="material-symbols-outlined">person</span> For Mom</button>' +
      '<button class="meal-tab ' + (_mealTab==='baby' ? 'active baby-tab' : '') + '" id="tab-baby" onclick="switchMealTab(\'baby\')"><span class="material-symbols-outlined">child_care</span> For Baby</button>' +
    '</div>' +

    '<div id="meal-mom-c" style="display:' + (_mealTab==='mom'?'block':'none') + ';">' + momContent + '</div>' +
    '<div id="meal-baby-c" style="display:' + (_mealTab==='baby'?'block':'none') + ';">' + babyContent + '</div>' +

    '<div class="day-nav">' + prevBtn + nextBtn + '</div>' +
    '</div>'
  );
}

function switchMealTab(tab) {
  _mealTab = tab;
  var momBtn  = document.getElementById('tab-mom');
  var babyBtn = document.getElementById('tab-baby');
  var momC    = document.getElementById('meal-mom-c');
  var babyC   = document.getElementById('meal-baby-c');
  if (tab === 'mom') {
    if (momBtn)  { momBtn.className = 'meal-tab active mom-tab'; }
    if (babyBtn) { babyBtn.className = 'meal-tab baby-tab'; }
    if (momC)  momC.style.display = 'block';
    if (babyC) babyC.style.display = 'none';
  } else {
    if (babyBtn) { babyBtn.className = 'meal-tab active baby-tab'; }
    if (momBtn)  { momBtn.className = 'meal-tab mom-tab'; }
    if (babyC) babyC.style.display = 'block';
    if (momC)  momC.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────────────────────
   11. SCREEN — NOTES LOG
   ──────────────────────────────────────────────────────────── */

function showNotes() {
  var checkins = DB.getAllCheckins();
  if (!checkins.length) {
    setContent(
      '<div>' +
      '<h1 style="font-family:var(--font-head);font-size:1.75rem;color:var(--on-surface);margin-bottom:1.25rem;">My journal</h1>' +
      '<div class="notes-empty">' +
        '<span class="material-symbols-outlined">notes</span>' +
        '<p>No check-ins yet.</p>' +
        '<p style="font-size:.75rem;margin-top:.25rem;">Complete your first daily check-in to see your log here.</p>' +
        '<button class="ob-cta" style="margin-top:1.25rem;" onclick="navigate(\'#checkin\')">Start today\'s check-in</button>' +
      '</div></div>'
    );
    return;
  }

  var items = checkins.map(function(c) {
    var mood = MOODS.find(function(m) { return m.key === c.mood; });
    var sympPills = (c.symptoms||[]).map(function(slug) {
      var sym = CHECK_IN_SYMPTOMS.find(function(s) { return s.slug === slug; });
      return sym ? '<span class="note-sym-pill ' + sym.severity + '">' + esc(sym.label) + '</span>' : '';
    }).join('');
    return '<div class="note-item">' +
      '<div class="note-dot"></div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="note-day">Day ' + c.day + ' \u00b7 ' + c.date + '</div>' +
        (mood ? '<div class="note-mood-row"><span class="note-mood-emoji">' + mood.emoji + '</span><span class="note-mood-label">' + esc(mood.label) + '</span></div>' : '') +
        (c.note_text ? '<div class="note-text" style="margin-top:.375rem;">' + esc(c.note_text) + '</div>' : '') +
        (c.voice_transcript ? '<div class="note-text" style="margin-top:.375rem;font-style:italic;color:var(--on-surface-var);"><span class="material-symbols-outlined" style="font-size:.875rem;vertical-align:middle;">mic</span> ' + esc(c.voice_transcript) + '</div>' : '') +
        (sympPills ? '<div class="note-symptoms">' + sympPills + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  // --- symptom resolution stats ---
  var tracks = DB.getAllSymptomTracks();
  var statsHtml = '';
  if (tracks.length) {
    var resolved  = tracks.filter(function(t) { return t.status === 'resolved'; });
    var ongoing   = tracks.filter(function(t) { return t.status === 'ongoing'; });
    var avgDays   = resolved.length
      ? Math.round(resolved.reduce(function(s, t) { return s + (t.days_to_resolve || 0); }, 0) / resolved.length)
      : null;

    var trackRows = tracks.map(function(t) {
      var isResolved = t.status === 'resolved';
      return '<div class="sym-stat-row">' +
        '<div class="sym-stat-name">' + esc(t.title) + '</div>' +
        '<div class="sym-stat-badge ' + (isResolved ? 'resolved' : 'ongoing') + '">' +
          (isResolved
            ? '<span class="material-symbols-outlined">check_circle</span> ' + t.days_to_resolve + 'd'
            : '<span class="material-symbols-outlined">pending</span> ongoing') +
        '</div>' +
      '</div>';
    }).join('');

    statsHtml =
      '<div class="sym-stats-card">' +
        '<div class="sym-stats-header"><span class="material-symbols-outlined">bar_chart</span> Symptom outcomes</div>' +
        '<div class="sym-stats-summary">' +
          '<div class="sym-stat-chip"><span>' + resolved.length + '</span>resolved</div>' +
          '<div class="sym-stat-chip ongoing"><span>' + ongoing.length + '</span>ongoing</div>' +
          (avgDays !== null ? '<div class="sym-stat-chip avg"><span>' + avgDays + 'd</span>avg to resolve</div>' : '') +
        '</div>' +
        '<div class="sym-stat-list">' + trackRows + '</div>' +
      '</div>';
  }

  setContent(
    '<div>' +
    '<h1 style="font-family:var(--font-head);font-size:1.75rem;color:var(--on-surface);margin-bottom:.375rem;">My journal</h1>' +
    '<p style="font-size:.875rem;color:var(--on-surface-var);margin-bottom:1.25rem;">' + checkins.length + ' check-in' + (checkins.length!==1?'s':'') + ' logged</p>' +
    statsHtml +
    '<div class="note-timeline">' + items + '</div>' +
    '</div>'
  );
}

/* ─────────────────────────────────────────────────────────────
   12. SCREEN — SETTINGS
   ──────────────────────────────────────────────────────────── */

function showSettings() {
  var profile = DB.getProfile();
  var prefs   = DB.getNotifPrefs();
  var caps    = NotifManager.getCapabilities();

  setContent(
    '<div>' +
    '<h1 style="font-family:var(--font-head);font-size:1.75rem;color:var(--on-surface);margin-bottom:1.25rem;">Settings</h1>' +

    '<div class="settings-section">' +
      '<div class="settings-section-label">Your profile</div>' +
      '<div class="settings-card">' +
        '<div class="settings-row"><div class="sr-icon sr-icon-green"><span class="material-symbols-outlined">person</span></div><div class="sr-body"><div class="sr-title">' + esc(profile.name) + '</div><div class="sr-sub">Day ' + getCurrentDay() + ' of 40 \u00b7 ' + esc(profile.deliveryType==='csection'?'C-section':'Normal delivery') + '</div></div></div>' +
        '<div class="settings-row"><div class="sr-icon sr-icon-grey"><span class="material-symbols-outlined">calendar_today</span></div><div class="sr-body"><div class="sr-title">Birth date</div><div class="sr-sub">' + esc(profile.birthDate||'Not set') + '</div></div></div>' +
      '</div>' +
    '</div>' +

    '<div class="settings-section">' +
      '<div class="settings-section-label">Notifications</div>' +
      '<div class="settings-card">' +
        '<div class="settings-row"><div class="sr-icon sr-icon-green"><span class="material-symbols-outlined">notifications_active</span></div><div class="sr-body"><div class="sr-title">Feed reminders</div><div class="sr-sub">Every 3 hours while app is open</div></div><div class="sr-action"><label class="toggle"><input type="checkbox" id="toggle-feed" ' + (prefs.feed_enabled?'checked':'') + ' onchange="settingsToggleFeed(this.checked)" /><span class="toggle-track"></span></label></div></div>' +
        '<div class="settings-row"><div class="sr-icon sr-icon-green"><span class="material-symbols-outlined">health_metrics</span></div><div class="sr-body"><div class="sr-title">Daily check-in reminder</div><div class="sr-sub">At 8pm each day while app is open</div></div><div class="sr-action"><label class="toggle"><input type="checkbox" id="toggle-ci" ' + (prefs.checkin_enabled?'checked':'') + ' onchange="settingsToggleCheckin(this.checked)" /><span class="toggle-track"></span></label></div></div>' +
      '</div>' +
      '<div class="settings-notif-note"><span class="material-symbols-outlined">info</span>' + esc(caps.summary) + '</div>' +
    '</div>' +

    '<div class="settings-section">' +
      '<div class="settings-section-label">Partner access</div>' +
      '<div class="settings-card">' +
        '<div class="settings-row"><div class="sr-icon sr-icon-rose"><span class="material-symbols-outlined">group</span></div><div class="sr-body"><div class="sr-title">' + esc(profile.partnerName) + '</div><div class="sr-sub">' + (profile.partnerPIN ? 'PIN set — partner can view daily log' : 'No PIN set — partner cannot access yet') + '</div></div></div>' +
        (!profile.partnerPIN ? '<div class="settings-row"><div class="sr-icon sr-icon-grey"><span class="material-symbols-outlined">lock</span></div><div class="sr-body"><div class="sr-title">Set partner PIN</div></div><div class="sr-action"><button style="font-size:.875rem;color:var(--primary);background:none;border:none;font-weight:700;cursor:pointer;" onclick="settingsSetPIN()">Set</button></div></div>' : '') +
      '</div>' +
      settingsPartnerLinkRow() +
      '<p style="font-size:.75rem;color:var(--on-surface-var);text-align:center;margin-top:.5rem;line-height:1.55;">PIN is a convenience gate on a shared device. If Supabase is configured, share the link above for secure read-only access from any device.</p>' +
    '</div>' +

    '<div class="settings-section">' +
      '<div class="settings-section-label">Account</div>' +
      '<div class="settings-card">' +
        (_currentUserId
          ? '<div class="settings-row"><div class="sr-icon sr-icon-green"><span class="material-symbols-outlined">cloud_done</span></div><div class="sr-body"><div class="sr-title">Synced with Supabase</div><div class="sr-sub">Your data is backed up.</div></div></div>' +
            '<div class="settings-row"><div class="sr-icon sr-icon-grey"><span class="material-symbols-outlined">logout</span></div><div class="sr-body"><div class="sr-title">Sign out</div></div><div class="sr-action"><button style="font-size:.875rem;color:var(--error);background:none;border:none;font-weight:700;cursor:pointer;" onclick="authLogout()">Sign out</button></div></div>'
          : '<div class="settings-row"><div class="sr-icon sr-icon-grey"><span class="material-symbols-outlined">cloud_off</span></div><div class="sr-body"><div class="sr-title">Offline / local only</div><div class="sr-sub">Data stored on this device only.</div></div><div class="sr-action"><button style="font-size:.875rem;color:var(--primary);background:none;border:none;font-weight:700;cursor:pointer;" onclick="navigate(\'#login\')">Sign in</button></div></div>'
        ) +
      '</div>' +
    '</div>' +
    '</div>'
  );
}

function settingsPartnerLinkRow() {
  var token  = DB.get('navya_partner_token', null);
  var origin = (typeof location !== 'undefined') ? location.origin + location.pathname.replace(/[^/]*$/, '') : '';
  var link   = token ? origin + 'partner.html?token=' + token : null;
  return '<div style="margin-top:.875rem;display:flex;flex-direction:column;gap:.5rem;">' +
    '<a class="settings-partner-link" href="partner.html" target="_blank" rel="noopener">' +
      '<span class="material-symbols-outlined">open_in_new</span> Open partner view (same device)' +
    '</a>' +
    (link
      ? '<button class="settings-partner-link" style="cursor:pointer;" onclick="copyPartnerLink(\'' + esc(link) + '\')">' +
          '<span class="material-symbols-outlined">share</span> Copy shareable link' +
        '</button>'
      : '') +
  '</div>';
}

function copyPartnerLink(link) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(function () { showToast('Partner link copied!'); });
  } else {
    showToast('Link: ' + link);
  }
}

function settingsToggleFeed(enabled) {
  var prefs = DB.getNotifPrefs();
  if (enabled) {
    notifMgr.requestPermission().then(function(perm) {
      if (perm !== 'granted') {
        var el = document.getElementById('toggle-feed');
        if (el) el.checked = false;
        showToast('Notification permission denied. Enable it in browser settings.');
        return;
      }
      notifMgr.scheduleFeedReminder(prefs.feed_minutes || 180);
      prefs.feed_enabled = true;
      DB.set('navya_notif_prefs', prefs);
    });
  } else {
    notifMgr.clearFeedReminder();
    prefs.feed_enabled = false;
    DB.set('navya_notif_prefs', prefs);
  }
}

function settingsToggleCheckin(enabled) {
  var prefs = DB.getNotifPrefs();
  if (enabled) {
    notifMgr.requestPermission().then(function(perm) {
      if (perm !== 'granted') {
        var el = document.getElementById('toggle-ci');
        if (el) el.checked = false;
        showToast('Notification permission denied.');
        return;
      }
      notifMgr.scheduleCheckinReminder(prefs.checkin_hour || 20);
      prefs.checkin_enabled = true;
      DB.set('navya_notif_prefs', prefs);
    });
  } else {
    notifMgr.clearCheckinReminder();
    prefs.checkin_enabled = false;
    DB.set('navya_notif_prefs', prefs);
  }
}

function settingsSetPIN() {
  // Render inline PIN modal instead of browser prompt
  var overlay = document.createElement('div');
  overlay.id  = 'pin-modal-overlay';
  overlay.innerHTML =
    '<div class="pin-modal">' +
      '<p class="pin-modal-title">Set partner PIN</p>' +
      '<p class="pin-modal-sub">Your partner will use this 4-digit PIN to view your daily log.</p>' +
      '<div class="ob-pin-row" id="pin-modal-row">' +
        [0,1,2,3].map(function(i) {
          return '<input class="ob-pin-digit" id="spm-' + i + '" maxlength="1" inputmode="numeric" type="password" oninput="spmInput(this,' + i + ')" />';
        }).join('') +
      '</div>' +
      '<p class="pin-modal-err" id="spm-err" style="display:none;color:var(--error);font-size:.8125rem;margin-bottom:.5rem;"></p>' +
      '<button class="ob-cta" style="margin-top:.75rem;" onclick="spmSave()">Save PIN</button>' +
      '<p class="ob-skip" onclick="spmClose()">Cancel</p>' +
    '</div>';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:0;';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) spmClose(); });
  requestAnimationFrame(function() { var el = document.getElementById('spm-0'); if (el) el.focus(); });
}

function spmInput(el, idx) {
  el.value = el.value.replace(/\D/g,'').slice(-1);
  if (el.value && idx < 3) { var n = document.getElementById('spm-' + (idx+1)); if (n) n.focus(); }
}

function spmSave() {
  var pin = [0,1,2,3].map(function(i) { var d = document.getElementById('spm-' + i); return d ? d.value : ''; }).join('');
  var err = document.getElementById('spm-err');
  if (!/^\d{4}$/.test(pin)) {
    if (err) { err.textContent = 'Please enter all 4 digits.'; err.style.display = ''; }
    return;
  }
  DB.set('navya_partner_pin', pin);
  spmClose();
  showToast('Partner PIN saved!');
  showSettings();
}

function spmClose() {
  var el = document.getElementById('pin-modal-overlay');
  if (el) el.remove();
}

/* ─────────────────────────────────────────────────────────────
   13. VoiceRecorder class
   Uses Web Speech Recognition for transcript + MediaRecorder for audio blob.

   Supported browsers: Chrome, Edge, Android Chrome (requires HTTPS in production).
   NOT supported: Firefox, Safari — isSupported() returns false for these.

   Limitations documented here:
   - SpeechRecognition has ~5s silence timeout; this class restarts automatically.
   - MediaRecorder uses 16kbps Opus to keep blob size small (60s ~ 120KB).
   - Hard 60-second cutoff auto-stops recording to prevent storage bloat.
   ──────────────────────────────────────────────────────────── */

function VoiceRecorder(options) {
  var self = this;
  self._onTranscript = (options && options.onTranscript) || function() {};
  self._onFinal      = (options && options.onFinal)      || function() {};
  self._onAudioBlob  = (options && options.onAudioBlob)  || function() {};
  self._onError      = (options && options.onError)      || function() {};
  self._lang         = (options && options.lang)         || 'en-IN';
  self._isRecording  = false;
  self._userStopped  = false;
  self._mediaRec     = null;
  self._chunks       = [];
  self._stopTimer    = null;
  self._recognition  = null;

  if (VoiceRecorder.isSupported()) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    self._recognition = new SR();
    self._recognition.continuous     = true;
    self._recognition.interimResults = true;
    self._recognition.lang            = self._lang;

    self._recognition.onresult = function(e) {
      var interim = '', final = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (interim) self._onTranscript(interim);
      if (final)   self._onFinal(final);
    };

    self._recognition.onerror = function(e) {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      self._onError('Voice recognition error: ' + e.error + '. Try again.');
      self._cleanup();
    };

    // Auto-restart after silence timeout (browser auto-stops SR after ~5s silence)
    self._recognition.onend = function() {
      if (self._isRecording && !self._userStopped) {
        try { self._recognition.start(); } catch(ex) { /* already starting */ }
      }
    };
  }
}

VoiceRecorder.isSupported = function() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

Object.defineProperty(VoiceRecorder.prototype, 'isRecording', {
  get: function() { return this._isRecording; }
});

VoiceRecorder.prototype.start = function() {
  var self = this;
  if (!VoiceRecorder.isSupported()) return Promise.reject(new Error('Not supported'));
  if (self._isRecording) return Promise.resolve();

  return navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    var opts = {};
    if (window.MediaRecorder) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        opts = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        opts = { mimeType: 'audio/webm', audioBitsPerSecond: 16000 };
      }
      self._mediaRec = new MediaRecorder(stream, opts);
    }
    self._chunks = [];

    if (self._mediaRec) {
      self._mediaRec.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) self._chunks.push(e.data);
      };
      self._mediaRec.onstop = function() {
        var mime = (self._mediaRec && self._mediaRec.mimeType) || 'audio/webm';
        var blob = new Blob(self._chunks, { type: mime });
        self._onAudioBlob(blob);
        stream.getTracks().forEach(function(t) { t.stop(); });
      };
      self._mediaRec.start(250);
    }

    self._userStopped = false;
    self._isRecording = true;
    try { self._recognition.start(); } catch(ex) { /* ok */ }

    // 60-second hard cutoff
    self._stopTimer = setTimeout(function() {
      if (self._isRecording) self.stop();
    }, 60000);
  });
};

VoiceRecorder.prototype.stop = function() {
  this._userStopped = true;
  this._cleanup();
};

VoiceRecorder.prototype.cancel = function() {
  this._userStopped = true;
  this._chunks = [];
  this._cleanup(true);
};

VoiceRecorder.prototype._cleanup = function(discard) {
  this._isRecording = false;
  if (this._stopTimer) { clearTimeout(this._stopTimer); this._stopTimer = null; }
  try { this._recognition.stop(); } catch(e) { /* ok */ }
  if (this._mediaRec && this._mediaRec.state !== 'inactive') {
    if (discard) this._mediaRec.ondataavailable = function() {};
    try { this._mediaRec.stop(); } catch(e) { /* ok */ }
  }
};

/* ─────────────────────────────────────────────────────────────
   14. NotifManager class
   Notification API + Service Worker showNotification.

   Honest limitations (documented, not hidden):
   - Works while browser tab is open (foreground or backgrounded).
   - Uses SW.showNotification for background-tab delivery.
   - Does NOT work when the browser is closed.
   - NOT a Web Push implementation — no push server required or used.
   - On file:// protocol, SW is unavailable; falls back to direct Notification API.
   ──────────────────────────────────────────────────────────── */

function NotifManager() {
  this._feedTimer    = null;
  this._checkinTimer = null;
}

NotifManager.getCapabilities = function() {
  var supported   = 'Notification' in window;
  var swSupported = 'serviceWorker' in navigator;
  var perm        = supported ? Notification.permission : 'unsupported';
  var summary     = !supported
    ? 'Notifications are not supported in this browser.'
    : 'Reminders work while this browser tab is open. They are not phone push notifications — closing the tab stops them.';
  return { notificationsSupported: supported, serviceWorkerSupported: swSupported, currentPermission: perm, summary: summary };
};

NotifManager.prototype.requestPermission = function() {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
};

NotifManager.prototype.notify = function(title, body, tag) {
  if (!tag) tag = 'navya';
  var swReg = window._swReg;
  if (swReg && swReg.active) {
    swReg.active.postMessage({ type: 'NOTIFY', title: title, body: body, tag: tag });
  } else if (Notification.permission === 'granted') {
    try { new Notification(title, { body: body, tag: tag }); } catch(e) { /* blocked */ }
  }
  showToast(title + ' — ' + body, 5000);
};

NotifManager.prototype.scheduleFeedReminder = function(intervalMinutes) {
  if (!intervalMinutes) intervalMinutes = 180;
  this.clearFeedReminder();
  var self = this;
  var ms   = intervalMinutes * 60 * 1000;
  var fire = function() {
    self.notify('Feed reminder', 'About ' + Math.round(intervalMinutes/60) + ' hour(s) have passed. Time for a feed?', 'feed');
    self._feedTimer = setTimeout(fire, ms);
  };
  self._feedTimer = setTimeout(fire, ms);
};

NotifManager.prototype.clearFeedReminder = function() {
  if (this._feedTimer) { clearTimeout(this._feedTimer); this._feedTimer = null; }
};

NotifManager.prototype.scheduleCheckinReminder = function(hourOfDay) {
  if (hourOfDay === undefined) hourOfDay = 20;
  this.clearCheckinReminder();
  var self = this;
  var now  = new Date();
  var next = new Date(now);
  next.setHours(hourOfDay, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  var ms   = next - now;
  var fire = function() {
    if (!DB.getCheckin(getTodayISO())) {
      self.notify('Daily check-in', 'Log how you\'re feeling today — it only takes a minute.', 'checkin');
    }
    self._checkinTimer = setTimeout(fire, 24 * 60 * 60 * 1000);
  };
  self._checkinTimer = setTimeout(fire, ms);
};

NotifManager.prototype.clearCheckinReminder = function() {
  if (this._checkinTimer) { clearTimeout(this._checkinTimer); this._checkinTimer = null; }
};

NotifManager.prototype.restoreFromPrefs = function(prefs) {
  if (!prefs) return;
  if (prefs.feed_enabled    && Notification.permission === 'granted') this.scheduleFeedReminder(prefs.feed_minutes    || 180);
  if (prefs.checkin_enabled && Notification.permission === 'granted') this.scheduleCheckinReminder(prefs.checkin_hour || 20);
};

NotifManager.prototype.savePrefs = function(overrides) {
  var existing = DB.getNotifPrefs();
  var merged   = {};
  var k;
  for (k in existing) { if (existing.hasOwnProperty(k)) merged[k] = existing[k]; }
  for (k in overrides) { if (overrides.hasOwnProperty(k)) merged[k] = overrides[k]; }
  DB.set('navya_notif_prefs', merged);
};

/* ─────────────────────────────────────────────────────────────
   15. INIT
   ──────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   16. AUTH SCREENS (Login / Signup)
   ──────────────────────────────────────────────────────────── */

function showLogin() {
  var nav = document.querySelector('.nav-bottom');
  if (nav) nav.style.display = 'none';
  var configured = window.SB && SB.isReady();

  if (!configured) {
    setContent(
      '<div class="auth-wrap">' +
      '<div class="auth-card">' +
        '<div class="auth-logo"><span class="material-symbols-outlined">spa</span></div>' +
        '<h1 class="auth-title">Navya</h1>' +
        '<p class="auth-sub">Postpartum care companion</p>' +
        '<div class="auth-offline-notice">' +
          '<p style="font-weight:700;margin-bottom:.25rem;">Offline mode</p>' +
          '<p style="font-size:.8125rem;color:var(--on-surface-var);">Supabase is not configured. Your data is saved locally on this device only.</p>' +
        '</div>' +
        '<button class="ob-cta" onclick="skipLogin()">Continue without account</button>' +
      '</div></div>'
    );
    return;
  }

  setContent(
    '<div class="auth-wrap">' +
    '<div class="auth-card">' +
      '<div class="auth-logo"><span class="material-symbols-outlined">spa</span></div>' +
      '<h1 class="auth-title">Navya</h1>' +
      '<p class="auth-sub">Postpartum care companion</p>' +
      '<div class="auth-tabs">' +
        '<button class="auth-tab ' + (_authMode==='login'?'active':'') + '" onclick="setAuthMode(\'login\')">Sign in</button>' +
        '<button class="auth-tab ' + (_authMode==='signup'?'active':'') + '" onclick="setAuthMode(\'signup\')">Create account</button>' +
      '</div>' +
      '<div class="auth-form">' +
        '<input class="auth-input" id="auth-email" type="email" placeholder="Email address" autocomplete="email" />' +
        '<input class="auth-input" id="auth-pw" type="password" placeholder="Password (min 6 chars)" autocomplete="' + (_authMode==='signup'?'new-password':'current-password') + '" />' +
        '<div id="auth-error" class="auth-error" style="display:none;"></div>' +
        '<button class="ob-cta" id="auth-submit-btn" onclick="authSubmit()">' + (_authMode==='login'?'Sign in':'Create account') + '</button>' +
      '</div>' +
      '<button class="auth-skip" onclick="skipLogin()">Continue as guest</button>' +
    '</div></div>'
  );
}

function setAuthMode(mode) {
  _authMode = mode;
  showLogin();
}

function authSubmit() {
  var emailEl = document.getElementById('auth-email');
  var pwEl    = document.getElementById('auth-pw');
  var errEl   = document.getElementById('auth-error');
  var btn     = document.getElementById('auth-submit-btn');
  if (!emailEl || !pwEl) return;

  var email = emailEl.value.trim();
  var pw    = pwEl.value;
  if (!email || !pw) {
    if (errEl) { errEl.textContent = 'Please enter your email and password.'; errEl.style.display = ''; }
    return;
  }
  if (btn) btn.disabled = true;
  if (errEl) errEl.style.display = 'none';

  var promise = _authMode === 'signup' ? SB.signUp(email, pw) : SB.signIn(email, pw);
  promise.then(function (result) {
    if (result && result.error) {
      if (errEl) { errEl.textContent = result.error.message; errEl.style.display = ''; }
      if (btn) btn.disabled = false;
      return;
    }
    var user = result && result.data && result.data.user;
    if (user) {
      if (window.PH) PH.capture(_authMode === 'signup' ? 'signed_up' : 'signed_in', { method: 'email' });
      onLoggedIn(user);
    } else if (_authMode === 'signup') {
      if (errEl) { errEl.textContent = 'Account created — check your email to confirm, then sign in.'; errEl.style.display = ''; }
      if (btn) btn.disabled = false;
    }
  }).catch(function (e) {
    if (errEl) { errEl.textContent = e.message || 'An error occurred. Please try again.'; errEl.style.display = ''; }
    if (btn) btn.disabled = false;
  });
}

function skipLogin() {
  if (window.SB && SB.isReady()) {
    var btn = document.querySelector('.auth-skip');
    if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
    SB.signInAnonymously().then(function (result) {
      var user = result && result.data && result.data.user;
      if (user) {
        if (window.PH) PH.capture('signed_in', { method: 'guest' });
        onLoggedIn(user, true);
      } else {
        // anon auth not enabled — fallback offline
        if (window.PH) PH.capture('signed_in', { method: 'offline_guest' });
        localStorage.setItem('navya_skip_login', '1');
        initApp();
      }
    }).catch(function () {
      localStorage.setItem('navya_skip_login', '1');
      initApp();
    });
  } else {
    localStorage.setItem('navya_skip_login', '1');
    initApp();
  }
}

function onLoggedIn(user, isGuest) {
  _currentUserId = user.id;
  localStorage.setItem('navya_user_id', user.id);
  setContent(
    '<div style="display:flex;align-items:center;justify-content:center;height:60vh;flex-direction:column;gap:1rem;">' +
    '<span class="material-symbols-outlined" style="font-size:2rem;color:var(--primary-container);animation:spin 1s linear infinite;">refresh</span>' +
    '<p style="font-size:.875rem;color:var(--on-surface-var);">Syncing your data\u2026</p>' +
    '</div>'
  );
  SB.syncDown(user.id).then(function () {
    SB.loadProfile(user.id).then(function (profile) {
      var localBirthDate = DB.get('navya_birth_date');
      var localOnboarded = DB.get('navya_onboarded');

      if (!profile || !profile.birth_date) {
        if (localOnboarded && localBirthDate) {
          // User completed onboarding offline / before Supabase save was wired up.
          // Push their local profile up so this never repeats.
          SB.saveProfile(user.id, {
            mom_name:      DB.get('navya_mom_name', 'Mama'),
            birth_date:    localBirthDate,
            delivery_type: DB.get('navya_delivery_type', 'vaginal'),
            partner_name:  DB.get('navya_partner_name', 'Partner'),
          }).catch(function(){});
          // Leave navya_onboarded intact — they are already onboarded
        } else {
          // Genuinely new account — clear flag so onboarding runs
          localStorage.removeItem('navya_onboarded');
        }
      }

      var profilePatch = {};
      if (user.email) profilePatch.email = user.email;
      if (isGuest)    profilePatch.is_guest = true;
      if (Object.keys(profilePatch).length) {
        SB.saveProfile(user.id, profilePatch).catch(function(){});
      }
      if (window.PH) {
        PH.identify(user.id, user.email ? { email: user.email, is_guest: !!isGuest } : { is_guest: !!isGuest });
      }
      initApp();
    }).catch(function () { initApp(); });
  });
}

function authLogout() {
  if (window.SB && SB.isReady()) SB.signOut();
  if (window.PH) PH.reset();
  _currentUserId = null;
  localStorage.removeItem('navya_user_id');
  localStorage.removeItem('navya_skip_login');
  var nav = document.querySelector('.nav-bottom');
  if (nav) nav.style.display = 'none';
  showLogin();
}

/* ─────────────────────────────────────────────────────────────
   17. JOURNEY — North star metrics, mood graph, symptom cloud
   ──────────────────────────────────────────────────────────── */

function showJourney() {
  var checkins = DB.getAllCheckins();
  var tracks   = DB.getAllSymptomTracks();

  if (!checkins.length) {
    setContent(
      '<div>' +
      '<h1 style="font-family:var(--font-head);font-size:1.75rem;color:var(--on-surface);margin-bottom:.375rem;">Your journey</h1>' +
      '<p style="font-size:.875rem;color:var(--on-surface-var);margin-bottom:2rem;">40 days of healing, one check-in at a time.</p>' +
      '<div class="notes-empty"><span class="material-symbols-outlined">insights</span>' +
        '<p>No data yet.</p><p style="font-size:.75rem;margin-top:.25rem;">Complete your first daily check-in to start tracking.</p>' +
        '<button class="ob-cta" style="margin-top:1.25rem;" onclick="navigate(\'#checkin\')">Start check-in</button>' +
      '</div></div>'
    );
    return;
  }

  setContent(
    '<div>' +
    '<h1 style="font-family:var(--font-head);font-size:1.75rem;color:var(--on-surface);margin-bottom:.25rem;">Your journey</h1>' +
    '<p style="font-size:.875rem;color:var(--on-surface-var);margin-bottom:1.5rem;">' + checkins.length + ' check-in' + (checkins.length!==1?'s':'') + ' · Day ' + getCurrentDay() + ' of 40</p>' +

    '<div class="journey-section">' + buildNorthStar(checkins, tracks) + '</div>' +

    '<div class="journey-section">' + buildMoodGraph(checkins) + '</div>' +

    '<div class="journey-section">' +
      '<h3 style="font-family:var(--font-head);font-size:1rem;color:var(--on-surface);margin-bottom:.75rem;">Symptom frequency</h3>' +
      '<div class="word-cloud">' + buildWordCloud(checkins) + '</div>' +
      '<p style="font-size:.6875rem;color:var(--on-surface-var);margin-top:.75rem;">Size = how often logged over your journey.</p>' +
    '</div>' +
    '</div>'
  );
}

var _moodScore  = { rough: 1, tired: 2, okay: 3, good: 4, great: 5 };
var _moodColor  = { rough: '#a73b21', tired: '#7d554f', okay: '#797c76', good: '#466743', great: '#274626' };

function buildNorthStar(checkins, tracks) {
  var today = new Date();

  // Streak: consecutive days ending today
  var streak = 0;
  for (var d = 0; d <= 40; d++) {
    var dt = new Date(today); dt.setDate(dt.getDate() - d);
    var iso = dt.toISOString().slice(0, 10);
    if (checkins.some(function (c) { return c.date === iso; })) {
      streak++;
    } else if (d > 0) {
      break;
    }
  }

  // Mood trend: avg last 7 days vs prev 7
  function avgMood(cks) {
    if (!cks.length) return null;
    return cks.reduce(function (s, c) { return s + (_moodScore[c.mood] || 3); }, 0) / cks.length;
  }
  var recent  = checkins.filter(function (c) { var diff = (today - new Date(c.date)) / 86400000; return diff <= 7 && c.mood; });
  var prev    = checkins.filter(function (c) { var diff = (today - new Date(c.date)) / 86400000; return diff > 7 && diff <= 14 && c.mood; });
  var rAvg    = avgMood(recent), pAvg = avgMood(prev);
  var trendIcon  = rAvg === null ? '\u2014' : pAvg === null ? '\u2192' : rAvg > pAvg + 0.3 ? '\u2191' : rAvg < pAvg - 0.3 ? '\u2193' : '\u2192';
  var trendLabel = trendIcon === '\u2191' ? 'Improving' : trendIcon === '\u2193' ? 'Declining' : 'Stable';
  var trendColor = trendIcon === '\u2191' ? '#466743' : trendIcon === '\u2193' ? '#a73b21' : '#797c76';

  // Most common symptom
  var symCounts = {};
  checkins.forEach(function (c) { (c.symptoms || []).forEach(function (s) { symCounts[s] = (symCounts[s] || 0) + 1; }); });
  var topSlug = Object.keys(symCounts).sort(function (a, b) { return symCounts[b] - symCounts[a]; })[0];
  var topSym  = topSlug ? (CHECK_IN_SYMPTOMS.find(function (s) { return s.slug === topSlug; }) || { label: topSlug }) : null;

  var resolved = tracks.filter(function (t) { return t.status === 'resolved'; }).length;

  return '<div class="metrics-grid">' +
    '<div class="metric-card">' +
      '<div class="mc-value">' + streak + '</div>' +
      '<div class="mc-label">Day streak</div>' +
      '<div class="mc-sub">' + (streak >= 3 ? 'Keep going!' : 'Check in daily') + '</div>' +
    '</div>' +
    '<div class="metric-card">' +
      '<div class="mc-value" style="color:' + trendColor + '">' + trendIcon + '</div>' +
      '<div class="mc-label">Mood trend</div>' +
      '<div class="mc-sub">' + trendLabel + ' · 7 days</div>' +
    '</div>' +
    '<div class="metric-card">' +
      '<div class="mc-value" style="font-size:1rem;line-height:1.2;">' + esc(topSym ? topSym.label : 'None yet') + '</div>' +
      '<div class="mc-label">Top symptom</div>' +
      '<div class="mc-sub">' + (topSlug ? symCounts[topSlug] + 'x logged' : 'No symptoms logged') + '</div>' +
    '</div>' +
    '<div class="metric-card">' +
      '<div class="mc-value" style="color:#466743">' + resolved + '</div>' +
      '<div class="mc-label">Resolved</div>' +
      '<div class="mc-sub">issues cleared</div>' +
    '</div>' +
  '</div>';
}

function buildMoodGraph(checkins) {
  var PL = 32, PR = 8, PT = 12, PB = 26;
  var VW = 360, VH = 158;
  var W  = VW - PL - PR;
  var H  = VH - PT - PB;

  function xPos(day) { return PL + (day - 1) / 39 * W; }
  function yPos(score) { return PT + H - (score - 1) / 4 * H; }

  var sorted = checkins.filter(function (c) { return c.mood && c.day; })
    .sort(function (a, b) { return a.day - b.day; });

  if (!sorted.length) return '<p style="font-size:.875rem;color:var(--on-surface-var);">Check in daily to see your mood journey.</p>';

  // Build polyline segments (break gap > 5 days)
  var segments = [], seg = [];
  for (var i = 0; i < sorted.length; i++) {
    var c = sorted[i];
    if (i > 0 && c.day - sorted[i - 1].day > 5) { if (seg.length) { segments.push(seg); seg = []; } }
    seg.push({ x: xPos(c.day), y: yPos(_moodScore[c.mood] || 3), mood: c.mood });
  }
  if (seg.length) segments.push(seg);

  var polylines = segments.filter(function (s) { return s.length > 1; }).map(function (s) {
    return '<polyline fill="none" stroke="#466743" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" points="' +
      s.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ') + '" />';
  }).join('');

  var circles = sorted.map(function (c) {
    return '<circle cx="' + xPos(c.day).toFixed(1) + '" cy="' + yPos(_moodScore[c.mood] || 3).toFixed(1) +
      '" r="4.5" fill="' + (_moodColor[c.mood] || '#466743') + '" stroke="white" stroke-width="1.5" />';
  }).join('');

  var xGrid = [1, 10, 20, 30, 40].map(function (d) {
    var x = xPos(d).toFixed(1);
    return '<line x1="' + x + '" y1="' + PT + '" x2="' + x + '" y2="' + (PT + H) + '" stroke="#e8e9e3" stroke-width="1" />' +
           '<text x="' + x + '" y="' + (PT + H + 16) + '" text-anchor="middle" font-size="9" fill="#797c76">' + d + '</text>';
  }).join('');

  var yLabels = [{score:1,label:'\uD83D\uDE14'},{score:3,label:'\uD83D\uDE42'},{score:5,label:'\uD83C\uDF1F'}].map(function (m) {
    var y = yPos(m.score).toFixed(1);
    return '<text x="' + (PL - 4) + '" y="' + (parseFloat(y) + 4) + '" text-anchor="end" font-size="11" fill="#797c76">' + m.label + '</text>';
  }).join('');

  var legend = Object.keys(_moodColor).map(function (k) {
    return '<span class="graph-legend-item"><span style="background:' + _moodColor[k] + '"></span>' + k.charAt(0).toUpperCase() + k.slice(1) + '</span>';
  }).join('');

  return '<h3 style="font-family:var(--font-head);font-size:1rem;color:var(--on-surface);margin-bottom:.625rem;">Mood across 40 days</h3>' +
    '<div class="graph-wrap">' +
    '<svg viewBox="0 0 ' + VW + ' ' + VH + '" width="100%" style="max-height:200px;display:block;">' +
      xGrid + yLabels + polylines + circles +
      '<text x="' + (PL + W / 2).toFixed(1) + '" y="' + (VH - 3) + '" text-anchor="middle" font-size="8" fill="#797c76">day (1–40)</text>' +
    '</svg>' +
    '<div class="graph-legend">' + legend + '</div>' +
    '</div>';
}

function buildWordCloud(checkins) {
  var counts = {};
  checkins.forEach(function (c) {
    (c.symptoms || []).forEach(function (slug) { counts[slug] = (counts[slug] || 0) + 1; });
  });
  var keys = Object.keys(counts);
  if (!keys.length) return '<p style="font-size:.875rem;color:var(--on-surface-var);">No symptoms logged yet.</p>';

  var maxCount = Math.max.apply(null, keys.map(function (k) { return counts[k]; }));
  var severityColor = { red: '#a73b21', yellow: '#78450a', green: '#274626' };

  return keys.sort(function (a, b) { return counts[b] - counts[a]; }).map(function (slug) {
    var sym   = CHECK_IN_SYMPTOMS.find(function (s) { return s.slug === slug; }) || { label: slug, severity: 'green' };
    var ratio = counts[slug] / maxCount;
    var size  = (0.8 + ratio * 1.4).toFixed(2);
    var color = severityColor[sym.severity] || '#466743';
    var op    = (0.55 + ratio * 0.45).toFixed(2);
    return '<span class="cloud-word" style="font-size:' + size + 'rem;color:' + color + ';opacity:' + op + ';" title="' + esc(sym.label) + ' (' + counts[slug] + 'x)">' + esc(sym.label) + '</span>';
  }).join('');
}

/* ─────────────────────────────────────────────────────────────
   15. INIT
   ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  notifMgr = new NotifManager();

  // Capture intended deep-link hash before auth redirects can clobber it
  var h = location.hash;
  if (h && h !== '#' && h !== '#home' && !/^#access_token|^#type=|^#error/.test(h)) {
    _intendedHash = h;
  }

  // Preload JSON data in background immediately
  if (!allCards.length) {
    fetch('./bf_symptom_cards.json').then(function(r){return r.json();}).then(function(d){allCards=d;}).catch(function(){});
  }
  if (!mealPlan.length) {
    fetch('./meal_plan.json').then(function(r){return r.json();}).then(function(d){mealPlan=d;}).catch(function(){});
  }

  // Auth check
  if (window.SB && SB.isReady()) {
    SB.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      if (session && session.user) {
        _currentUserId = session.user.id;
        localStorage.setItem('navya_user_id', session.user.id);
        initApp();
      } else {
        showLogin();  // SB configured — always require login
      }
    }).catch(function () { showLogin(); });

    SB.onAuthChange(function (event, session) {
      if (event === 'SIGNED_IN' && session && session.user) {
        _currentUserId = session.user.id;
      } else if (event === 'SIGNED_OUT') {
        _currentUserId = null;
      }
    });
  } else {
    // SB not configured — offline mode
    initApp();
  }
});

function initApp() {
  var nav = document.querySelector('.nav-bottom');
  if (!DB.get('navya_onboarded')) {
    if (nav) nav.style.display = 'none';
    obData = {};
    obStep = 1;
    showOnboarding(1);
    return;
  }
  if (nav) nav.style.display = '';
  currentDay = getCurrentDay();
  notifMgr.restoreFromPrefs(DB.getNotifPrefs());
  var target = _intendedHash || location.hash || '#home';
  _intendedHash = null;
  route(target);
}
