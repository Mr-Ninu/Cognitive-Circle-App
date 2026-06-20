// ── MATH SAFETY FALLBACK ──
if (typeof window.mathHtml !== 'function') {
  window.mathHtml = function(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

/* =============================================
   COGNITIVE CIRCLE – Exam Builder Logic
   Reads from Question Bank localStorage:
     qb_questions → [{text, subject, topic, type, difficulty, draft, options, correctAnswer, createdAt}]
     qb_subjects  → ['Biology', 'Chemistry', ...]
     qb_topics    → [{id, name, subjectId}]  where subjectId === subject name
   ============================================= */

'use strict';

// ─── State ─────────────────────────────────────
const state = {
  allQuestions:      [],   // normalised from qb_questions
  filteredQuestions: [],   // after filters
  examQuestions:     [],   // questions added to this exam
  visibleCount:      10,
  pageSize:          10,
  topicChart:        null,
  diffChart:         null,
  currentExamId:     null, // stable ID for the exam being built
};

// Generate or restore a stable exam ID so refreshing doesn't lose the exam
function getOrCreateExamId() {
  if (state.currentExamId) return state.currentExamId;
  const stored = localStorage.getItem('cc_current_exam_id');
  if (stored) { state.currentExamId = stored; return stored; }
  const id = `exam_${Date.now()}`;
  state.currentExamId = id;
  localStorage.setItem('cc_current_exam_id', id);
  return id;
}

// ─── Autosave (debounced, runs 1.5 s after last change) ──
let _autosaveTimer;
function scheduleAutosave() {
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(autosave, 1500);
}
function autosave() {
  try {
    const title = document.getElementById('examTitle').value.trim();
    if (!title && !state.examQuestions.length) return; // nothing worth saving
    const draft = buildExamObject('draft');
    localStorage.setItem('cc_draft_exam', JSON.stringify(draft));
  } catch (_) {}
}

// ─── Chart colour palettes ──────────────────────
const TOPIC_COLORS = [
  '#2563eb','#3b82f6','#60a5fa','#93c5fd',
  '#1d4ed8','#6366f1','#8b5cf6','#06b6d4',
  '#0ea5e9','#10b981','#f59e0b','#f97316',
];
const DIFF_COLORS = { Easy: '#10b981', Medium: '#f59e0b', Hard: '#ef4444' };

// Marks per difficulty (Question Bank has no marks field)
const MARKS_BY_DIFF = { Easy: 1, Medium: 2, Hard: 3 };

// ─── Init ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadQuestionsFromStorage();
  populateSubjectDropdown();
  initCharts();
  loadDraft();

  // ── Wire autosave to every form field ──────────
  ['examTitle','examDesc','examDuration','durationUnit',
   'subjectSelect','difficultyFilter','examType'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input',  scheduleAutosave);
    if (el) el.addEventListener('change', scheduleAutosave);
  });
});

// ─── Storage helpers ────────────────────────────
function qbGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch (_) { return null; }
}

// ─── Load & normalise questions from Question Bank ──
function loadQuestionsFromStorage() {
  const raw = qbGet('qb_questions') || [];

  // Normalise each question to the shape exambuilder expects
  state.allQuestions = raw
    .filter(q => !q.draft)          // skip draft questions
    .map((q, i) => ({
      // Use createdAt as a stable ID; fall back to index
      id:         String(q.createdAt || i),
      subject:    q.subject   || '',
      topic:      q.topic     || '',
      question:   q.text      || '',   // QB uses "text", builder uses "question"
      difficulty: q.difficulty || 'Easy',
      marks:      MARKS_BY_DIFF[q.difficulty] || 1,
      type:       q.type      || 'MCQ',
      options:    q.options   || null,
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation  || null,
      image:      q.image     || null,
      createdAt:  q.createdAt || i,
    }));
}

// ─── Subjects – read directly from qb_subjects ──
function getSubjects() {
  const raw = qbGet('qb_subjects') || [];
  // Also collect any subjects from questions that might not be in the list
  const fromQs = [...new Set(state.allQuestions.map(q => q.subject).filter(Boolean))];
  return [...new Set([...raw, ...fromQs])].sort();
}

