/* =============================================
   COGNITIVE CIRCLE – Student Login Logic
   Reads published exam from Firebase (CCDB)
   Falls back to cc_exams localStorage
   Saves candidate info to cc_candidate
   Flow: login.html → instructions.html → exam.html
   ============================================= */

'use strict';

let currentExam = null;
let currentExamPayload = null;

document.addEventListener('DOMContentLoaded', () => {
  loadExam();
  document.getElementById('loginForm').addEventListener('submit', handleSubmit);
});

async function loadExam() {
  const params = new URLSearchParams(window.location.search);
  const examId = params.get('exam');
  const payloadParam = params.get('payload');

  /* Show a subtle loading indicator on the button */
  const btn   = document.getElementById('btnStart');
  const label = document.getElementById('btnLabel');
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Loading exam…';

  /* ── Direct payload share first ── */
  if (payloadParam) {
    currentExam = parseExamPayload(payloadParam);
    if (currentExam) {
      currentExamPayload = payloadParam;
    }
  }

  /* ── Try Firebase first, then localStorage ── */
  if (!currentExam) {
    try {
      const raw  = localStorage.getItem('cc_exams') || '[]';
      const list = JSON.parse(raw) || [];
      if (examId) {
        currentExam = list.find(e => e.id === examId) || null;
      }
      if (!currentExam) {
        const published = list.filter(e => e.status === 'published');
        currentExam = published.length
          ? published[published.length - 1]
          : list[list.length - 1] || null;
      }
    } catch (_) {
      currentExam = null;
    }
  }

  /* ── Fallback: shared static JSON file on the site ── */
  if (!currentExam) {
    currentExam = await loadSharedExam(examId);
  }

  renderExamBanner();
}

async function loadSharedExam(examId) {
  try {
    const response = await fetch('../exams.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const list = await response.json();
    if (!Array.isArray(list)) return null;

    if (examId) {
      const found = list.find(e => e.id === examId);
      if (found) return found;
    }

    const published = list.filter(e => e.status === 'published');
    return published.length ? published[published.length - 1] : (list[list.length - 1] || null);
  } catch (_) {
    return null;
  }
}

function renderExamBanner() {
  const bannerEl = document.getElementById('examBanner');
  const noExamEl = document.getElementById('noExamBanner');
  const titleEl  = document.getElementById('bannerTitle');
  const metaEl   = document.getElementById('bannerMeta');
  const btn      = document.getElementById('btnStart');
  const label    = document.getElementById('btnLabel');

  if (!currentExam) {
    if (noExamEl) noExamEl.style.display = 'flex';
    if (bannerEl) bannerEl.style.display = 'none';
    if (btn)   btn.disabled = true;
    if (label) label.textContent = 'No Exam Available';
    return;
  }

  const subject  = currentExam.subject   || '—';
  const count    = currentExam.numQuestions || (currentExam.questions || []).length || 0;
  const duration = currentExam.duration  || 0;
  const unit     = currentExam.durationUnit || 'mins';

  if (titleEl) titleEl.textContent = currentExam.title || 'Untitled Exam';
  if (metaEl)  metaEl.textContent  = `${subject} · ${count} Questions · ${duration} ${unit}`;

  if (bannerEl) bannerEl.style.display = 'flex';
  if (noExamEl) noExamEl.style.display = 'none';
  if (btn)   btn.disabled = false;
  if (label) label.textContent = 'Enter Exam';
}

/* ─── Form submission ───────────────────────── */
function handleSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('candidateName');
  const regInput  = document.getElementById('regNumber');
  const nameError = document.getElementById('nameError');
  const regError  = document.getElementById('regError');

  nameInput.classList.remove('error');
  regInput.classList.remove('error');
  nameError.textContent = '';
  regError.textContent  = '';

  const name = nameInput.value.trim();
  const reg  = regInput.value.trim();
  let valid  = true;

  if (!name || name.length < 2) {
    nameInput.classList.add('error');
    nameError.textContent = name ? 'Name must be at least 2 characters.' : 'Please enter your full name.';
    valid = false;
  }
  if (!reg) {
    regInput.classList.add('error');
    regError.textContent = 'Please enter your registration number.';
    valid = false;
  }
  if (!valid) return;

  const candidate = {
    name,
    regNumber: reg,
    loginTime: new Date().toISOString(),
    examId:    currentExam ? currentExam.id : null,
    examPayload: currentExamPayload,
  };

  try { localStorage.setItem('cc_candidate', JSON.stringify(candidate)); } catch (_) {}

  const btn   = document.getElementById('btnStart');
  const label = document.getElementById('btnLabel');
  btn.disabled      = true;
  label.textContent = 'Loading…';

  setTimeout(() => {
    const nextParam = currentExamPayload
      ? `?payload=${encodeURIComponent(currentExamPayload)}`
      : (currentExam ? `?exam=${currentExam.id}` : '');
    window.location.href = `instructions.html${nextParam}`;
  }, 500);
}

function parseExamPayload(payload) {
  try {
    // Try LZ-String compressed payload first (shorter links)
    if (typeof LZString === 'object' && LZString.decompressFromEncodedURIComponent) {
      try {
        const dec = LZString.decompressFromEncodedURIComponent(payload);
        if (dec) return JSON.parse(dec);
      } catch (_) {}
    }
    // Fallback to legacy base64 URL-safe encoding
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

/* ─── Toast ──────────────────────────────────── */
let _toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
