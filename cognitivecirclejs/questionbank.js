// ── MATH SAFETY FALLBACK ──
// If mathrender.js failed to load (wrong path, offline CDN, etc.) fall back
// to plain HTML-escaping so questions still display without math rendering.
if (typeof window.mathHtml !== 'function') {
  window.mathHtml = function(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

// ── STORAGE HELPERS ──
const storage = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ── STATE ──
let questions    = storage.get('qb_questions')    || [];
let deletedQs    = storage.get('qb_deleted')      || [];
let subjects     = storage.get('qb_subjects')     || [];
let topics       = storage.get('qb_topics')       || []; // [{id, name, subjectId}]
let currentPage  = 1;
const PAGE_SIZE  = 10;
let editIndex    = null;
let deleteIndex  = null;
let attachedImage = null; // base64 for new question
let editAttachedImage = null;

// ── SUBJECT COLORS ──
const SUBJECT_COLORS = ['sc-0','sc-1','sc-2','sc-3','sc-4','sc-5','sc-6','sc-7'];

function subjectColorClass(name) {
  const idx = subjects.findIndex(s => s === name);
  return SUBJECT_COLORS[idx % SUBJECT_COLORS.length] || 'sc-0';
}

// ── SAVE ──
function save() {
  storage.set('qb_questions', questions);
  storage.set('qb_deleted', deletedQs);
  storage.set('qb_subjects', subjects);
  storage.set('qb_topics', topics);
}

// ── TOAST ──
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── POPULATE SELECTS ──
function populateSubjectSelects() {
  const selIds = ['selectSubject', 'filterSubject', 'editSubject', 'topicSubjectSelect'];
  selIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = id === 'filterSubject' ? '<option value="">All Subjects</option>'
                 : id === 'topicSubjectSelect' ? '<option value="">Pick subject</option>'
                 : '<option value="">Select Subject</option>';
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      el.appendChild(opt);
    });
    el.value = val;
  });
}

function populateTopicSelects(subjectFilter, targetIds) {
  const ids = targetIds || ['selectTopic', 'filterTopic', 'editTopic'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = id === 'filterTopic' ? '<option value="">All Topics</option>'
                 : '<option value="">Select Topic</option>';
    const filtered = subjectFilter
      ? topics.filter(t => t.subjectId === subjectFilter)
      : topics;
    filtered.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name; opt.textContent = t.name;
      el.appendChild(opt);
    });
    el.value = val;
  });
}

// ── STATS & CHARTS ──
function updateStats() {
  const total   = questions.length;
  const active  = questions.filter(q => !q.draft).length;
  const draft   = questions.filter(q => q.draft).length;
  const uniqueSubjects = [...new Set(questions.map(q => q.subject).filter(Boolean))];
  const uniqueTopics   = [...new Set(questions.map(q => q.topic).filter(Boolean))];

  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statActive').textContent  = active;
  document.getElementById('statDraft').textContent   = draft;
  document.getElementById('statSubjects').textContent = subjects.length;
  document.getElementById('statTopics').textContent  = topics.length;
  document.getElementById('statActivePct').textContent = total ? (active/total*100).toFixed(1)+'%' : '0%';
  document.getElementById('statDraftPct').textContent  = total ? (draft/total*100).toFixed(1)+'%'  : '0%';
  document.getElementById('notifBadge').textContent  = draft;

  // donut
  const mcq = questions.filter(q => q.type === 'MCQ').length;
  const tf  = questions.filter(q => q.type === 'True/False').length;
  const sa  = questions.filter(q => q.type === 'Short Answer').length;
  const es  = questions.filter(q => q.type === 'Essay').length;

  document.getElementById('lgMCQ').textContent = mcq;
  document.getElementById('lgTF').textContent  = tf;
  document.getElementById('lgSA').textContent  = sa;
  document.getElementById('lgEssay').textContent = es;
  document.getElementById('donutCenter').textContent = total;
  drawDonut(mcq, tf, sa, es, total);

  // subjects overview
  const sl = document.getElementById('subjectsList');
  if (!subjects.length) {
    sl.innerHTML = '<li class="empty-msg">No subjects yet.</li>';
  } else {
    sl.innerHTML = subjects.map((s, i) => {
      const count = questions.filter(q => q.subject === s).length;
      const color = ['#3b82f6','#a855f7','#f59e0b','#22c55e','#ef4444','#14b8a6','#db2777','#ea580c'][i % 8];
      return `<li>
        <span class="subj-name"><span class="subj-dot" style="background:${color}"></span>${s}</span>
        <span class="subj-count">${count}</span>
      </li>`;
    }).join('');
  }
}

