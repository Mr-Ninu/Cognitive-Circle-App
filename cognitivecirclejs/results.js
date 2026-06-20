/* =============================================
   COGNITIVE CIRCLE – Results Page Logic
   Reads: cc_results (localStorage)
   ============================================= */

'use strict';

// ─── Grading System ─────────────────────────────
const GRADES = [
  { min: 75, grade: 'A',  label: 'Distinction',  icon: '🏆', color: '#10b981' },
  { min: 65, grade: 'B',  label: 'Credit',        icon: '🎖️', color: '#3b82f6' },
  { min: 50, grade: 'C',  label: 'Merit',         icon: '👍', color: '#8b5cf6' },
  { min: 40, grade: 'D',  label: 'Pass',          icon: '✅', color: '#f59e0b' },
  { min: 0,  grade: 'F',  label: 'Fail',          icon: '📚', color: '#ef4444' },
];

const REMARKS = {
  A: 'Outstanding performance! You answered with distinction.',
  B: 'Great job! You demonstrated strong understanding.',
  C: 'Well done! You met the required standard.',
  D: 'You passed, but there is room for improvement.',
  F: 'Keep studying — you\'ll do better next time!',
};

// ─── State ──────────────────────────────────────
let result    = null;
let allItems  = [];
let curFilter = 'all';

// ─── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  result = loadResult();
  if (!result) {
    document.getElementById('pageWrap').style.display   = 'none';
    document.getElementById('noResults').style.display  = 'flex';
    return;
  }
  renderHero();
  renderStats();
  renderCorrections();
});

// ─── Load result ─────────────────────────────────
function loadResult() {
  try {
    // Check for a specific result via URL param ?result=<index>
    const params = new URLSearchParams(window.location.search);
    const idx    = params.get('result');

    const raw  = localStorage.getItem('cc_results');
    console.log('[DEBUG] cc_results raw:', raw);
    
    if (!raw) {
      console.log('[DEBUG] cc_results is empty');
      return null;
    }
    
    const list = JSON.parse(raw);
    console.log('[DEBUG] cc_results parsed:', list);
    
    if (!Array.isArray(list) || !list.length) {
      console.log('[DEBUG] cc_results is not an array or is empty');
      return null;
    }

    if (idx !== null && list[+idx]) {
      console.log('[DEBUG] Returning result at index', idx);
      return list[+idx];
    }
    
    console.log('[DEBUG] Returning latest result');
    return list[list.length - 1]; // latest result
  } catch (err) { 
    console.error('[DEBUG] Error loading result:', err);
    return null; 
  }
}

// ─── Render hero ─────────────────────────────────
function renderHero() {
  const r    = result;
  const name = r.candidate?.name || 'Student';
  const pct  = r.percentage ?? Math.round((r.correct / r.total) * 100);
  const gradeObj = getGrade(pct);

  document.title = `Results – ${name} – The Cognitive Circle`;

  // Greeting
  setTxt('heroGreeting', `Dear ${name},`);
  setTxt('heroExamName', `${r.examTitle || 'Exam'} · ${r.subject || ''}`);

  // Meta
  const submitDate = r.submitTime ? new Date(r.submitTime) : new Date();
  setTxt('heroDate', submitDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  setTxt('heroTime', submitDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  setTxt('heroReg',  r.candidate?.regNumber || '—');

  // Remark
  const pill = document.getElementById('remarkPill');
  pill.innerHTML = `${gradeObj.icon} ${REMARKS[gradeObj.grade]}`;

  // Score ring animation
  const circumference = 2 * Math.PI * 68; // 427.26
  const offset = circumference - (pct / 100) * circumference;
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.getElementById('ringFill').style.strokeDashoffset = offset;
    }, 200);
  });

  // Animate score counter
  animateCount('scorePct', 0, pct, 1200, '%');

  // Grade badge
  const badge = document.getElementById('gradeBadge');
  badge.textContent = gradeObj.grade;
  badge.title       = gradeObj.label;
}

