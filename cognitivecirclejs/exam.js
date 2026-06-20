/* =============================================
   COGNITIVE CIRCLE – Exam Page Logic
   Reads:  cc_session  (localStorage)
   Writes: cc_results  (localStorage + Firebase via CCDB)
   Requires: cognitivecirclejs/firebase-db.js loaded first
   ============================================= */

'use strict';

// Safety fallback: if mathrender.js hasn't loaded, use plain escaping
if (typeof window.mathHtml !== 'function') {
  window.mathHtml = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  };
}

// ─── State ──────────────────────────────────────
const exam = {
  session:      null,
  questions:    [],
  current:      0,       // 0-based index
  answers:      {},      // { index: optionKey }
  flagged:      new Set(),
  timer:        null,
  timeLeft:     0,
  calcOpen:     false,
  calcStr:      '0',
};

// ─── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSession();
  if (exam.questions.length) {
    renderTopInfo();
    buildGrid();
    renderQuestion(0);
    startTimer();
  }
});

// ─── Load session ────────────────────────────────
function loadSession() {
  try {
    const raw = localStorage.getItem('cc_session');
    if (!raw) { redirectToLogin(); return; }
    exam.session = JSON.parse(raw);
  } catch (_) { redirectToLogin(); return; }

  const s = exam.session;
  if (!s || !s.exam) { redirectToLogin(); return; }

  exam.questions = s.exam.questions || [];
  exam.timeLeft  = s.timeRemaining || (s.exam.duration || 60) * 60;

  // Restore in-progress answers from session
  if (s.answers && typeof s.answers === 'object') {
    Object.assign(exam.answers, s.answers);
  }
  if (Array.isArray(s.flagged)) {
    s.flagged.forEach(i => exam.flagged.add(i));
  }
}

function redirectToLogin() {
  window.location.href = 'login.html';
}

// ─── Render top info (brand, candidate strip, footer) ──
function renderTopInfo() {
  const s    = exam.session;
  const name = s.candidate?.name      || '—';
  const reg  = s.candidate?.regNumber || '—';
  const title = s.exam?.title         || 'Exam';
  const subj  = s.exam?.subject       || '—';

  document.title = `${title} – The Cognitive Circle`;
  setTxt('brandSubject', subj);
  setTxt('infoName',  name);
  setTxt('infoReg',   reg);
  setTxt('infoExam',  title);
  setTxt('footerName', name);
  setTxt('footerReg',  reg);
  setTxt('footerExam', title);
  setTxt('ovTotal', exam.questions.length);
}

// ─── Timer ───────────────────────────────────────
function startTimer() {
  renderTimer();
  exam.timer = setInterval(() => {
    exam.timeLeft--;
    renderTimer();
    persistSession();

    if (exam.timeLeft <= 0) {
      clearInterval(exam.timer);
      showToast('Time is up! Submitting your exam…', 'warn');
      setTimeout(submitExam, 1500);
    }
  }, 1000);
}

function renderTimer() {
  const t = Math.max(0, exam.timeLeft);
  const h = String(Math.floor(t / 3600)).padStart(2, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  setTxt('timerDisplay', `${h}:${m}:${s}`);

  const block = document.getElementById('timerBlock');
  block.classList.remove('warning', 'danger');
  if (t <= 60)  block.classList.add('danger');
  else if (t <= 300) block.classList.add('warning');
}

// ─── Build question grid ─────────────────────────
function buildGrid() {
  const grid = document.getElementById('qGrid');
  grid.innerHTML = '';
  exam.questions.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.className = 'grid-btn';
    btn.id = `gb-${i}`;
    btn.textContent = i + 1;
    btn.onclick = () => goTo(i);
    grid.appendChild(btn);
  });
  setTxt('qTotal', exam.questions.length);
}

function updateGrid() {
  exam.questions.forEach((_, i) => {
    const btn = document.getElementById(`gb-${i}`);
    if (!btn) return;
    btn.className = 'grid-btn';
    if (i === exam.current)          btn.classList.add('current');
    else if (exam.flagged.has(i))    btn.classList.add('flagged');
    else if (exam.answers[i] != null) btn.classList.add('answered');
  });
  updateOverview();
}

// ─── Render question ─────────────────────────────
function renderQuestion(index) {
  exam.current = index;
  const q = exam.questions[index];
  if (!q) return;

  setTxt('qCurrentNum', index + 1);

  // Question text (rendered through mathHtml so LaTeX / math shorthand displays)
  document.getElementById('qText').innerHTML = (window.mathHtml ? window.mathHtml(q.question || q.text || '—') : (q.question || q.text || '—'));


  // Image (if exists)
  const imgWrap = document.getElementById('qImageWrap');
  const imgEl   = document.getElementById('qImage');
  if (q.image) {
    imgEl.src = q.image;
    imgWrap.style.display = '';
  } else {
    imgWrap.style.display = 'none';
  }

  // Flag state
  const flagBtn = document.getElementById('flagBtn');
  flagBtn.classList.toggle('flagged', exam.flagged.has(index));

  // Render options
  renderOptions(q, index);

  // Nav buttons
  document.getElementById('btnPrev').disabled = index === 0;

  const isLast = index === exam.questions.length - 1;
  const nextBtn = document.getElementById('btnNext');
  nextBtn.textContent = isLast ? '' : '';
  nextBtn.innerHTML   = isLast
    ? '<i class="fa-solid fa-paper-plane"></i> Submit'
    : 'Next <i class="fa-solid fa-arrow-right"></i>';
  nextBtn.onclick = isLast ? confirmEndExam : nextQuestion;

  updateGrid();
}