function drawDonut(mcq, tf, sa, es, total) {
  const canvas = document.getElementById('donutChart');
  const ctx = canvas.getContext('2d');
  const cx = 90, cy = 90, r = 70, strokeW = 22;
  ctx.clearRect(0, 0, 180, 180);

  const segments = [
    { value: mcq, color: '#3b82f6' },
    { value: tf,  color: '#22c55e' },
    { value: sa,  color: '#f59e0b' },
    { value: es,  color: '#a855f7' },
  ];

  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2*Math.PI);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = strokeW;
    ctx.stroke();
    return;
  }

  let startAngle = -Math.PI / 2;
  segments.forEach(seg => {
    const slice = (seg.value / total) * 2 * Math.PI;
    if (!slice) return;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = strokeW;
    ctx.lineCap = 'butt';
    ctx.stroke();
    startAngle += slice;
  });
}

// ── RENDER TABLE ──
function getFilteredQuestions() {
  const sub  = document.getElementById('filterSubject').value;
  const top  = document.getElementById('filterTopic').value;
  const type = document.getElementById('filterType').value;
  const diff = document.getElementById('filterDifficulty').value;

  return questions.filter(q =>
    (!sub  || q.subject    === sub)  &&
    (!top  || q.topic      === top)  &&
    (!type || q.type       === type) &&
    (!diff || q.difficulty === diff)
  );
}

function renderTable() {
  const filtered  = getFilteredQuestions();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById('questionsBody');
  tbody.innerHTML = '';

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">No questions found.</td></tr>';
    renderPagination(0, 0, totalPages);
    return;
  }

  page.forEach((q, i) => {
    const realIndex = questions.indexOf(q);
    const colorClass = subjectColorClass(q.subject);
    const diffClass = q.difficulty === 'Easy' ? 'diff-easy' : q.difficulty === 'Medium' ? 'diff-medium' : 'diff-hard';
    const statusClass = q.draft ? 'status-draft' : 'status-active';
    const statusLabel = q.draft ? 'Draft' : 'Active';
    const imgDot = q.image ? '<span class="has-image-indicator" title="Has image"></span>' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${start + i + 1}</td>
      <td><span class="q-text" title="${escHtml(q.text)}">${mathHtml(q.text)}${imgDot}</span></td>
      <td><span class="badge-subject ${colorClass}">${escHtml(q.subject)}</span></td>
      <td>${escHtml(q.topic)}</td>
      <td><span class="badge-type">${escHtml(q.type)}</span></td>
      <td><span class="badge-difficulty ${diffClass}">${escHtml(q.difficulty)}</span></td>
      <td><span class="badge-status ${statusClass}">${statusLabel}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit"   data-idx="${realIndex}" title="Edit"><i class="fas fa-pencil-alt"></i></button>
          <button class="action-btn copy"   data-idx="${realIndex}" title="Duplicate"><i class="fas fa-copy"></i></button>
          <button class="action-btn delete" data-idx="${realIndex}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  renderPagination(start, filtered.length, totalPages);
}

function renderPagination(start, total, totalPages) {
  const pg = document.getElementById('pagination');
  pg.innerHTML = '';

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderTable(); };
  pg.appendChild(prev);

  // show at most 5 page numbers
  const range = pageRange(currentPage, totalPages);
  range.forEach(p => {
    if (p === '...') {
      const span = document.createElement('span');
      span.textContent = '...';
      span.style.cssText = 'padding:0 4px;color:#64748b;font-size:12px;';
      pg.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
      btn.textContent = p;
      btn.onclick = () => { currentPage = p; renderTable(); };
      pg.appendChild(btn);
    }
  });

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.innerHTML = '<i class="fas fa-chevron-right"></i>';
  next.disabled = currentPage === totalPages;
  next.onclick = () => { currentPage++; renderTable(); };
  pg.appendChild(next);
}