// ─── Render stats ────────────────────────────────
function renderStats() {
  const r   = result;
  const pct = r.percentage ?? Math.round((r.correct / r.total) * 100);

  setTxt('statCorrect', r.correct  ?? '—');
  setTxt('statWrong',   r.wrong    ?? '—');
  setTxt('statSkipped', r.skipped  ?? '—');
  setTxt('statMarks',   `${r.marksEarned ?? '—'} / ${r.totalMarks ?? '—'}`);
  setTxt('statTotal',   r.total    ?? '—');
}

// ─── Load questions from cc_exams as fallback ────
function loadQuestionsFromExamStore(r) {
  try {
    const raw = localStorage.getItem('cc_exams');
    if (!raw) return [];
    const exams = JSON.parse(raw);
    if (!Array.isArray(exams) || !exams.length) return [];

    // 1. Try direct ID match (result may carry examId or id)
    const examId = r.examId || r.id;
    if (examId) {
      const match = exams.find(function(e) { return e.id === examId; });
      if (match && Array.isArray(match.questions) && match.questions.length) {
        return match.questions;
      }
    }

    // 2. Try title + subject match
    if (r.examTitle || r.subject) {
      const match = exams.find(function(e) {
        return (!r.examTitle || e.title === r.examTitle) &&
               (!r.subject   || e.subject === r.subject);
      });
      if (match && Array.isArray(match.questions) && match.questions.length) {
        return match.questions;
      }
    }

    // 3. Fall back to the most recently created exam that has questions
    const sorted = exams
      .filter(function(e) { return Array.isArray(e.questions) && e.questions.length; })
      .sort(function(a, b) { return (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1; });
    if (sorted.length) return sorted[0].questions;

    return [];
  } catch (_) { return []; }
}

// ─── Render question corrections ─────────────────
function renderCorrections() {
  const r    = result;
  const list = document.getElementById('correctionsList');

  console.log('[DEBUG] renderCorrections - result object:', r);
  console.log('[DEBUG] result.questions:', r?.questions);

  // Primary: questions saved directly in the result object
  // Fallback: look them up from the saved exam in cc_exams
  let examQs = (Array.isArray(r.questions) && r.questions.length)
    ? r.questions
    : loadQuestionsFromExamStore(r);

  console.log('[DEBUG] examQs to render:', examQs);

  if (!examQs.length) {
    console.log('[DEBUG] No questions found for rendering');
    list.innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--gray-400);">' +
        '<i class="fa-solid fa-circle-info" style="font-size:32px;margin-bottom:12px;display:block;"></i>' +
        'Question detail was not saved with this result.<br>' +
        '<small style="margin-top:8px;display:block;">Future exams will include full review.</small>' +
      '</div>';
    return;
  }

  allItems = [];

  examQs.forEach(function(q, i) {
    const userAns    = r.answers ? r.answers[i] : undefined;
    const correctAns = q.correctAnswer;
    const hasAnswer  = userAns != null && userAns !== '';
    const isCorrect  = hasAnswer && correctAns && userAns === correctAns;
    const isSkipped  = !hasAnswer;

    const status = isCorrect ? 'correct' : isSkipped ? 'skipped' : 'wrong';

    // Resolve option text from key
    function optText(key) {
      if (!key) return null;
      if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
        return q.options[key] ? key + '. ' + q.options[key] : key;
      }
      if (Array.isArray(q.options)) {
        const oi = key.charCodeAt(0) - 65;
        return q.options[oi] ? key + '. ' + q.options[oi] : key;
      }
      return key;
    }

    const yourAnsText    = isSkipped ? 'Not answered' : (optText(userAns) || userAns);
    const correctAnsText = correctAns ? (optText(correctAns) || correctAns) : null;
    const marks          = q.marks || 1;

    // Build status icon
    const statusIcon = status === 'correct'
      ? '<i class="fa-solid fa-check"></i>'
      : status === 'wrong'
        ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-minus"></i>';

    // Build correct answer row (only shown when wrong/skipped)
    const correctRow = (!isCorrect && correctAnsText)
      ? '<div class="ci-ans-row">' +
          '<span class="ans-label">Correct answer:</span>' +
          '<span class="ans-val correct-ans">' +
            '<i class="fa-solid fa-check" style="font-size:11px;margin-right:4px;"></i>' +
            mathHtml(correctAnsText) +
          '</span>' +
        '</div>'
      : '';

    // Build explanation block (shown when explanation exists)
    const explanationBlock = q.explanation
      ? '<div class="ci-explanation">' +
          '<i class="fa-solid fa-lightbulb"></i>' +
          '<div>' +
            '<span class="expl-label">Explanation</span>' +
            '<span class="expl-text">' + mathHtml(q.explanation) + '</span>' +
          '</div>' +
        '</div>'
      : '';

    // Build topic tag
    const topicTag = q.topic
      ? '<span class="ci-topic"><i class="fa-solid fa-tag" style="font-size:10px;"></i> ' + escHtml(q.topic) + '</span>'
      : '';

    // Build marks chip
    const marksChip = isCorrect
      ? '<span class="ci-marks">+' + marks + ' mark' + (marks !== 1 ? 's' : '') + '</span>'
      : '';

    // Build badge label
    const badgeLabel = status === 'correct' ? 'Correct' : status === 'wrong' ? 'Wrong' : 'Skipped';

    const itemEl = document.createElement('div');
    itemEl.className = 'correction-item';
    itemEl.dataset.status = status;

    itemEl.innerHTML =
      '<div class="ci-status ' + status + '">' + statusIcon + '</div>' +
      '<div class="ci-content">' +
        '<div class="ci-top">' +
          '<span class="ci-num">Q' + (i + 1) + '</span>' +
          '<span class="ci-badge ' + status + '">' + badgeLabel + '</span>' +
          topicTag +
          marksChip +
        '</div>' +
        '<div class="ci-question">' + mathHtml(q.question || q.text || '—') + '</div>' +
        '<div class="ci-answers">' +
          '<div class="ci-ans-row">' +
            '<span class="ans-label">Your answer:</span>' +
            '<span class="ans-val your ' + status + '">' + mathHtml(yourAnsText) + '</span>' +
          '</div>' +
          correctRow +
        '</div>' +
        explanationBlock +
      '</div>';

    allItems.push(itemEl);
    list.appendChild(itemEl);
  });

  updateCounts();
}