// ─── Topics – read from qb_topics, filter by subject ──
function getTopicsForSubject(subject) {
  const raw = qbGet('qb_topics') || [];
  // subjectId in QB equals the subject name string
  const fromTopics = raw
    .filter(t => t.subjectId === subject)
    .map(t => t.name)
    .filter(Boolean);

  // Also pick up any topics used in questions (safety net)
  const fromQs = [...new Set(
    state.allQuestions
      .filter(q => q.subject === subject)
      .map(q => q.topic)
      .filter(Boolean)
  )];

  return [...new Set([...fromTopics, ...fromQs])].sort();
}

function getQuestionsForSubject(subject) {
  return state.allQuestions.filter(q => q.subject === subject);
}

// ─── Populate subject dropdown ──────────────────
function populateSubjectDropdown() {
  const sel = document.getElementById('subjectSelect');
  const subjects = getSubjects();
  sel.innerHTML = '<option value="">-- Select Subject --</option>';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
}

// ─── Subject change handler ─────────────────────
function onSubjectChange() {
  const subject = document.getElementById('subjectSelect').value;

  // Reset exam for new subject
  state.examQuestions = [];
  state.visibleCount  = state.pageSize;

  // Populate topic filter
  const topicSel = document.getElementById('topicFilter');
  topicSel.innerHTML = '<option value="all">All Topics</option>';
  if (subject) {
    getTopicsForSubject(subject).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      topicSel.appendChild(opt);
    });
  }

  // Reset filters
  document.getElementById('questionSearch').value = '';
  document.getElementById('diffFilter').value     = 'all';

  filterQuestions();
  populateRandomTopicDropdown();
  updateRandomPoolInfo();
  renderExamQList();
  updatePreviewStats();
  updateCharts();
  updateStatCards();
}

// ─── Filter questions ───────────────────────────
function filterQuestions() {
  const subject = document.getElementById('subjectSelect').value;
  const topic   = document.getElementById('topicFilter').value;
  const diff    = document.getElementById('diffFilter').value;
  const search  = document.getElementById('questionSearch').value.trim().toLowerCase();

  if (!subject) {
    state.filteredQuestions = [];
    renderQuestionsTable();
    return;
  }

  state.filteredQuestions = getQuestionsForSubject(subject).filter(q => {
    const matchTopic  = topic  === 'all' || q.topic === topic;
    const matchDiff   = diff   === 'all' || q.difficulty === diff;
    const matchSearch = !search ||
      q.question.toLowerCase().includes(search) ||
      (q.topic || '').toLowerCase().includes(search);
    return matchTopic && matchDiff && matchSearch;
  });

  state.visibleCount = state.pageSize;
  renderQuestionsTable();
}