function pageRange(cur, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i+1);
  if (cur <= 4) return [1,2,3,4,5,'...',total];
  if (cur >= total - 3) return [1,'...',total-4,total-3,total-2,total-1,total];
  return [1,'...',cur-1,cur,cur+1,'...',total];
}

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── ADD QUESTION ──
document.getElementById('btnAddQuestion').addEventListener('click', () => {
  // open manage modal to add subject/topic if none exist
  if (!subjects.length) {
    openManageModal();
    toast('Add subjects and topics first!', 'error');
    return;
  }
});

document.getElementById('btnSaveQuestion').addEventListener('click', () => {
  const text       = document.getElementById('questionText').value.trim();
  const subject    = document.getElementById('selectSubject').value;
  const topic      = document.getElementById('selectTopic').value;
  const type       = document.getElementById('selectType').value;
  const correctAns = document.getElementById('correctAnswer').value;
  const difficulty = document.getElementById('difficulty').value;
  const draft      = document.getElementById('markDraft').checked;
  const msg        = document.getElementById('formMsg');

  const optA = document.getElementById('optA').value.trim();
  const optB = document.getElementById('optB').value.trim();
  const optC = document.getElementById('optC').value.trim();
  const optD = document.getElementById('optD').value.trim();
  const explanation = document.getElementById('explanationText').value.trim();

  if (!text)       { msg.textContent = 'Please enter a question.'; return; }
  if (!subject)    { msg.textContent = 'Please select a subject.'; return; }
  if (!type)       { msg.textContent = 'Please select a question type.'; return; }
  if (!difficulty) { msg.textContent = 'Please select difficulty.'; return; }
  if (type === 'MCQ' && (!optA || !optB || !optC || !optD)) {
    msg.textContent = 'Please fill all 4 options for MCQ.'; return;
  }
  if (type === 'MCQ' && !correctAns) {
    msg.textContent = 'Please select the correct answer.'; return;
  }

  msg.textContent = '';

  const q = {
    text, subject, topic, type, difficulty, draft,
    options: type === 'MCQ' ? { A: optA, B: optB, C: optC, D: optD } : null,
    correctAnswer: correctAns,
    explanation: explanation || null,
    image: attachedImage || null,
    createdAt: Date.now(),
  };

  questions.unshift(q);
  save();
  attachedImage = null;
  resetForm();
  updateStats();
  renderTable();
  toast('Question saved!', 'success');
});

function resetForm() {
  document.getElementById('questionText').value = '';
  document.getElementById('explanationText').value = '';
  document.getElementById('selectSubject').value = '';
  document.getElementById('selectTopic').value = '';
  document.getElementById('selectType').value = '';
  document.getElementById('correctAnswer').value = '';
  document.getElementById('difficulty').value = '';
  document.getElementById('markDraft').checked = false;
  ['optA','optB','optC','optD'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('imageName').textContent = '';
  document.getElementById('questionImage').value = '';
  document.getElementById('imagePreviewWrap').style.display = 'none';
  document.getElementById('imagePreview').src = '';
  attachedImage = null;
}

// ── IMAGE UPLOAD (NEW) ──
document.getElementById('questionImage').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    attachedImage = e.target.result;
    document.getElementById('imagePreview').src = attachedImage;
    document.getElementById('imagePreviewWrap').style.display = 'block';
    document.getElementById('imageName').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btnRemoveImage').addEventListener('click', () => {
  attachedImage = null;
  document.getElementById('questionImage').value = '';
  document.getElementById('imageName').textContent = '';
  document.getElementById('imagePreviewWrap').style.display = 'none';
  document.getElementById('imagePreview').src = '';
});

// ── TYPE CHANGE ──
document.getElementById('selectType').addEventListener('change', function() {
  document.getElementById('optionsSection').style.display =
    this.value === 'MCQ' ? 'block' : 'none';
});

// ── SUBJECT → TOPIC CHAIN ──
document.getElementById('selectSubject').addEventListener('change', function() {
  populateTopicSelects(this.value, ['selectTopic']);
});

// ── TABLE ACTION DELEGATION ──
document.getElementById('questionsBody').addEventListener('click', e => {
  const editBtn   = e.target.closest('.action-btn.edit');
  const copyBtn   = e.target.closest('.action-btn.copy');
  const deleteBtn = e.target.closest('.action-btn.delete');

  if (editBtn)   openEditModal(+editBtn.dataset.idx);
  if (copyBtn)   duplicateQuestion(+copyBtn.dataset.idx);
  if (deleteBtn) openDeleteModal(+deleteBtn.dataset.idx);
});