// ─── Render options ──────────────────────────────
function renderOptions(q, index) {
  const list = document.getElementById('optionsList');
  list.innerHTML = '';

  const selected = exam.answers[index];

  // Build options array from various possible structures
  let opts = [];

  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    // QB format: { A: '...', B: '...', C: '...', D: '...' }
    opts = Object.entries(q.options).map(([key, val]) => ({ key, text: val }));
  } else if (Array.isArray(q.options)) {
    opts = q.options.map((text, i) => ({ key: String.fromCharCode(65 + i), text }));
  }

  // True/False
  if (!opts.length && q.type === 'True/False') {
    opts = [{ key: 'A', text: 'True' }, { key: 'B', text: 'False' }];
  }

  // Short answer / Essay fallback
  if (!opts.length) {
    const ta = document.createElement('textarea');
    ta.className = 'form-input';
    ta.placeholder = 'Type your answer here…';
    ta.style.cssText = 'width:100%;min-height:120px;resize:vertical;padding:14px;border:1.5px solid var(--gray-200);border-radius:10px;font-size:14px;font-family:inherit;';
    ta.value = exam.answers[index] || '';
    ta.oninput = () => { exam.answers[index] = ta.value; updateGrid(); persistSession(); };
    list.appendChild(ta);
    return;
  }

  opts.forEach(({ key, text }) => {
    const div = document.createElement('div');
    div.className = 'option-item' + (selected === key ? ' selected' : '');
    div.innerHTML = `
      <div class="opt-radio"></div>
      <span class="opt-label">${key}.</span>
      <span class="opt-text">${window.mathHtml ? window.mathHtml(text) : escHtml(text)}</span>`;

    div.onclick = () => selectOption(index, key);
    list.appendChild(div);
  });
}

// ─── Select an option ────────────────────────────
function selectOption(index, key) {
  exam.answers[index] = key;
  renderOptions(exam.questions[index], index);
  updateGrid();
  persistSession();
}

// ─── Navigation ──────────────────────────────────
function nextQuestion() {
  if (exam.current < exam.questions.length - 1) goTo(exam.current + 1);
}
function prevQuestion() {
  if (exam.current > 0) goTo(exam.current - 1);
}
function goTo(index) {
  renderQuestion(index);
}

// ─── Flag ────────────────────────────────────────
function toggleFlag() {
  const i = exam.current;
  if (exam.flagged.has(i)) exam.flagged.delete(i);
  else exam.flagged.add(i);

  document.getElementById('flagBtn').classList.toggle('flagged', exam.flagged.has(i));
  updateGrid();
  persistSession();
  setTxt('reviewCount', exam.flagged.size);
}

// ─── Overview ────────────────────────────────────
function updateOverview() {
  const total    = exam.questions.length;
  const answered = Object.keys(exam.answers).filter(k => exam.answers[k] != null && exam.answers[k] !== '').length;
  const flagged  = exam.flagged.size;
  const notAns   = total - answered;

  setTxt('ovAnswered', answered);
  setTxt('ovNot',      notAns);
  setTxt('ovFlagged',  flagged);
  setTxt('reviewCount', flagged);
}

// ─── Review flagged ──────────────────────────────
function reviewFlagged() {
  const flags = [...exam.flagged];
  if (!flags.length) { showToast('No flagged questions', 'warn'); return; }
  goTo(flags[0]);
}

// ─── Confirm end ─────────────────────────────────
function confirmEndExam() {
  const total    = exam.questions.length;
  const answered = Object.keys(exam.answers).filter(k => exam.answers[k] != null && exam.answers[k] !== '').length;
  const flagged  = exam.flagged.size;

  setTxt('msAnswered',   answered);
  setTxt('msUnanswered', total - answered);
  setTxt('msFlagged',    flagged);

  openModal('endModal');
}

// ─── Submit Exam ─────────────────────────────────
function slimQuestions(questions) {
  return questions.map(q => ({
    id: q.id,
    type: q.type,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    marks: q.marks,
    explanation: q.explanation
  }));
}

