/* ═══════════════════════════════════════════════════════════════════
   THE COGNITIVE CIRCLE — Firebase Database Layer
   ─────────────────────────────────────────────────────────────────
   SETUP (one time only):
   1. Go to console.firebase.google.com → create a project (free Spark plan)
   2. Add a web app → copy the config → paste it below
   3. In Firebase console → Firestore Database → Create database (test mode)
   4. Copy this file to: cognitivecirclejs/firebase-db.js

   ADD TO EVERY HTML PAGE that reads/writes data — paste BEFORE your
   page script tag:
     <script src="../cognitivecirclejs/firebase-db.js"></script>
   (For index.html at root: src="cognitivecirclejs/firebase-db.js")

   DUAL MODE:
   • Config filled in  → reads/writes sync to Firebase in real time.
   • Config placeholder → silently falls back to localStorage (great
     for local VS Code development — no Firebase needed).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── STEP 1: PASTE YOUR FIREBASE CONFIG HERE ─────────────────── */
  var CONFIG = {
    apiKey:            'AIzaSyD0ZbILLt3BUf1jkX8_qxOmn-0WWmB09yg',
    authDomain:        'the-cognitive-circle-adm-ea2c1.firebaseapp',
    projectId:         'the-cognitive-circle-adm-ea2c1',
    storageBucket:     'the-cognitive-circle-adm-ea2c1.firebasestorage.app',
    messagingSenderId: '763415223905',
    appId:             '1:763415223905:web:e5562f06a2e2b6e3151420',
     measurementId: "G-99T9561E1E"
  };
  /* ── end config ───────────────────────────────────────────────── */

  /* ══════════════════════════════════════════════════════════════
     INTERNAL — do not edit below unless you know what you're doing
  ══════════════════════════════════════════════════════════════ */
  var FIREBASE_READY = false;
  var db = null;

  /* readyPromise resolves to true (Firebase OK) or false (offline mode) */
  var _resolve;
  var readyPromise = new Promise(function (res) { _resolve = res; });

  /* Sequentially load Firebase compat SDK scripts */
  var SDK_URLS = [
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  ];

  function loadScript(url) {
    return new Promise(function (resolve) {
      if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = url;
      s.onload  = resolve;
      s.onerror = resolve; // resolve anyway — we fall back gracefully
      document.head.appendChild(s);
    });
  }

  async function initialize() {
    /* Skip if config is still placeholder */
    if (!CONFIG.apiKey || CONFIG.apiKey === 'YOUR_API_KEY') {
      console.info('CCDB: No Firebase config — running in localStorage-only mode.');
      _resolve(false);
      return;
    }

    /* Load SDKs if not already present */
    if (typeof firebase === 'undefined') {
      for (var i = 0; i < SDK_URLS.length; i++) {
        await loadScript(SDK_URLS[i]);
      }
    }

    if (typeof firebase === 'undefined') {
      console.warn('CCDB: Firebase SDK failed to load — falling back to localStorage.');
      _resolve(false);
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(CONFIG);
      db = firebase.firestore();
      /* Optional: enable offline persistence so exams work without internet */
      db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      FIREBASE_READY = true;
      console.info('CCDB: Firebase connected ✓');
      _resolve(true);
    } catch (e) {
      console.warn('CCDB: Firebase init error —', e.message, '— falling back to localStorage.');
      _resolve(false);
    }
  }

  /* Kick off initialisation immediately (async, non-blocking) */
  initialize();

  /* ── localStorage helpers ────────────────────────────────────── */
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }
  function lsMerge(key, item, idField) {
    var list = lsGet(key) || [];
    var idx  = list.findIndex(function (x) { return x[idField] === item[idField]; });
    if (idx > -1) list[idx] = item; else list.push(item);
    lsSet(key, list);
  }

  /* ══════════════════════════════════════════════════════════════
     window.CCDB — public API used by all page scripts
  ══════════════════════════════════════════════════════════════ */
  window.CCDB = {

    /* Resolves once Firebase is ready (or fails gracefully) */
    ready: readyPromise,

    /* Returns true if Firebase is live */
    isOnline: function () { return FIREBASE_READY; },

    /* ── EXAMS ─────────────────────────────────────────────────── */

    /**
     * Save or overwrite an exam (upsert by exam.id).
     * Always writes to localStorage; also writes to Firebase if live.
     */
    saveExam: async function (exam) {
      lsMerge('cc_exams', exam, 'id');
      await readyPromise;
      if (!FIREBASE_READY) return exam;
      try {
        await db.collection('exams').doc(String(exam.id)).set(exam);
      } catch (e) {
        console.warn('CCDB saveExam:', e.message);
      }
      return exam;
    },

    /**
     * Fetch a single exam by ID.
     * Firebase first, then localStorage fallback.
     */
    getExam: async function (id) {
      await readyPromise;
      if (FIREBASE_READY) {
        try {
          var snap = await db.collection('exams').doc(String(id)).get();
          if (snap.exists) return snap.data();
        } catch (e) {
          console.warn('CCDB getExam:', e.message);
        }
      }
      var list = lsGet('cc_exams') || [];
      return list.find(function (e) { return e.id === id; }) || null;
    },

    /**
     * Fetch all exams, newest first.
     */
    getExams: async function () {
      await readyPromise;
      if (FIREBASE_READY) {
        try {
          var snap = await db.collection('exams').orderBy('createdAt', 'desc').get();
          if (!snap.empty) return snap.docs.map(function (d) { return d.data(); });
        } catch (e) {
          console.warn('CCDB getExams:', e.message);
        }
      }
      return lsGet('cc_exams') || [];
    },

    /**
     * Fetch a published exam by ID (falls back to most-recent published).
     * Used by student login.html and instructions.html.
     */
    getPublishedExam: async function (id) {
      if (id) {
        var byId = await this.getExam(id);
        if (byId) return byId;
      }
      var all       = await this.getExams();
      var published = all.filter(function (e) { return e.status === 'published'; });
      return published.length ? published[published.length - 1] : (all[all.length - 1] || null);
    },

    /* ── RESULTS ───────────────────────────────────────────────── */

    /**
     * Save an exam result.
     * Also sets cc_last_result for the immediate results.html redirect.
     */
    saveResult: async function (result) {
      var list = lsGet('cc_results') || [];
      list.push(result);
      lsSet('cc_results', list);
      lsSet('cc_last_result', result);

      await readyPromise;
      if (!FIREBASE_READY) return;
      try {
        var docId = String(result.examId || 'exam') + '_' +
                    String((result.candidate && result.candidate.regNumber) || Date.now());
        await db.collection('results').doc(docId).set(
          Object.assign({}, result, { savedAt: new Date().toISOString() })
        );
      } catch (e) {
        console.warn('CCDB saveResult:', e.message);
      }
    },

    /**
     * Fetch all results, newest first.
     */
    getResults: async function () {
      await readyPromise;
      if (FIREBASE_READY) {
        try {
          var snap = await db.collection('results').orderBy('submitTime', 'desc').get();
          if (!snap.empty) return snap.docs.map(function (d) { return d.data(); });
        } catch (e) {
          console.warn('CCDB getResults:', e.message);
        }
      }
      return lsGet('cc_results') || [];
    },

    /* ── QUESTIONS (admin) ─────────────────────────────────────── */

    saveQuestion: async function (question) {
      await readyPromise;
      if (!FIREBASE_READY) return question;
      try {
        var docId = String(question.id || Date.now());
        await db.collection('questions').doc(docId).set(question);
      } catch (e) {
        console.warn('CCDB saveQuestion:', e.message);
      }
      return question;
    },

    getQuestions: async function () {
      await readyPromise;
      if (FIREBASE_READY) {
        try {
          var snap = await db.collection('questions').get();
          if (!snap.empty) return snap.docs.map(function (d) { return d.data(); });
        } catch (e) {
          console.warn('CCDB getQuestions:', e.message);
        }
      }
      return lsGet('qb_questions') || [];
    },

    /* ── SUBJECTS ──────────────────────────────────────────────── */

    saveSubject: async function (name) {
      await readyPromise;
      if (!FIREBASE_READY) return;
      try {
        await db.collection('subjects').doc(name).set({ name: name });
      } catch (e) {
        console.warn('CCDB saveSubject:', e.message);
      }
    },

    getSubjects: async function () {
      await readyPromise;
      if (FIREBASE_READY) {
        try {
          var snap = await db.collection('subjects').get();
          if (!snap.empty) return snap.docs.map(function (d) { return d.data().name; });
        } catch (e) {
          console.warn('CCDB getSubjects:', e.message);
        }
      }
      return lsGet('qb_subjects') || [];
    },

    /* ── TOPICS ────────────────────────────────────────────────── */

    saveTopic: async function (topic) {
      await readyPromise;
      if (!FIREBASE_READY) return;
      try {
        await db.collection('topics').doc(topic.id || topic.name).set(topic);
      } catch (e) {
        console.warn('CCDB saveTopic:', e.message);
      }
    },

    getTopics: async function () {
      await readyPromise;
      if (FIREBASE_READY) {
        try {
          var snap = await db.collection('topics').get();
          if (!snap.empty) return snap.docs.map(function (d) { return d.data(); });
        } catch (e) {
          console.warn('CCDB getTopics:', e.message);
        }
      }
      return lsGet('qb_topics') || [];
    },
  };

})();