// ─── Render questions table ─────────────────────
function renderQuestionsTable() {
  const emptyEl = document.getElementById('emptyQuestionsState');
  const tableEl = document.getElementById('questionsTable');
  const tbody   = document.getElementById('questionsTableBody');
  const lmRow   = document.getElementById('loadMoreRow');

  const subject = document.getElementById('subjectSelect').value;

  // No subject selected yet
  if (!subject) {
    emptyEl.innerHTML = `
      <div class="empty-icon"><i class="fa-solid fa-arrow-pointer"></i></div>
      <h3>Select a Subject</h3>
      <p>Choose a subject above to load questions from your <a href="questionbank.html">Question Bank</a>.</p>`;
    emptyEl.style.display = '';
    tableEl.style.display = 'none';
    lmRow.style.display   = 'none';
    return;
  }

  // Subject selected but no questions
  if (!state.filteredQuestions.length) {
    emptyEl.innerHTML = `
      <div class="empty-icon"><i class="fa-solid fa-circle-question"></i></div>
      <h3>No Questions Found</h3>
      <p>No active questions match your filters. Add questions in the <a href="questionbank.html">Question Bank</a>.</p>`;
    emptyEl.style.display = '';
    tableEl.style.display = 'none';
    lmRow.style.display   = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  tableEl.style.display = '';

  const visible = state.filteredQuestions.slice(0, state.visibleCount);
  tbody.innerHTML = '';

  visible.forEach(q => {
    const isAdded = state.examQuestions.some(eq => eq.id === q.id);
    const tr = document.createElement('tr');
    tr.id = `qrow-${q.id}`;
    tr.innerHTML = `
      <td><input type="checkbox" class="q-checkbox" id="chk-${q.id}"
        onchange="onCheckboxChange('${q.id}')" ${isAdded ? 'checked' : ''} /></td>
      <td><span class="q-text">${mathHtml(q.question)}</span></td>
      <td><span class="q-topic">${escHtml(q.topic || '—')}</span></td>
      <td>${diffBadge(q.difficulty)}</td>
      <td class="marks-val">${q.marks}</td>
      <td>
        <button class="btn-add ${isAdded ? 'added' : ''}" id="addbtn-${q.id}"
          onclick="toggleAddQuestion('${q.id}')" ${isAdded ? 'disabled' : ''}>
          ${isAdded ? '<i class="fa-solid fa-check"></i>' : 'Add'}
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  lmRow.style.display = state.filteredQuestions.length > state.visibleCount ? '' : 'none';
}

function loadMoreQuestions() {
  state.visibleCount += state.pageSize;
  renderQuestionsTable();
}

// ─── Checkbox mirrors Add button ────────────────
function onCheckboxChange(id) {
  const chk = document.getElementById(`chk-${id}`);
  const alreadyAdded = state.examQuestions.some(q => q.id === id);
  if (chk.checked && !alreadyAdded) addQuestion(id);
  else if (!chk.checked && alreadyAdded) removeQuestion(id);
}

function toggleAddQuestion(id) {
  if (!state.examQuestions.some(q => q.id === id)) addQuestion(id);
}

// ─── Add question ───────────────────────────────
function addQuestion(id) {
  const q = state.allQuestions.find(x => x.id === id);
  if (!q || state.examQuestions.some(eq => eq.id === id)) return;
  state.examQuestions.push({ ...q });

  const btn = document.getElementById(`addbtn-${id}`);
  const chk = document.getElementById(`chk-${id}`);
  if (btn) { btn.classList.add('added'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-check"></i>'; }
  if (chk) chk.checked = true;

  syncAll();
  scheduleAutosave();
  showToast('Question added to exam', 'success');
}

// ─── Remove question ─────────────────────────────
function removeQuestion(id) {
  state.examQuestions = state.examQuestions.filter(q => q.id !== id);

  const btn = document.getElementById(`addbtn-${id}`);
  const chk = document.getElementById(`chk-${id}`);
  if (btn) { btn.classList.remove('added'); btn.disabled = false; btn.innerHTML = 'Add'; }
  if (chk) chk.checked = false;

  const genRow = document.getElementById(`genrow-${id}`);
  if (genRow) genRow.remove();

  syncAll();
  scheduleAutosave();
}

// ─── Sync all panels ────────────────────────────
function syncAll() {
  renderExamQList();
  updatePreviewStats();
  updateCharts();
  updateStatCards();
  autoCalcMarks();
  autoUpdateNumQ();
}

// ─── Render exam question list (right panel) ────
function renderExamQList() {
  const list     = document.getElementById('examQList');
  const emptyEl  = document.getElementById('examQEmpty');
  const countLbl = document.getElementById('examQCountLabel');

  countLbl.textContent = state.examQuestions.length;

  if (!state.examQuestions.length) {
    list.innerHTML = '';
    list.appendChild(emptyEl);
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';
  const frag = document.createDocumentFragment();

  state.examQuestions.forEach(q => {
    const item = document.createElement('div');
    item.className = 'exam-q-item';
    item.id = `examitem-${q.id}`;
    item.innerHTML = `
      <div>
        <div class="exam-q-text">${mathHtml(q.question)}</div>
        <div class="exam-q-meta">
          ${escHtml(q.topic || '')}${q.topic ? ' · ' : ''}${q.difficulty} · ${q.marks} Mark${q.marks !== 1 ? 's' : ''}
        </div>
      </div>
      <button class="exam-q-remove" onclick="removeQuestion('${q.id}')" title="Remove">
        <i class="fa-solid fa-circle-xmark"></i>
      </button>`;
    frag.appendChild(item);
  });

  list.innerHTML = '';
  list.appendChild(frag);
}

// ─── Preview stats ───────────────────────────────
function updatePreviewStats() {
  const count    = state.examQuestions.length;
  const duration = parseInt(document.getElementById('examDuration').value) || 0;
  const marks    = state.examQuestions.reduce((s, q) => s + q.marks, 0);

  document.getElementById('previewQCount').textContent   = count;
  document.getElementById('previewDuration').textContent = duration;
  document.getElementById('previewMarks').textContent    = marks;
}

function updatePreview() { updatePreviewStats(); }

// ─── Auto-calc marks & question count ───────────
function autoCalcMarks() {
  const total = state.examQuestions.reduce((s, q) => s + q.marks, 0);
  document.getElementById('examTotalMarks').value = total || '';
}

function autoUpdateNumQ() {
  document.getElementById('examNumQ').value = state.examQuestions.length || '';
}

function onNumQChange() { /* user can type manually; no forced override */ }

// ─── Stat cards ──────────────────────────────────
function updateStatCards() {
  const count    = state.examQuestions.length;
  const topics   = [...new Set(state.examQuestions.map(q => q.topic).filter(Boolean))].length;
  const duration = parseInt(document.getElementById('examDuration').value) || 0;
  const marks    = state.examQuestions.reduce((s, q) => s + q.marks, 0);

  document.getElementById('statTotalQ').textContent   = count;
  document.getElementById('statTopics').textContent   = topics;
  document.getElementById('statDuration').textContent = duration;
  document.getElementById('statMarks').textContent    = marks;
}

// ─── Charts ─────────────────────────────────────
function initCharts() {
  const ctxTopic = document.getElementById('topicChart').getContext('2d');
  const ctxDiff  = document.getElementById('diffChart').getContext('2d');

  const baseOpts = {
    cutout: '68%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    animation: { duration: 400 },
  };

  state.topicChart = new Chart(ctxTopic, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: '#fff' }] },
    options: baseOpts,
  });

  state.diffChart = new Chart(ctxDiff, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: '#fff' }] },
    options: baseOpts,
  });
}

function updateCharts() { updateTopicChart(); updateDiffChart(); }

function updateTopicChart() {
  const emptyMsg = document.getElementById('topicChartEmpty');
  const legend   = document.getElementById('topicLegend');
  const canvas   = document.getElementById('topicChart');

  if (!state.examQuestions.length) {
    canvas.style.display = 'none';
    emptyMsg.classList.remove('hidden');
    legend.innerHTML = '';
    return;
  }
  canvas.style.display = '';
  emptyMsg.classList.add('hidden');

  const counts = {};
  state.examQuestions.forEach(q => { const t = q.topic || 'Other'; counts[t] = (counts[t] || 0) + 1; });
  const labels = Object.keys(counts);
  const colors = labels.map((_, i) => TOPIC_COLORS[i % TOPIC_COLORS.length]);

  state.topicChart.data.labels = labels;
  state.topicChart.data.datasets[0].data = labels.map(l => counts[l]);
  state.topicChart.data.datasets[0].backgroundColor = colors;
  state.topicChart.update();

  legend.innerHTML = labels.map((l, i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${escHtml(l)} (${counts[l]})</div>`
  ).join('');
}

function updateDiffChart() {
  const emptyMsg = document.getElementById('diffChartEmpty');
  const legend   = document.getElementById('diffLegend');
  const canvas   = document.getElementById('diffChart');

  if (!state.examQuestions.length) {
    canvas.style.display = 'none';
    emptyMsg.classList.remove('hidden');
    legend.innerHTML = '';
    return;
  }
  canvas.style.display = '';
  emptyMsg.classList.add('hidden');

  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  state.examQuestions.forEach(q => { if (counts[q.difficulty] !== undefined) counts[q.difficulty]++; });

  const labels = Object.keys(counts).filter(k => counts[k] > 0);
  const colors = labels.map(l => DIFF_COLORS[l]);

  state.diffChart.data.labels = labels;
  state.diffChart.data.datasets[0].data = labels.map(l => counts[l]);
  state.diffChart.data.datasets[0].backgroundColor = colors;
  state.diffChart.update();

  legend.innerHTML = labels.map((l, i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${escHtml(l)} (${counts[l]})</div>`
  ).join('');
}

// ─── Generate Exam ──────────────────────────────
function generateExam() {
  if (!state.examQuestions.length) {
    showToast('Add questions to generate the exam', 'error');
    return;
  }

  const card    = document.getElementById('generatedExamCard');
  const tbody   = document.getElementById('generatedTableBody');
  const countEl = document.getElementById('generatedCount');

  countEl.textContent = `${state.examQuestions.length} Questions`;
  tbody.innerHTML = '';

  state.examQuestions.forEach((q, i) => {
    const tr = document.createElement('tr');
    tr.id = `genrow-${q.id}`;
    tr.innerHTML = `
      <td style="font-weight:700;color:var(--primary);">#${String(i + 1).padStart(2, '0')}</td>
      <td><span class="q-topic">${escHtml(q.topic || '—')}</span></td>
      <td class="q-text">${mathHtml(q.question)}</td>
      <td>${diffBadge(q.difficulty)}</td>
      <td class="marks-val">${q.marks}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-remove-row" onclick="removeQuestion('${q.id}');renderGeneratedTable()">
            <i class="fa-solid fa-trash-can"></i> Remove
          </button>
          <button class="btn-replace-row" onclick="replaceQuestion('${q.id}')">
            <i class="fa-solid fa-shuffle"></i> Replace
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  card.style.display = '';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Exam generated successfully!', 'success');
}

function renderGeneratedTable() {
  const tbody   = document.getElementById('generatedTableBody');
  const countEl = document.getElementById('generatedCount');
  if (!tbody) return;
  countEl.textContent = `${state.examQuestions.length} Questions`;
  tbody.querySelectorAll('tr').forEach((tr, i) => {
    const id = tr.id.replace('genrow-', '');
    if (!state.examQuestions.some(q => q.id === id)) { tr.remove(); return; }
    const firstTd = tr.querySelector('td');
    if (firstTd) firstTd.textContent = `#${String(i + 1).padStart(2, '0')}`;
  });
}

// ─── Replace question ───────────────────────────
function replaceQuestion(id) {
  const current = state.examQuestions.find(q => q.id === id);
  if (!current) return;

  const subject = document.getElementById('subjectSelect').value;
  const pool = state.allQuestions.filter(q =>
    q.subject === subject &&
    q.id !== id &&
    q.topic === current.topic &&
    !state.examQuestions.some(eq => eq.id === q.id)
  );

  if (!pool.length) {
    showToast('No replacement available in this topic', 'error');
    return;
  }

  const replacement = pool[Math.floor(Math.random() * pool.length)];
  const idx = state.examQuestions.findIndex(q => q.id === id);
  state.examQuestions[idx] = { ...replacement };

  // Update Add buttons
  ['addbtn', 'chk'].forEach(prefix => {
    const oldEl = document.getElementById(`${prefix}-${id}`);
    const newEl = document.getElementById(`${prefix}-${replacement.id}`);
    if (prefix === 'addbtn') {
      if (oldEl) { oldEl.classList.remove('added'); oldEl.disabled = false; oldEl.innerHTML = 'Add'; }
      if (newEl) { newEl.classList.add('added'); newEl.disabled = true; newEl.innerHTML = '<i class="fa-solid fa-check"></i>'; }
    } else {
      if (oldEl) oldEl.checked = false;
      if (newEl) newEl.checked = true;
    }
  });

  syncAll();
  generateExam();
  showToast('Question replaced', 'info');
}

// ─── Clear all ──────────────────────────────────
function clearAll() {
  if (!state.examQuestions.length) return;
  if (!confirm('Remove all questions from this exam?')) return;

  state.examQuestions.map(q => q.id).forEach(id => {
    const btn = document.getElementById(`addbtn-${id}`);
    const chk = document.getElementById(`chk-${id}`);
    if (btn) { btn.classList.remove('added'); btn.disabled = false; btn.innerHTML = 'Add'; }
    if (chk) chk.checked = false;
  });

  state.examQuestions = [];
  document.getElementById('generatedExamCard').style.display = 'none';
  syncAll();
  showToast('All questions cleared', 'info');
}

// ─── Build exam object ───────────────────────────
function buildExamObject(status) {
  return {
    id:           getOrCreateExamId(),
    title:        document.getElementById('examTitle').value.trim(),
    subject:      document.getElementById('subjectSelect').value,
    description:  document.getElementById('examDesc').value.trim(),
    duration:     parseInt(document.getElementById('examDuration').value) || 0,
    durationUnit: document.getElementById('durationUnit').value,
    numQuestions: state.examQuestions.length,
    totalMarks:   state.examQuestions.reduce((s, q) => s + q.marks, 0),
    difficulty:   document.getElementById('difficultyFilter').value,
    type:         document.getElementById('examType').value,
    questions:    state.examQuestions,
    status:       status,
    createdAt:    new Date().toISOString(),
  };
}

// ─── Save / Draft / Publish ──────────────────────
function saveDraft() {
  const exam = buildExamObject('draft');
  try { localStorage.setItem('cc_draft_exam', JSON.stringify(exam)); } catch (_) {}
  showToast('Draft saved!', 'success');
}

function saveExam() {
  if (!document.getElementById('examTitle').value.trim()) { showToast('Please enter an exam title', 'error'); return; }
  if (!state.examQuestions.length) { showToast('Add at least one question', 'error'); return; }
  const exam = buildExamObject('saved');
  appendExamToList(exam);
  try { localStorage.setItem('cc_draft_exam', JSON.stringify(exam)); } catch (_) {}
  showToast('Exam saved!', 'success');
}

function publishExam() {
  if (!document.getElementById('examTitle').value.trim()) { showToast('Please enter an exam title before publishing', 'error'); return; }
  if (!state.examQuestions.length) { showToast('Add at least one question before publishing', 'error'); return; }
  const exam = buildExamObject('published');
  appendExamToList(exam);
  try {
    // Keep the published snapshot as the draft so it restores on reload
    localStorage.setItem('cc_draft_exam', JSON.stringify(exam));
  } catch (_) {}
  showPublishModal(exam);
}

function startNewExam() {
  if (!confirm('Start a new exam? Your current exam is already published and saved.')) return;
  // Clear the current exam session so next build gets a fresh ID
  localStorage.removeItem('cc_draft_exam');
  localStorage.removeItem('cc_current_exam_id');
  state.currentExamId = null;
  state.examQuestions = [];
  document.getElementById('examTitle').value    = '';
  document.getElementById('examDesc').value     = '';
  document.getElementById('examDuration').value = '';
  syncAll();
  renderQuestionsTable();
  showToast('Ready to build a new exam', 'success');
}

function showPublishModal(exam) {
  // Build the student link: login.html?exam=<id>
  // Works for both local files and any hosted domain
  const base = window.location.href.replace(/exambuilder\.html.*$/, '');
  const link = `${base}login.html?exam=${exam.id}`;

  document.getElementById('publishModalSub').textContent =
    `"${exam.title}" is now live — ${exam.numQuestions} questions · ${exam.subject || 'No subject'}`;
  document.getElementById('publishLinkInput').value  = link;
  document.getElementById('publishOpenLink').href    = link;

  // Reset copy button
  const copyBtn = document.getElementById('btnCopyLink');
  copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
  copyBtn.classList.remove('copied');

  document.getElementById('publishModal').classList.add('open');
}

function copyExamLink() {
  const input = document.getElementById('publishLinkInput');
  const btn   = document.getElementById('btnCopyLink');
  try {
    navigator.clipboard.writeText(input.value).then(() => {
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
        btn.classList.remove('copied');
      }, 2500);
    });
  } catch (_) {
    input.select();
    document.execCommand('copy');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
      btn.classList.remove('copied');
    }, 2500);
  }
}