// ── DUPLICATE ──
function duplicateQuestion(idx) {
  const copy = { ...questions[idx], createdAt: Date.now() };
  copy.text = copy.text + ' (Copy)';
  questions.splice(idx, 0, copy);
  save();
  updateStats();
  renderTable();
  toast('Question duplicated!', 'success');
}

// ── EDIT MODAL ──
function openEditModal(idx) {
  editIndex = idx;
  const q = questions[idx];
  populateSubjectSelects();
  populateTopicSelects(q.subject, ['editTopic']);

  document.getElementById('editSubject').value          = q.subject || '';
  document.getElementById('editTopic').value            = q.topic   || '';
  document.getElementById('editType').value             = q.type    || '';
  document.getElementById('editQuestionText').value     = q.text    || '';
  document.getElementById('editCorrectAnswer').value    = q.correctAnswer || '';
  document.getElementById('editDifficulty').value       = q.difficulty || '';
  document.getElementById('editMarkDraft').checked      = q.draft || false;
  document.getElementById('editExplanationText').value  = q.explanation || '';

  if (q.options) {
    document.getElementById('editOptA').value = q.options.A || '';
    document.getElementById('editOptB').value = q.options.B || '';
    document.getElementById('editOptC').value = q.options.C || '';
    document.getElementById('editOptD').value = q.options.D || '';
    document.getElementById('editOptionsSection').style.display = 'block';
  } else {
    document.getElementById('editOptionsSection').style.display = 'none';
  }

  if (q.image) {
    editAttachedImage = q.image;
    document.getElementById('editImagePreview').src = q.image;
    document.getElementById('editImagePreviewWrap').style.display = 'block';
  } else {
    editAttachedImage = null;
    document.getElementById('editImagePreviewWrap').style.display = 'none';
  }

  document.getElementById('editModal').classList.add('open');
}

document.getElementById('editType').addEventListener('change', function() {
  document.getElementById('editOptionsSection').style.display =
    this.value === 'MCQ' ? 'block' : 'none';
});

document.getElementById('editSubject').addEventListener('change', function() {
  populateTopicSelects(this.value, ['editTopic']);
});

document.getElementById('editQuestionImage').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    editAttachedImage = e.target.result;
    document.getElementById('editImagePreview').src = editAttachedImage;
    document.getElementById('editImagePreviewWrap').style.display = 'block';
    document.getElementById('editImageName').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

document.getElementById('editBtnRemoveImage').addEventListener('click', () => {
  editAttachedImage = null;
  document.getElementById('editQuestionImage').value = '';
  document.getElementById('editImageName').textContent = '';
  document.getElementById('editImagePreviewWrap').style.display = 'none';
  document.getElementById('editImagePreview').src = '';
});

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  editIndex = null;
}

document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
document.getElementById('cancelEditModal').addEventListener('click', closeEditModal);

document.getElementById('btnSaveEdit').addEventListener('click', () => {
  if (editIndex === null) return;
  const q = questions[editIndex];

  const text       = document.getElementById('editQuestionText').value.trim();
  const subject    = document.getElementById('editSubject').value;
  const topic      = document.getElementById('editTopic').value;
  const type       = document.getElementById('editType').value;
  const difficulty = document.getElementById('editDifficulty').value;
  const draft      = document.getElementById('editMarkDraft').checked;
  const correctAns = document.getElementById('editCorrectAnswer').value;
  const optA = document.getElementById('editOptA').value.trim();
  const optB = document.getElementById('editOptB').value.trim();
  const optC = document.getElementById('editOptC').value.trim();
  const optD = document.getElementById('editOptD').value.trim();
  const explanation = document.getElementById('editExplanationText').value.trim();

  if (!text || !subject || !type || !difficulty) {
    toast('Please fill required fields.', 'error'); return;
  }

  questions[editIndex] = {
    ...q, text, subject, topic, type, difficulty, draft,
    options: type === 'MCQ' ? { A: optA, B: optB, C: optC, D: optD } : null,
    correctAnswer: correctAns,
    explanation: explanation || null,
    image: editAttachedImage || null,
  };

  save();
  closeEditModal();
  updateStats();
  renderTable();
  toast('Question updated!', 'success');
});