function submitExam() {
  clearInterval(exam.timer);
  closeModal('endModal');

  const questions  = exam.questions;
  const total      = questions.length;
  console.log('[DEBUG] Submitting exam with', total, 'questions');

  let correct = 0, wrong = 0, skipped = 0, marksEarned = 0;

  questions.forEach((q, i) => {
    const chosen = exam.answers[i];
    if (!chosen && chosen !== 0) { skipped++; return; }

    const correctAns = q.correctAnswer;
    if (!correctAns) { return; }

    if (chosen === correctAns) {
      correct++;
      marksEarned += (q.marks || 1);
    } else {
      wrong++;
    }
  });

  const totalMarks = questions.reduce((s, q) => s + (q.marks || 1), 0);
  const pct        = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Save results with slimmed questions to avoid QuotaExceededError
  const result = {
    examId:      exam.session.exam.id,
    examTitle:   exam.session.exam.title,
    subject:     exam.session.exam.subject,
    candidate:   exam.session.candidate,
    startTime:   exam.session.startTime,
    submitTime:  new Date().toISOString(),
    total, correct, wrong, skipped,
    marksEarned, totalMarks,
    percentage:  pct,
    answers:     exam.answers,
    questions:   slimQuestions(exam.questions),
  };

  let resultIndex = -1;
  let saved = false;
  try {
    const raw  = localStorage.getItem('cc_results') || '[]';
    const list = JSON.parse(raw) || [];
    list.push(result);
    resultIndex = list.length - 1;

    try {
      localStorage.setItem('cc_results', JSON.stringify(list));
      saved = true;
    } catch (quotaErr) {
      console.warn('[DEBUG] QuotaExceededError, trying to drop oldest entries...', quotaErr);
      for (let drop = 1; drop <= 6 && !saved; drop++) {
        if (list.length > drop) {
          const trimmed = list.slice(drop);
          try {
            localStorage.setItem('cc_results', JSON.stringify(trimmed));
            resultIndex = trimmed.length - 1;
            saved = true;
            console.log('[DEBUG] Dropped', drop, 'oldest result(s), saved successfully.');
          } catch (e) { /* keep trying */ }
        }
      }
      if (!saved) throw quotaErr;
    }

    const verify = JSON.parse(localStorage.getItem('cc_results') || '[]');
    console.log('[DEBUG] Post-save cc_results length:', verify.length, 'index:', resultIndex);
    if (saved) localStorage.removeItem('cc_session');
  } catch (err) {
    console.error('[DEBUG] Error saving result:', err);
  }

  // ── Also save to Firebase so admins see it on any device ──
  if (window.CCDB) {
    CCDB.saveResult(result).catch(function () {});
    window.dispatchEvent(new CustomEvent('resultSubmitted', { detail: result }));
  }

  // Mark as submitted so the "unsaved changes" guard doesn't block navigation
  exam.submitted = true;

  showToast('✓ Exam submitted successfully! Redirecting to results…', 'success');

  setTimeout(() => {
    const params = resultIndex >= 0 ? `?result=${resultIndex}` : '';
    const redirectUrl = 'results.html' + params;
    console.log('[DEBUG] Redirecting to:', redirectUrl, '| resultIndex:', resultIndex);
    window.location.href = redirectUrl;
  }, 800);
}

// ─── Persist session (autosave) ──────────────────
function persistSession() {
  if (!exam.session) return;
  try {
    const updated = {
      ...exam.session,
      timeRemaining: exam.timeLeft,
      answers: exam.answers,
      flagged: [...exam.flagged],
    };
    localStorage.setItem('cc_session', JSON.stringify(updated));
  } catch (_) {}
}

// ─── Calculator ─────────────────────────────────
function toggleCalc() {
  exam.calcOpen = !exam.calcOpen;
  const popup   = document.getElementById('calcPopup');
  const chevron = document.getElementById('calcChevron');
  popup.style.display = exam.calcOpen ? '' : 'none';
  chevron.classList.toggle('open', exam.calcOpen);
}

function calcInput(val) {
  if (exam.calcStr === '0' && val !== '.') exam.calcStr = val;
  else exam.calcStr += val;
  document.getElementById('calcScreen').textContent = exam.calcStr;
}
function calcClear() {
  exam.calcStr = '0';
  document.getElementById('calcScreen').textContent = '0';
}
function calcBackspace() {
  exam.calcStr = exam.calcStr.length > 1 ? exam.calcStr.slice(0, -1) : '0';
  document.getElementById('calcScreen').textContent = exam.calcStr;
}
function calcEquals() {
  try {
    // Replace display symbols with JS operators
    const expr = exam.calcStr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    // Safe eval using Function
    const result = Function('"use strict"; return (' + expr + ')')();
    const rounded = parseFloat(result.toFixed(8));
    exam.calcStr = String(rounded);
    document.getElementById('calcScreen').textContent = exam.calcStr;
  } catch (_) {
    document.getElementById('calcScreen').textContent = 'Error';
    exam.calcStr = '0';
  }
}

// Close calc when clicking outside
document.addEventListener('click', (e) => {
  if (!document.getElementById('calcToggle').contains(e.target) &&
      !document.getElementById('calcPopup').contains(e.target)) {
    document.getElementById('calcPopup').style.display = 'none';
    document.getElementById('calcChevron').classList.remove('open');
    exam.calcOpen = false;
  }
});

// ─── Modal helpers ───────────────────────────────
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ─── Utility ────────────────────────────────────
function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// Warn before leaving
window.addEventListener('beforeunload', (e) => {
  if (exam.questions.length && !exam.submitted) {
    e.preventDefault();
    e.returnValue = '';
  }
});
