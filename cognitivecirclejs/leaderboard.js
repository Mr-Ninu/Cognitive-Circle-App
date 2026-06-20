/* ══════════════════════════════════════════════════════════
   THE COGNITIVE CIRCLE — Leaderboard JS
   Reads:  cc_results  → all submitted exam attempts
   Shows:  Podium top-3, full ranked table, subject breakdown
   ══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // ── Sidebar toggle ─────────────────────────────────────
  const sidebar   = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  toggleBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) sidebar.classList.toggle('open');
    else sidebar.classList.toggle('collapsed');
    setTimeout(() => lucide.createIcons(), 50);
  });
  document.addEventListener('click', e => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && !toggleBtn.contains(e.target))
      sidebar.classList.remove('open');
  });

  // ── Load & process data ────────────────────────────────
  const results  = await loadResults();
  const students = buildStudentMap(results);

  // ── Populate exam filter dropdown ──────────────────────
  populateExamFilter(results);

  // ── Initial render ─────────────────────────────────────
  render(students, results);

  // ── Control listeners ──────────────────────────────────
  document.getElementById('examFilter').addEventListener('change', () => render(students, results));
  document.getElementById('sortSelect').addEventListener('change', () => render(students, results));
  document.getElementById('searchInput').addEventListener('input', () => render(students, results));

  // ── Export CSV ─────────────────────────────────────────
  document.getElementById('exportBtn').addEventListener('click', () => exportCSV(students));

  // ── Real-time result updates ────────────────────────────
  window.addEventListener('resultSubmitted', async (e) => {
    const newResult = e.detail;
    if (newResult) {
      results.push(newResult);
      const student = buildStudentMap([newResult]);
      Object.assign(students, student);
      // Re-render leaderboard
      render(students, results);
      // Show toast notification
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = `🎉 New result from ${newResult.candidate?.name || 'a student'}!`;
        toast.className = 'toast show success';
        setTimeout(() => toast.classList.remove('show'), 3000);
      }
    }
  });

  // ── Modal close ────────────────────────────────────────
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('studentModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});

/* ═══════════════════════════════════════════════════════════
   DATA LAYER
═══════════════════════════════════════════════════════════ */
async function loadResults() {
  // Firebase first, then localStorage fallback
  if (window.CCDB) {
    try {
      const list = await CCDB.getResults();
      if (list && list.length) return list;
    } catch (_) {}
  }
  try { return JSON.parse(localStorage.getItem('cc_results')) || []; }
  catch { return []; }
}

function buildStudentMap(results) {
  const map = {};

  results.forEach(r => {
    const key = r.candidate?.regNumber || r.candidate?.name || 'unknown';
    if (!map[key]) {
      map[key] = {
        key,
        name:      r.candidate?.name      || 'Unknown Student',
        regNumber: r.candidate?.regNumber || '—',
        programme: r.candidate?.programme || '—',
        attempts:  [],
      };
    }
    map[key].attempts.push({
      examTitle:  r.examTitle  || 'Untitled Exam',
      subject:    r.subject    || '—',
      percentage: r.percentage ?? 0,
      correct:    r.correct    ?? 0,
      wrong:      r.wrong      ?? 0,
      skipped:    r.skipped    ?? 0,
      marksEarned: r.marksEarned ?? 0,
      totalMarks: r.totalMarks ?? r.totalQuestions ?? 0,
      submitTime: r.submitTime || null,
    });
  });

  // Derive aggregate stats per student
  return Object.values(map).map(s => {
    const pcts   = s.attempts.map(a => a.percentage);
    s.avgScore   = pcts.length ? Math.round(pcts.reduce((a,b) => a+b, 0) / pcts.length) : 0;
    s.bestScore  = pcts.length ? Math.max(...pcts) : 0;
    s.examsTaken = s.attempts.length;
    s.bestGrade  = gradeFor(s.bestScore);

    // Most recent attempt
    const sorted = [...s.attempts].sort((a,b) => new Date(b.submitTime) - new Date(a.submitTime));
    s.lastExam   = sorted[0]?.examTitle || '—';
    s.lastTime   = sorted[0]?.submitTime || null;
    return s;
  });
}

/* ═══════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════ */
function render(allStudents, allResults) {
  const examFilter  = document.getElementById('examFilter').value;
  const sortBy      = document.getElementById('sortSelect').value;
  const searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();

  // Filter students
  let students = allStudents;

  if (examFilter) {
    // Only students who attempted the selected exam
    students = students.map(s => {
      const filtered = s.attempts.filter(a => a.examTitle === examFilter);
      if (!filtered.length) return null;
      const pcts = filtered.map(a => a.percentage);
      return {
        ...s,
        attempts:   filtered,
        avgScore:   Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length),
        bestScore:  Math.max(...pcts),
        examsTaken: filtered.length,
        bestGrade:  gradeFor(Math.max(...pcts)),
      };
    }).filter(Boolean);
  }

  if (searchQuery) {
    students = students.filter(s =>
      s.name.toLowerCase().includes(searchQuery) ||
      s.regNumber.toLowerCase().includes(searchQuery) ||
      s.programme.toLowerCase().includes(searchQuery)
    );
  }

  // Sort
  students = sortStudents(students, sortBy);

  // Render sections
  buildPodium(students);
  buildTable(students, searchQuery);
  buildSubjectBreakdown(allResults, examFilter);
  updateTotalLabel(students.length);
}