// ── DELETE MODAL ──
function openDeleteModal(idx) {
  deleteIndex = idx;
  document.getElementById('deleteModal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  deleteIndex = null;
}

document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
document.getElementById('cancelDeleteModal').addEventListener('click', closeDeleteModal);

document.getElementById('btnConfirmDelete').addEventListener('click', () => {
  if (deleteIndex === null) return;
  const removed = questions.splice(deleteIndex, 1)[0];
  removed.deletedAt = Date.now();
  deletedQs.push(removed);
  save();
  closeDeleteModal();
  updateStats();
  renderTable();
  toast('Question deleted.', '');
});

// ── FILTERS ──
document.getElementById('filterSubject').addEventListener('change', function() {
  populateTopicSelects(this.value, ['filterTopic']);
  currentPage = 1; renderTable();
});
['filterTopic','filterType','filterDifficulty'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { currentPage = 1; renderTable(); });
});

document.querySelector('.btn-filter').addEventListener('click', () => { currentPage = 1; renderTable(); });

// ── MANAGE SUBJECTS / TOPICS MODAL ──
function openManageModal() {
  populateSubjectSelects();
  renderManageLists();
  document.getElementById('manageModal').classList.add('open');
}

function closeManageModal() {
  document.getElementById('manageModal').classList.remove('open');
  populateSubjectSelects();
  populateTopicSelects('', ['selectTopic','filterTopic']);
  updateStats();
  renderTable();
}

document.getElementById('closeManageModal').addEventListener('click', closeManageModal);
document.getElementById('closeManageBtn').addEventListener('click', closeManageModal);

document.getElementById('btnAddSubject').addEventListener('click', () => {
  const val = document.getElementById('newSubjectInput').value.trim();
  if (!val) return;
  if (subjects.includes(val)) { toast('Subject already exists.', 'error'); return; }
  subjects.push(val);
  save();
  document.getElementById('newSubjectInput').value = '';
  populateSubjectSelects();
  renderManageLists();
  toast('Subject added!', 'success');
});

document.getElementById('btnAddTopic').addEventListener('click', () => {
  const subj = document.getElementById('topicSubjectSelect').value;
  const val  = document.getElementById('newTopicInput').value.trim();
  if (!subj) { toast('Pick a subject first.', 'error'); return; }
  if (!val)  return;
  if (topics.find(t => t.name === val && t.subjectId === subj)) {
    toast('Topic already exists for this subject.', 'error'); return;
  }
  topics.push({ id: Date.now(), name: val, subjectId: subj });
  save();
  document.getElementById('newTopicInput').value = '';
  renderManageLists();
  toast('Topic added!', 'success');
});

function renderManageLists() {
  const sl = document.getElementById('subjectManageList');
  sl.innerHTML = subjects.length
    ? subjects.map(s => `<li>${s}<button class="del-item-btn" data-subject="${escHtml(s)}"><i class="fas fa-times"></i></button></li>`).join('')
    : '<li style="color:#94a3b8;font-size:12px;">No subjects yet.</li>';

  // re-populate topic subject dropdown
  const tss = document.getElementById('topicSubjectSelect');
  const tssVal = tss.value;
  tss.innerHTML = '<option value="">Pick subject</option>';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    tss.appendChild(opt);
  });
  tss.value = tssVal;

  const tl = document.getElementById('topicManageList');
  if (!topics.length && !subjects.length) {
    tl.innerHTML = '<li style="color:#94a3b8;font-size:12px;">No topics yet.</li>';
  } else {
    // Group topics by subject; show every subject header (even if empty)
    const groups = subjects.map(s => ({
      subject: s,
      items: topics.filter(t => t.subjectId === s)
    }));
    // Catch any orphan topics whose subject was deleted
    const orphans = topics.filter(t => !subjects.includes(t.subjectId));
    if (orphans.length) groups.push({ subject: 'Unassigned', items: orphans });

    tl.innerHTML = groups.map(g => {
      const header = `<li class="group-header">${escHtml(g.subject)} <span style="opacity:.7;font-weight:600;">(${g.items.length})</span></li>`;
      const items = g.items.length
        ? g.items.map(t => `<li class="topic-item"><span class="topic-name">${escHtml(t.name)}</span><button class="del-item-btn" data-topicid="${t.id}" title="Delete topic"><i class="fas fa-times"></i></button></li>`).join('')
        : `<li class="empty-group">No topics in this subject yet.</li>`;
      return header + items;
    }).join('');
  }
}