// ─── Filter ──────────────────────────────────────
function setFilter(filter) {
  curFilter = filter;

  // Update tab styles
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === filter);
  });

  allItems.forEach(el => {
    const status = el.dataset.status;
    const show   = filter === 'all' || status === filter;
    el.classList.toggle('hidden', !show);
  });
}

function updateCounts() {
  const counts = { correct: 0, wrong: 0, skipped: 0 };
  allItems.forEach(el => { const s = el.dataset.status; if (counts[s] !== undefined) counts[s]++; });

  // Update tab labels with counts
  document.querySelectorAll('.tab').forEach(tab => {
    const f = tab.dataset.filter;
    if (f === 'all') {
      tab.textContent = 'All (' + allItems.length + ')';
    } else if (counts[f] !== undefined) {
      const dotClass = f === 'correct' ? 'green' : f === 'wrong' ? 'red' : 'gray';
      const label    = f.charAt(0).toUpperCase() + f.slice(1);
      tab.innerHTML  = '<span class="dot ' + dotClass + '"></span> ' + label + ' (' + counts[f] + ')';
    }
  });
}

// ─── Grade helper ────────────────────────────────
function getGrade(pct) {
  return GRADES.find(g => pct >= g.min) || GRADES[GRADES.length - 1];
}

// ─── Animate count ───────────────────────────────
function animateCount(id, from, to, duration, suffix) {
  suffix = suffix || '';
  const el    = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const step  = function(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ─── Utilities ───────────────────────────────────
function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastT;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), 3000);
}