function closePublishModal(e) {
  if (!e || e.target === document.getElementById('publishModal')) {
    document.getElementById('publishModal').classList.remove('open');
  }
}

function appendExamToList(exam) {
  // ── Always save to localStorage (offline/local dev) ──
  try {
    const raw  = localStorage.getItem('cc_exams') || '[]';
    const list = JSON.parse(raw) || [];
    const idx  = list.findIndex(e => e.id === exam.id);
    if (idx > -1) list[idx] = exam; else list.push(exam);
    localStorage.setItem('cc_exams', JSON.stringify(list));
  } catch (_) {}

  // ── Also push to Firebase so the exam link works on any device ──
  if (window.CCDB) {
    CCDB.saveExam(exam).catch(function () {});
  }
}

// ─── Restore draft on page open ─────────────────
function loadDraft() {
  try {
    const raw = localStorage.getItem('cc_draft_exam');
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft) return;

    // Restore the stable exam ID so saves/publishes keep the same ID
    if (draft.id) {
      state.currentExamId = draft.id;
      localStorage.setItem('cc_current_exam_id', draft.id);
    }

    if (draft.title)        document.getElementById('examTitle').value       = draft.title;
    if (draft.description)  document.getElementById('examDesc').value        = draft.description;
    if (draft.duration)     document.getElementById('examDuration').value    = draft.duration;
    if (draft.durationUnit) document.getElementById('durationUnit').value    = draft.durationUnit;
    if (draft.difficulty)   document.getElementById('difficultyFilter').value = draft.difficulty;
    if (draft.type)         document.getElementById('examType').value        = draft.type;

    if (draft.subject) {
      document.getElementById('subjectSelect').value = draft.subject;
      onSubjectChange();
    }

    // Restore questions — include even if not in the current question bank
    // (they're stored in full inside the draft)
    if (Array.isArray(draft.questions) && draft.questions.length) {
      draft.questions.forEach(dq => {
        if (!state.examQuestions.some(eq => eq.id === dq.id)) {
          state.examQuestions.push(dq);
        }
      });
      syncAll();
      renderQuestionsTable();
      showToast(`Exam restored (${draft.questions.length} question${draft.questions.length !== 1 ? 's' : ''})`, 'info');
    } else if (draft.title) {
      showToast('Exam details restored', 'info');
    }

    updatePreview();
    updatePreviewStats();
  } catch (_) {}
}