document.getElementById('subjectManageList').addEventListener('click', e => {
  const btn = e.target.closest('.del-item-btn[data-subject]');
  if (!btn) return;
  const s = btn.dataset.subject;
  subjects = subjects.filter(x => x !== s);
  topics   = topics.filter(t => t.subjectId !== s);
  save();
  populateSubjectSelects();
  renderManageLists();
});

document.getElementById('topicManageList').addEventListener('click', e => {
  const btn = e.target.closest('.del-item-btn[data-topicid]');
  if (!btn) return;
  topics = topics.filter(t => String(t.id) !== btn.dataset.topicid);
  save();
  renderManageLists();
});

// Hook up Settings nav item to open manage modal
document.querySelector('.nav-item[href="#"]') &&
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.textContent.trim() === 'Settings') {
      el.addEventListener('click', e => { e.preventDefault(); openManageModal(); });
    }
  });

// ── DELETED QUESTIONS MODAL ──
function openDeletedModal() {
  const tbody = document.getElementById('deletedBody');
  tbody.innerHTML = deletedQs.length
    ? deletedQs.map((q, i) => `
        <tr>
          <td>${i+1}</td>
          <td><span class="q-text" title="${escHtml(q.text)}">${escHtml(q.text)}</span></td>
          <td>${escHtml(q.subject)}</td>
          <td><span class="badge-type">${escHtml(q.type)}</span></td>
          <td>
            <button class="btn-outline" style="font-size:12px;padding:4px 10px;" onclick="restoreQuestion(${i})">Restore</button>
            <button class="btn-danger" style="font-size:12px;padding:4px 10px;margin-left:6px;" onclick="permDelete(${i})">Perm. Delete</button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty-msg">No deleted questions.</td></tr>';
  document.getElementById('deletedModal').classList.add('open');
}

window.restoreQuestion = function(idx) {
  const q = deletedQs.splice(idx, 1)[0];
  delete q.deletedAt;
  questions.unshift(q);
  save();
  updateStats();
  renderTable();
  openDeletedModal();
  toast('Question restored!', 'success');
};

window.permDelete = function(idx) {
  deletedQs.splice(idx, 1);
  save();
  openDeletedModal();
  toast('Permanently deleted.', '');
};

document.getElementById('closeDeletedModal').addEventListener('click', () => {
  document.getElementById('deletedModal').classList.remove('open');
});

document.getElementById('qaDeleted').addEventListener('click', openDeletedModal);

// ── QUICK ACTIONS ──
document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('qaBulkImport').click();
});

document.getElementById('qaBulkImport').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('Invalid format');
        questions = [...data, ...questions];
        save();
        updateStats();
        renderTable();
        toast(`Imported ${data.length} questions!`, 'success');
      } catch { toast('Invalid JSON file.', 'error'); }
    };
    reader.readAsText(file);
  };
  input.click();
});

document.getElementById('qaExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'questions_export.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Exported!', 'success');
});

document.getElementById('qaTemplate').addEventListener('click', () => {
  const template = [{
    text: "Sample question text?",
    subject: "Biology",
    topic: "Cell Biology",
    type: "MCQ",
    difficulty: "Easy",
    draft: false,
    options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" },
    correctAnswer: "A",
    explanation: "Option A is correct because it best describes the concept of...",
    image: null
  }];
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'question_template.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Template downloaded!', 'success');
});

// ── CLOSE MODALS ON OVERLAY CLICK ──
['editModal','manageModal','deleteModal','deletedModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('open');
      if (id === 'editModal') editIndex = null;
      if (id === 'deleteModal') deleteIndex = null;
    }
  });
});

// ── MANAGE button accessible from stat cards ──
document.getElementById('statSubjects').closest('.stat-card').style.cursor = 'pointer';
document.getElementById('statSubjects').closest('.stat-card').addEventListener('click', openManageModal);
document.getElementById('statTopics').closest('.stat-card').style.cursor = 'pointer';
document.getElementById('statTopics').closest('.stat-card').addEventListener('click', openManageModal);

// ── INIT ──
populateSubjectSelects();
populateTopicSelects('', ['selectTopic','filterTopic','editTopic']);
updateStats();
renderTable();