function sortStudents(list, by) {
  const copy = [...list];
  switch (by) {
    case 'best':  copy.sort((a,b) => b.bestScore  - a.bestScore);  break;
    case 'taken': copy.sort((a,b) => b.examsTaken - a.examsTaken); break;
    case 'name':  copy.sort((a,b) => a.name.localeCompare(b.name));break;
    default:      copy.sort((a,b) => b.avgScore   - a.avgScore);   break;
  }
  return copy;
}

/* ── Podium (top 3) ───────────────────────────────────────── */
const PODIUM_COLORS = ['#4285F4','#34A853','#F9AB00','#EA4335','#9C27B0','#00ACC1'];

function buildPodium(students) {
  const section = document.getElementById('podiumSection');
  section.innerHTML = '';

  if (!students.length) {
    section.innerHTML = `
      <div class="lb-hero-empty">
        <i data-lucide="trophy"></i>
        <p>No exam results yet. Once students complete exams, they'll appear here.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  const top = students.slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [0, 1] : [0];
  const heights = ['90px','60px','40px'];
  const crowns  = ['👑','🥈','🥉'];
  const rankNum = ['1','2','3'];

  order.forEach(idx => {
    if (!top[idx]) return;
    const s      = top[idx];
    const rank   = idx + 1;
    const initials = initials2(s.name);
    const color  = PODIUM_COLORS[idx % PODIUM_COLORS.length];

    const col = document.createElement('div');
    col.className = `podium-col podium-col--${rank}`;
    col.innerHTML = `
      ${rank === 1 ? `<span class="podium-crown">👑</span>` : ''}
      <div class="podium-avatar" style="background:${color}">
        ${initials}
        ${rank === 2 ? `<span style="position:absolute;top:-14px;font-size:18px;">🥈</span>` : ''}
        ${rank === 3 ? `<span style="position:absolute;top:-14px;font-size:18px;">🥉</span>` : ''}
      </div>
      <div class="podium-name">${escHtml(s.name)}</div>
      <div class="podium-score">${s.avgScore}% avg</div>
      <div class="podium-block" style="height:${heights[rank-1]}">${rank}</div>
    `;
    section.appendChild(col);
  });

  lucide.createIcons();
}

/* ── Full table ───────────────────────────────────────────── */
function buildTable(students, searchQuery) {
  const tbody = document.getElementById('lbTableBody');
  tbody.innerHTML = '';

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="lb-empty">
      ${searchQuery ? `No students match "<strong>${escHtml(searchQuery)}</strong>".` : 'No results found. Students who complete exams will appear here.'}
    </td></tr>`;
    return;
  }

  students.forEach((s, i) => {
    const rank  = i + 1;
    const color = PODIUM_COLORS[i % PODIUM_COLORS.length];
    const tr = document.createElement('tr');

    if (searchQuery &&
        (s.name.toLowerCase().includes(searchQuery) ||
         s.regNumber.toLowerCase().includes(searchQuery))) {
      tr.classList.add('lb-highlight');
    }

    tr.innerHTML = `
      <td class="rank-cell">
        ${rankBadge(rank)}
      </td>
      <td>
        <div class="student-cell">
          <div class="student-initials" style="background:${color}">${initials2(s.name)}</div>
          <div>
            <div class="student-name">${escHtml(s.name)}</div>
            <div class="student-sub">${escHtml(s.lastExam)}</div>
          </div>
        </div>
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary);font-weight:500;">${escHtml(s.regNumber)}</td>
      <td style="font-size:12.5px;color:var(--text-muted);">${escHtml(s.programme)}</td>
      <td style="text-align:center;font-weight:600;">${s.examsTaken}</td>
      <td>${scorePill(s.avgScore)}</td>
      <td>${scorePill(s.bestScore)}</td>
      <td>${gradeBadge(s.bestGrade)}</td>
      <td style="font-size:12px;color:var(--text-muted);">${timeAgo(s.lastTime)}</td>
      <td>
        <button class="lb-view-btn" data-key="${escHtml(s.key)}">
          View Details
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Wire up detail buttons
  tbody.querySelectorAll('.lb-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = students.find(x => x.key === btn.dataset.key);
      if (s) openStudentModal(s);
    });
  });
}

/* ── Subject breakdown ────────────────────────────────────── */
function buildSubjectBreakdown(allResults, examFilter) {
  const panel = document.getElementById('subjectPanel');
  const grid  = document.getElementById('subjectGrid');
  grid.innerHTML = '';

  const filtered = examFilter
    ? allResults.filter(r => r.examTitle === examFilter)
    : allResults;

  const subjectMap = {};
  filtered.forEach(r => {
    const s = r.subject || 'Other';
    if (!subjectMap[s]) subjectMap[s] = [];
    subjectMap[s].push(r.percentage ?? 0);
  });

  const subjects = Object.entries(subjectMap);
  if (!subjects.length) { panel.style.display = 'none'; return; }

  panel.style.display = '';
  const COLORS = ['#4285F4','#34A853','#F9AB00','#EA4335','#9C27B0','#00ACC1','#FF7043','#8BC34A'];

  subjects.forEach(([name, pcts], i) => {
    const avg   = Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
    const color = COLORS[i % COLORS.length];
    const card  = document.createElement('div');
    card.className = 'subject-stat-card';
    card.innerHTML = `
      <div class="subject-stat-name">
        <span class="subject-stat-dot" style="background:${color}"></span>
        ${escHtml(name)}
      </div>
      <div class="subject-stat-avg">${avg}%</div>
      <div class="subject-stat-meta">${pcts.length} attempt${pcts.length !== 1 ? 's' : ''}</div>
      <div class="subject-bar-wrap">
        <div class="subject-bar-fill" style="width:${avg}%;background:${color}"></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ── Exam filter dropdown ─────────────────────────────────── */
function populateExamFilter(results) {
  const sel   = document.getElementById('examFilter');
  const titles = [...new Set(results.map(r => r.examTitle).filter(Boolean))].sort();
  titles.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
}

function updateTotalLabel(count) {
  document.getElementById('totalLabel').textContent =
    `${count} student${count !== 1 ? 's' : ''} ranked`;
}

/* ═══════════════════════════════════════════════════════════
   STUDENT DETAIL MODAL
═══════════════════════════════════════════════════════════ */
function openStudentModal(s) {
  const color   = PODIUM_COLORS[0];
  const header  = document.getElementById('modalHeader');
  const body    = document.getElementById('modalBody');

  header.innerHTML = `
    <div class="lb-modal-avatar" style="background:${color}">${initials2(s.name)}</div>
    <div class="lb-modal-name">${escHtml(s.name)}</div>
    <div class="lb-modal-meta">${escHtml(s.regNumber)} &nbsp;·&nbsp; ${escHtml(s.programme)}</div>
  `;

  const sorted = [...s.attempts].sort((a,b) => new Date(b.submitTime) - new Date(a.submitTime));

  body.innerHTML = `
    <div class="lb-modal-stats">
      <div class="lb-modal-stat">
        <div class="lb-modal-stat-val">${s.examsTaken}</div>
        <div class="lb-modal-stat-lbl">Exams Taken</div>
      </div>
      <div class="lb-modal-stat">
        <div class="lb-modal-stat-val">${s.avgScore}%</div>
        <div class="lb-modal-stat-lbl">Average Score</div>
      </div>
      <div class="lb-modal-stat">
        <div class="lb-modal-stat-val">${s.bestScore}%</div>
        <div class="lb-modal-stat-lbl">Best Score</div>
      </div>
    </div>
    <div class="lb-modal-history-title">Exam History</div>
    ${sorted.map(a => `
      <div class="lb-modal-exam-row">
        <div>
          <div class="lb-modal-exam-name">${escHtml(a.examTitle)}</div>
          <div class="lb-modal-exam-date">${escHtml(a.subject)} &nbsp;·&nbsp; ${timeAgo(a.submitTime)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${scorePill(a.percentage)}
          ${gradeBadge(gradeFor(a.percentage))}
        </div>
      </div>
    `).join('')}
  `;

  document.getElementById('studentModal').classList.add('open');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('studentModal').classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════
   EXPORT CSV
═══════════════════════════════════════════════════════════ */
function exportCSV(students) {
  const rows = [['Rank','Name','Reg Number','Programme','Exams Taken','Avg Score (%)','Best Score (%)','Best Grade','Last Exam']];
  students.forEach((s, i) => {
    rows.push([i+1, s.name, s.regNumber, s.programme, s.examsTaken, s.avgScore, s.bestScore, s.bestGrade, s.lastExam]);
  });
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `leaderboard_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
function gradeFor(pct) {
  if (pct >= 75) return 'A';
  if (pct >= 65) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

function rankBadge(rank) {
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'plain';
  return `<span class="rank-badge rank-badge--${cls}">${rank}</span>`;
}

function scorePill(pct) {
  const cls = pct >= 75 ? 'a' : pct >= 65 ? 'b' : pct >= 50 ? 'c' : pct >= 40 ? 'd' : 'f';
  return `<span class="score-pill score-pill--${cls}">${pct}%</span>`;
}

function gradeBadge(grade) {
  return `<span class="grade-badge grade-badge--${grade}">${grade}</span>`;
}

function initials2(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)         return 'just now';
  if (diff < 3600)       return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7)  return `${Math.floor(diff / 86400)} day${diff < 172800 ? '' : 's'} ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)} wk ago`;
  return new Date(isoString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
