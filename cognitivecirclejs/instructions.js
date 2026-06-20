/* =============================================
   COGNITIVE CIRCLE – Exam Instructions Logic
   Reads: cc_candidate (localStorage)
   Reads exam from Firebase (CCDB) or cc_exams localStorage
   Writes: cc_session (active exam session)
   Flow: login.html → instructions.html → exam.html
   ============================================= */

'use strict';

let currentExam      = null;
let currentCandidate = null;
let currentExamPayload = null;

document.addEventListener('DOMContentLoaded', () => {
  loadCandidate();
  loadExam();   // async — updates UI when exam arrives
});

/* ─── Load candidate info ───────────────────── */
function loadCandidate() {
  try {
    const raw = localStorage.getItem('cc_candidate');
    if (!raw) { window.location.href = 'login.html'; return; }
    currentCandidate = JSON.parse(raw);
  } catch (_) {
    window.location.href = 'login.html'; return;
  }

  const name = currentCandidate.name      || 'Unknown';
  const reg  = currentCandidate.regNumber || '—';

  setTxt('candidateName',   name);
  setTxt('candidateReg',    reg);
  setTxt('candidateAvatar', name.charAt(0).toUpperCase());
}

/* ─── Load exam details ─────────────────────── */
async function loadExam() {
  const params = new URLSearchParams(window.location.search);
  const payloadParam = params.get('payload') || (currentCandidate && currentCandidate.examPayload);
  const examId = params.get('exam') || (currentCandidate && currentCandidate.examId);

  /* Show loading placeholder */
  const startBtn = document.getElementById('btnStartExam');
  if (startBtn) startBtn.disabled = true;

  /* ── Direct payload share first ── */
  if (payloadParam) {
    currentExam = parseExamPayload(payloadParam);
    if (currentExam) {
      currentExamPayload = payloadParam;
    }
  }

  /* ── Firebase first ── */
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
    } catch (_) { currentExam = null; }
  }

  /* ── Fallback: shared static JSON file on the site ── */
  if (!currentExam) {
    currentExam = await loadSharedExam(examId);
  }

  if (!currentExam) {
    const overlay = document.getElementById('noExamOverlay');
    if (overlay) overlay.style.display = 'flex';
    return;
  }

  renderExamDetails();
}

/* ─── Render exam details ───────────────────── */
function renderExamDetails() {
  const e = currentExam;

  const title    = e.title        || 'Untitled Exam';
  const subject  = e.subject      || '—';
  const count    = e.numQuestions || (e.questions || []).length || 0;
  const duration = e.duration     || 0;
  const unit     = e.durationUnit || 'mins';
  const marks    = e.totalMarks   || (e.questions || []).reduce((s, q) => s + (q.marks || 1), 0) || 0;
  const type     = formatType(e.type);

  setTxt('examTitle',     title);
  setTxt('examTypePill',  type);
  setTxt('detSubject',    subject);
  setTxt('detQuestions',  count);
  setTxt('detDuration',   `${duration} ${unit}`);
  setTxt('detMarks',      marks);

  document.title = `${title} – The Cognitive Circle`;
}

function formatType(type) {
  const map = { practice: 'Practice Test', mock: 'Mock Exam', quiz: 'Quiz', assignment: 'Assignment' };
  return map[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Exam');
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

/* ─── Agreement checkbox ────────────────────── */
function onAgreeChange() {
  const checked = document.getElementById('agreeCheck').checked;
  const btn     = document.getElementById('btnStartExam');
  const note    = document.getElementById('agreeNote');
  const label   = document.querySelector('.checkbox-label');

  btn.disabled = !checked;
  if (label) label.classList.toggle('checked', checked);
  if (note)  note.classList.toggle('hidden', checked);
}

/* ─── Start Exam ────────────────────────────── */
function startExam() {
  if (!currentExam)      { showToast('No exam available', 'error'); return; }
  if (!currentCandidate) { window.location.href = 'login.html'; return; }

  const session = {
    examId:        currentExam.id,
    exam:          currentExam,
    candidate:     currentCandidate,
    startTime:     new Date().toISOString(),
    timeRemaining: (currentExam.duration || 60) * 60,
    answers:       {},
    submitted:     false,
  };

  try { localStorage.setItem('cc_session', JSON.stringify(session)); } catch (_) {}

  const btn   = document.getElementById('btnStartExam');
  const label = document.getElementById('startBtnLabel');
  btn.disabled      = true;
  if (label) label.textContent = 'Starting…';

  setTimeout(() => {
    let nextUrl = 'exam.html';
    if (currentExamPayload) {
      nextUrl += `?payload=${encodeURIComponent(currentExamPayload)}`;
    } else if (currentExam) {
      nextUrl += `?exam=${currentExam.id}`;
    }
    window.location.href = nextUrl;
  }, 500);
}

function parseExamPayload(payload) {
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

/* ─── Utility ───────────────────────────────── */
function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

let _toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