// ─── Preview Modal ───────────────────────────────
function previewExam() {
  const title    = document.getElementById('examTitle').value.trim() || 'Untitled Exam';
  const subject  = document.getElementById('subjectSelect').value || '—';
  const duration = document.getElementById('examDuration').value || '0';
  const marks    = state.examQuestions.reduce((s, q) => s + q.marks, 0);
  const count    = state.examQuestions.length;

  document.getElementById('modalTitle').textContent = `Preview: ${title}`;

  let html = `
    <div class="modal-stat-row">
      <div class="modal-stat"><div class="modal-stat-val">${count}</div><div class="modal-stat-lbl">Questions</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${duration}</div><div class="modal-stat-lbl">Minutes</div></div>
      <div class="modal-stat"><div class="modal-stat-val">${marks}</div><div class="modal-stat-lbl">Total Marks</div></div>
    </div>
    <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px;">Subject: <strong>${escHtml(subject)}</strong></p>`;

  if (!count) {
    html += `<div class="empty-state" style="padding:30px 0;">
      <div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>
      <h3>No Questions Added</h3>
      <p>Add questions from the table to preview the exam.</p>
    </div>`;
  } else {
    html += `<div class="modal-q-list">`;
    state.examQuestions.forEach((q, i) => {
      html += `
        <div class="modal-q-item">
          <div class="modal-q-num">Question ${i + 1}</div>
          <div class="modal-q-text">${mathHtml(q.question)}</div>
          <div class="modal-q-meta">
            <span>${escHtml(q.topic || '—')}</span>
            <span>${diffBadge(q.difficulty)}</span>
            <span>${q.marks} Mark${q.marks !== 1 ? 's' : ''}</span>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('previewModal').classList.add('open');
}

function closeModal() { document.getElementById('previewModal').classList.remove('open'); }
function closePreviewModal(e) { if (e.target === document.getElementById('previewModal')) closeModal(); }

// ─── Export PDF ──────────────────────────────────
function exportPDF() {
  if (!state.examQuestions.length) { showToast('Add questions before exporting', 'error'); return; }
  const title    = document.getElementById('examTitle').value.trim() || 'Exam';
  const subject  = document.getElementById('subjectSelect').value || '';
  const duration = document.getElementById('examDuration').value || '—';
  const marks    = state.examQuestions.reduce((s, q) => s + q.marks, 0);

  const printWin = window.open('', '_blank');
  let body = `<html><head><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:40px;color:#111;}
      h1{color:#2563eb;} .meta{color:#6b7280;font-size:13px;margin-bottom:24px;}
      .q{margin-bottom:20px;padding:14px;border:1px solid #e5e7eb;border-radius:8px;}
      .q-num{font-weight:700;color:#2563eb;font-size:12px;}
      .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;}
      .easy{background:#d1fae5;color:#059669;}.medium{background:#fef3c7;color:#b45309;}.hard{background:#fee2e2;color:#dc2626;}
      ol{margin-top:8px;padding-left:20px;}
    </style></head><body>
    <h1>${title}</h1>
    <div class="meta">Subject: ${subject} | Duration: ${duration} mins | Total Marks: ${marks} | Questions: ${state.examQuestions.length}</div>`;

  state.examQuestions.forEach((q, i) => {
    const d = (q.difficulty || 'Easy').toLowerCase();
    body += `<div class="q">
      <div class="q-num">Question ${i + 1} &nbsp; <span class="badge ${d}">${q.difficulty}</span> &nbsp; ${q.marks} mark${q.marks !== 1 ? 's' : ''}</div>
      <p>${mathHtml(q.question)}</p>`;
    if (q.options && typeof q.options === 'object') {
      body += '<ol type="A">' + Object.values(q.options).map(o => `<li>${mathHtml(o)}</li>`).join('') + '</ol>';
    }
    body += `</div>`;
  });

  body += `</body></html>`;
  printWin.document.write(body);
  printWin.document.close();
  setTimeout(() => printWin.print(), 400);
  showToast('Opening print dialog…', 'info');
}

// ─── Sidebar toggle (mobile) ────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open    = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', open);
}

// ─── Utilities ───────────────────────────────────
function diffBadge(diff) {
  const d   = (diff || 'Easy').toLowerCase();
  const cls = d === 'easy' ? 'badge-easy' : d === 'medium' ? 'badge-medium' : 'badge-hard';
  return `<span class="badge ${cls}">${escHtml(diff || 'Easy')}</span>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : str;
}

let _toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ─── RANDOM PICK FEATURE ────────────────────────
function onRndScopeChange() {
  const scope = document.getElementById('rndScope').value;
  document.getElementById('rndTopicWrap').style.display = scope === 'topic' ? '' : 'none';
  updateRandomPoolInfo();
}

function populateRandomTopicDropdown() {
  const subject = document.getElementById('subjectSelect').value;
  const sel = document.getElementById('rndTopic');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Pick Topic --</option>';
  if (!subject) return;
  getTopicsForSubject(subject).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
}

function getRandomPool() {
  const subject = document.getElementById('subjectSelect').value;
  if (!subject) return [];
  const scope = document.getElementById('rndScope').value;
  const topic = document.getElementById('rndTopic').value;
  const diff  = document.getElementById('rndDiff').value;
  return state.allQuestions.filter(q => {
    if (q.subject !== subject) return false;
    if (scope === 'topic' && topic && q.topic !== topic) return false;
    if (diff !== 'all' && q.difficulty !== diff) return false;
    return true;
  });
}

function updateRandomPoolInfo() {
  const info = document.getElementById('rndPoolInfo');
  if (!info) return;
  const subject = document.getElementById('subjectSelect').value;
  if (!subject) { info.textContent = 'Select a subject first.'; return; }
  const pool = getRandomPool();
  info.textContent = `${pool.length} question${pool.length !== 1 ? 's' : ''} available in pool`;
}

// Re-update pool info whenever scope/topic/diff change
document.addEventListener('change', (e) => {
  if (['rndScope','rndTopic','rndDiff'].includes(e.target.id)) updateRandomPoolInfo();
});

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPickQuestions() {
  const subject = document.getElementById('subjectSelect').value;
  if (!subject) { showToast('Pick a subject first', 'error'); return; }

  const scope = document.getElementById('rndScope').value;
  if (scope === 'topic' && !document.getElementById('rndTopic').value) {
    showToast('Choose a topic', 'error'); return;
  }

  const count    = parseInt(document.getElementById('rndCount').value, 10);
  const duration = parseInt(document.getElementById('rndDuration').value, 10);
  if (!count || count < 1)       { showToast('Enter how many questions', 'error'); return; }
  if (!duration || duration < 1) { showToast('Enter exam duration (mins)', 'error'); return; }

  const pool = getRandomPool();
  if (!pool.length) { showToast('No questions match — try a different filter', 'error'); return; }

  const replace = document.getElementById('rndReplace').checked;
  const existingIds = replace ? new Set() : new Set(state.examQuestions.map(q => q.id));
  const candidates = pool.filter(q => !existingIds.has(q.id));

  const take = Math.min(count, candidates.length);
  const picked = shuffleArray(candidates).slice(0, take);

  if (replace) state.examQuestions = [];
  picked.forEach(q => state.examQuestions.push({ ...q }));

  // Apply duration & set duration unit to mins
  const durEl = document.getElementById('examDuration');
  const unitEl = document.getElementById('durationUnit');
  if (durEl) durEl.value = duration;
  if (unitEl) unitEl.value = 'mins';

  // Refresh UI
  renderQuestionsTable();
  syncAll();
  scheduleAutosave();

  if (take < count) {
    showToast(`Only ${take} question(s) available — picked all of them`, 'success');
  } else {
    showToast(`Picked ${take} random question(s)`, 'success');
  }
}
