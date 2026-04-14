/* ============================================================
   supabase-client.js
   Wraps @supabase/supabase-js v2 CDN build.
   Exports window.SB — all methods no-op gracefully when
   Supabase is not configured (offline/localStorage mode).
   ============================================================ */

(function () {
  'use strict';

  var cfg  = (window.NAVYA_CONFIG || {});
  var url  = cfg.supabaseUrl || '';
  var key  = cfg.supabaseKey || '';
  var ok   = !!(window.supabase && url && key);
  var _cli = ok ? window.supabase.createClient(url, key) : null;

  function noop() { return Promise.resolve(null); }

  var SB = {

    isReady: function () { return ok; },

    /* ── AUTH ───────────────────────────────────────────────── */
    signUp: function (email, pw) {
      if (!ok) return noop();
      return _cli.auth.signUp({ email: email, password: pw });
    },
    signIn: function (email, pw) {
      if (!ok) return noop();
      return _cli.auth.signInWithPassword({ email: email, password: pw });
    },
    signInAnonymously: function () {
      if (!ok) return noop();
      return _cli.auth.signInAnonymously();
    },
    resendConfirmation: function (email) {
      if (!ok) return noop();
      return _cli.auth.resend({ type: 'signup', email: email });
    },
    signOut: function () {
      if (!ok) return noop();
      return _cli.auth.signOut();
    },
    getSession: function () {
      if (!ok) return noop();
      return _cli.auth.getSession();
    },
    onAuthChange: function (cb) {
      if (!ok) return { data: { subscription: { unsubscribe: function () {} } } };
      return _cli.auth.onAuthStateChange(cb);
    },

    /* ── PROFILE ────────────────────────────────────────────── */
    saveProfile: function (uid, data) {
      if (!ok || !uid) return noop();
      return Promise.resolve(_cli.from('profiles').upsert(Object.assign({ id: uid }, data)));
    },
    loadProfile: function (uid) {
      if (!ok || !uid) return Promise.resolve(null);
      return _cli.from('profiles').select('*').eq('id', uid).maybeSingle()
        .then(function (r) { return r.data || null; });
    },
    getPartnerToken: function (uid) {
      if (!ok || !uid) return Promise.resolve(null);
      return _cli.from('profiles').select('partner_token').eq('id', uid).maybeSingle()
        .then(function (r) { return r.data ? r.data.partner_token : null; });
    },

    /* ── CHECKINS ───────────────────────────────────────────── */
    saveCheckin: function (uid, data) {
      if (!ok || !uid) return noop();
      var row = {
        user_id:          uid,
        date:             data.date,
        day_number:       data.day,
        mood:             data.mood,
        symptoms:         data.symptoms || [],
        symptom_times:    data.symptom_times || {},
        note_text:        data.note_text || null,
        voice_transcript: data.voice_transcript || null,
      };
      return Promise.resolve(_cli.from('checkins').upsert(row, { onConflict: 'user_id,date' }));
    },
    loadCheckins: function (uid) {
      if (!ok || !uid) return Promise.resolve([]);
      return _cli.from('checkins').select('*').eq('user_id', uid)
        .order('date', { ascending: false })
        .then(function (r) { return r.data || []; });
    },

    /* ── SYMPTOM TRACKS ─────────────────────────────────────── */
    saveSymptomTrack: function (uid, data) {
      if (!ok || !uid) return noop();
      return Promise.resolve(_cli.from('symptom_tracks').upsert(
        Object.assign({ user_id: uid }, data),
        { onConflict: 'user_id,slug' }
      ));
    },
    loadSymptomTracks: function (uid) {
      if (!ok || !uid) return Promise.resolve([]);
      return _cli.from('symptom_tracks').select('*').eq('user_id', uid)
        .then(function (r) { return r.data || []; });
    },

    /* ── FEEDBACK ───────────────────────────────────────────── */
    submitFeedback: function (uid, momName, type, message) {
      if (!ok) return noop();
      return Promise.resolve(_cli.from('feedback').insert({
        user_id:  uid     || null,
        mom_name: momName || null,
        type:     type    || 'other',
        message:  message,
      }));
    },

    /* ── GUIDE VIEWS (analytics) ────────────────────────────── */
    logGuideView: function (uid, slug) {
      if (!ok || !uid) return noop();
      return Promise.resolve(_cli.from('guide_views').insert({ user_id: uid, slug: slug }));
    },

    /* ── PARTNER (read-only via share token) ────────────────── */
    getProfileByToken: function (token) {
      if (!ok || !token) return Promise.resolve(null);
      return _cli.from('profiles')
        .select('id,mom_name,birth_date,delivery_type,partner_name')
        .eq('partner_token', token).maybeSingle()
        .then(function (r) { return r.data || null; });
    },
    getCheckinsByUserId: function (uid) {
      if (!ok || !uid) return Promise.resolve([]);
      return _cli.from('checkins').select('*').eq('user_id', uid)
        .order('date', { ascending: true })
        .then(function (r) { return r.data || []; });
    },
    getSymptomTracksByUserId: function (uid) {
      if (!ok || !uid) return Promise.resolve([]);
      return _cli.from('symptom_tracks').select('*').eq('user_id', uid)
        .then(function (r) { return r.data || []; });
    },

    /* ── SYNC DOWN (Supabase → localStorage) ────────────────── */
    syncDown: function (uid) {
      if (!ok || !uid) return Promise.resolve();
      return Promise.all([
        SB.loadProfile(uid),
        SB.loadCheckins(uid),
        SB.loadSymptomTracks(uid),
      ]).then(function (res) {
        var profile  = res[0];
        var checkins = res[1];
        var tracks   = res[2];

        if (profile) {
          if (profile.mom_name)      localStorage.setItem('navya_mom_name',      JSON.stringify(profile.mom_name));
          if (profile.delivery_type) localStorage.setItem('navya_delivery_type', JSON.stringify(profile.delivery_type));
          if (profile.birth_date)    localStorage.setItem('navya_birth_date',    JSON.stringify(profile.birth_date));
          if (profile.partner_name)  localStorage.setItem('navya_partner_name',  JSON.stringify(profile.partner_name));
          if (profile.partner_token) localStorage.setItem('navya_partner_token', JSON.stringify(profile.partner_token));
        }

        checkins.forEach(function (c) {
          try {
            var rec = {
              date:             c.date,
              day:              c.day_number,
              symptoms:         c.symptoms   || [],
              symptom_times:    c.symptom_times || {},
              mood:             c.mood,
              note_text:        c.note_text,
              voice_transcript: c.voice_transcript,
              saved_at:         c.saved_at,
            };
            localStorage.setItem('navya_checkin_' + c.date, JSON.stringify(rec));
          } catch (e) { /* storage full — skip */ }
        });

        tracks.forEach(function (t) {
          try {
            localStorage.setItem('navya_symptom_track_' + t.slug, JSON.stringify({
              slug:            t.slug,
              title:           t.title,
              first_seen_date: t.first_seen_date,
              first_seen_day:  t.first_seen_day,
              status:          t.status,
              resolved_date:   t.resolved_date,
              resolved_day:    t.resolved_day,
              days_to_resolve: t.days_to_resolve,
              note:            t.note,
            }));
          } catch (e) { /* skip */ }
        });
      }).catch(function (e) {
        console.warn('[Navya] SB.syncDown error:', e);
      });
    },

    /* ── SYNC UP (localStorage → Supabase, offline recovery) ── */
    syncUp: function (uid) {
      if (!ok || !uid) return Promise.resolve();
      var promises = [];

      promises.push(SB.saveProfile(uid, {
        mom_name:      JSON.parse(localStorage.getItem('navya_mom_name')      || '"Mama"'),
        delivery_type: JSON.parse(localStorage.getItem('navya_delivery_type') || '"vaginal"'),
        birth_date:    JSON.parse(localStorage.getItem('navya_birth_date')    || 'null'),
        partner_name:  JSON.parse(localStorage.getItem('navya_partner_name')  || '"Partner"'),
      }));

      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('navya_checkin_')) {
          try {
            var c = JSON.parse(localStorage.getItem(k));
            if (c && c.date) promises.push(SB.saveCheckin(uid, c));
          } catch (e) { /* skip */ }
        }
        if (k.startsWith('navya_symptom_track_')) {
          try {
            var t = JSON.parse(localStorage.getItem(k));
            if (t && t.slug) promises.push(SB.saveSymptomTrack(uid, t));
          } catch (e) { /* skip */ }
        }
      }

      return Promise.all(promises).catch(function (e) {
        console.warn('[Navya] SB.syncUp error:', e);
      });
    },
  };

  window.SB = SB;
})();
