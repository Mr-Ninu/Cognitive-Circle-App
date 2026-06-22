/* ═══════════════════════════════════════════════════════════════════
   THE COGNITIVE CIRCLE — index.html / landing page script
   ─────────────────────────────────────────────────────────────────
   HOW AUTH WORKS:
   • Paste your Firebase project config into FIREBASE_CONFIG below.
   • If the config is still the placeholder, the page silently falls
     back to a local-only session (great for VS Code testing).
   • On successful login OR account creation the user is saved to
     localStorage as  cc_session  and redirected automatically:
       – Admin role  → cognitivecirclehtml/dashboard.html
       – Student role → cognitivecirclehtml/login.html   (exam page)
═══════════════════════════════════════════════════════════════════ */

/* ── 1. PASTE YOUR FIREBASE CONFIG HERE ─────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyD0ZbILLt3BUf1jkX8_qxOmn-0WWmB09yg',
  authDomain:        'the-cognitive-circle-adm-ea2c1.firebaseapp.com',
  projectId:         'the-cognitive-circle-adm-ea2c1',
  storageBucket:     'the-cognitive-circle-adm-ea2c1.firebasestorage.app',
  messagingSenderId: '763415223905',
  appId:             '1:763415223905:web:e5562f06a2e2b6e3151420',
};
/* ── end config ───────────────────────────────────────────────────── */

/* ── 2. REDIRECT PATHS ───────────────────────────────────────────── */
const REDIRECT = {
  admin:   'cognitivecirclehtml/dashboard.html',
  student: 'cognitivecirclehtml/login.html',
};

/* ── 3. FIREBASE INIT (silently skipped if config is placeholder) ── */
let firebaseReady = false;
let auth          = null;
let db            = null;

(function initFirebase() {
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') return; // placeholder — offline mode
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    auth          = firebase.auth();
    db            = firebase.firestore();
    firebaseReady = true;
  } catch (e) {
    console.warn('Firebase init failed, running in offline mode:', e.message);
  }
})();

/* ── 4. UI STATE ─────────────────────────────────────────────────── */
let currentTab  = 'login';   // 'login' | 'signup'
let currentRole = 'student'; // 'student' | 'admin'

// Called by navbar buttons ("Sign In", "Get Started")
function scrollToAuthSection(tab) {
  setAuthTab(tab);
  document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Tab switcher (login ↔ register)
function setAuthTab(tab) {
  currentTab = tab;
  const isLogin  = tab === 'login';
  const btnLogin  = document.getElementById('tabBtnLogin');
  const btnSignup = document.getElementById('tabBtnSignup');
  const active    = 'bg-white text-slate-800 shadow';
  const inactive  = 'text-slate-500 hover:text-slate-800';

  btnLogin.className  = `flex-1 text-center py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none ${isLogin ? active : inactive}`;
  btnSignup.className = `flex-1 text-center py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none ${!isLogin ? active : inactive}`;

  document.getElementById('authCardTitle').textContent = isLogin ? 'Welcome Back' : 'Create Account';
  document.getElementById('authCardSub').textContent   = isLogin
    ? 'Log into the Cognitive Circle administrator center.'
    : 'Register your account to join the Cognitive Circle.';

  document.getElementById('fieldFullName').classList.toggle('hidden', isLogin);
  document.getElementById('btnForgot').style.display     = isLogin ? '' : 'none';

  // Student extra fields (reg number, department) only on signup
  const extras = document.getElementById('studentExtraFields');
  if (extras) extras.classList.toggle('hidden', isLogin || currentRole !== 'student');

  document.getElementById('btnSubmitText').textContent = isLogin ? 'Log Into Sandbox' : 'Create My Account';
  clearNotify();
}

// Role toggle (student ↔ admin)
function toggleRoleUI(role) {
  currentRole = role;
  const studentOption = document.getElementById('roleStudentOption');
  const adminOption   = document.getElementById('roleAdminOption');

  studentOption.classList.toggle('border-brand-blue', role === 'student');
  adminOption.classList.toggle('border-brand-blue', role === 'admin');

  // Student extra fields only show on signup
  const extras = document.getElementById('studentExtraFields');
  if (extras) extras.classList.toggle('hidden', currentTab !== 'signup' || role !== 'student');
}

/* ── 5. MAIN AUTH HANDLER ─────────────────────────────────────────── */
async function handleAuthSubmit(event) {
  event.preventDefault();

  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const role     = document.querySelector('input[name="authRole"]:checked')?.value || 'student';
  const isSignup = currentTab === 'signup';

  // Extra signup fields
  const fullName = document.getElementById('regName')?.value.trim()    || '';
  const regCode  = document.getElementById('regCode')?.value.trim()    || '';
  const program  = document.getElementById('regProgram')?.value.trim() || '';

  if (!email || !password) { showNotify('Please fill in your email and password.', 'error'); return; }
  if (isSignup && role === 'student' && !fullName) { showNotify('Please enter your full name.', 'error'); return; }

  setLoading(true);

  if (firebaseReady) {
    await handleFirebaseAuth({ email, password, role, isSignup, fullName, regCode, program });
  } else {
    handleLocalAuth({ email, password, role, isSignup, fullName, regCode, program });
  }
}

/* ── Firebase path ───────────────────────────────────────────────── */
async function handleFirebaseAuth({ email, password, role, isSignup, fullName, regCode, program }) {
  try {
    let cred;
    if (isSignup) {
      cred = await auth.createUserWithEmailAndPassword(email, password);
      // Optionally update display name
      await cred.user.updateProfile({ displayName: fullName || email.split('@')[0] });
      // Save extra profile to Firestore
      if (db) {
        await db.collection('users').doc(cred.user.uid).set({
          uid:       cred.user.uid,
          email,
          name:      fullName || email.split('@')[0],
          role,
          regCode,
          program,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      cred = await auth.signInWithEmailAndPassword(email, password);
    }

    // Fetch saved profile (for role, name etc.)
    let profile = { name: fullName, role, regCode, program };
    if (db) {
      const snap = await db.collection('users').doc(cred.user.uid).get();
      if (snap.exists) profile = { ...profile, ...snap.data() };
    }

    const session = {
      uid:      cred.user.uid,
      email:    cred.user.email,
      name:     profile.name || cred.user.displayName || email.split('@')[0],
      role:     profile.role || role,
      regCode:  profile.regCode  || regCode,
      program:  profile.program  || program,
      loginAt:  new Date().toISOString(),
    };

    saveSessionAndRedirect(session);
  } catch (err) {
    setLoading(false);
    showNotify(friendlyFirebaseError(err), 'error');
  }
}

/* ── Local / offline path ────────────────────────────────────────── */
function handleLocalAuth({ email, password, role, isSignup, fullName, regCode, program }) {
  const ACCOUNTS_KEY = 'cc_accounts';
  let accounts = [];
  try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; } catch (_) {}

  if (isSignup) {
    if (accounts.find(a => a.email === email)) {
      setLoading(false);
      showNotify('An account with this email already exists. Please sign in instead.', 'error');
      return;
    }
    const newAccount = {
      uid:      `local_${Date.now()}`,
      email,
      password,        // plain text — OK for offline demo only
      name:     fullName || email.split('@')[0],
      role,
      regCode,
      program,
      createdAt: new Date().toISOString(),
    };
    accounts.push(newAccount);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    saveSessionAndRedirect(newAccount);
  } else {
    const account = accounts.find(a => a.email === email && a.password === password);
    if (!account) {
      setLoading(false);
      showNotify('Incorrect email or password. Have you registered yet?', 'error');
      return;
    }
    saveSessionAndRedirect(account);
  }
}

/* ── Save session + redirect ─────────────────────────────────────── */
function saveSessionAndRedirect(session) {
  // Persist session for other pages to read
  localStorage.setItem('cc_session', JSON.stringify(session));

  const role     = (session.role || 'student').toLowerCase();
  const dest     = role === 'admin' ? REDIRECT.admin : REDIRECT.student;

  showNotify(`Welcome, ${session.name || session.email}! Redirecting…`, 'success');

  setTimeout(() => {
    window.location.href = dest;
  }, 900);
}

/* ── Forgot password ─────────────────────────────────────────────── */
document.getElementById('btnForgot')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  if (!email) { showNotify('Enter your email address first.', 'error'); return; }
  if (!firebaseReady) { showNotify('Password reset requires a live Firebase project. Add your config to script.js.', 'error'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showNotify('Password reset email sent — check your inbox!', 'success');
  } catch (err) {
    showNotify(friendlyFirebaseError(err), 'error');
  }
});

/* ── 6. HERO STATS — load from API ──────────────────────────────── */
async function loadHeroStats() {
  async function safeFetch(url) {
    try { const r = await fetch(url); return r.ok ? r.json() : []; } catch { return []; }
  }
  const [questions, subjects, exams] = await Promise.all([
    safeFetch('/api/questions'),
    safeFetch('/api/subjects'),
    safeFetch('/api/exams'),
  ]);
  animEl('heroSubjCount',  subjects.length);
  animEl('heroQuestCount', questions.filter(q => !q.draft).length);
  animEl('heroExamsCount', exams.length);
}

function animEl(id, to) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 900, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── 7. NOTIFICATION HELPERS ─────────────────────────────────────── */
function showNotify(msg, type = 'info') {
  const el = document.getElementById('authNotify');
  if (!el) return;
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    error:   'bg-red-50 border-red-200 text-red-600',
    info:    'bg-blue-50 border-blue-200 text-blue-700',
  };
  el.className = `p-4 rounded-2xl border text-xs leading-relaxed mb-5 ${styles[type] || styles.info}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearNotify() {
  const el = document.getElementById('authNotify');
  if (el) { el.classList.add('hidden'); el.textContent = ''; }
}

function setLoading(loading) {
  const btn  = document.getElementById('btnSubmit');
  const text = document.getElementById('btnSubmitText');
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    text.textContent = 'Please wait…';
    btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
    </svg><span id="btnSubmitText">Please wait…</span>`;
  } else {
    btn.innerHTML = `<span id="btnSubmitText">${currentTab === 'login' ? 'Log Into Sandbox' : 'Create My Account'}</span><i class="fa-solid fa-arrow-right"></i>`;
  }
}

/* ── Firebase error messages → friendly text ─────────────────────── */
function friendlyFirebaseError(err) {
  const map = {
    'auth/user-not-found':      'No account found for this email. Register first!',
    'auth/wrong-password':      'Incorrect password. Please try again.',
    'auth/email-already-in-use':'An account with this email already exists.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/too-many-requests':   'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/invalid-credential':  'Incorrect email or password.',
  };
  return map[err.code] || err.message || 'An unexpected error occurred.';
}

/* ── 8. BOOT ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Apply initial tab / role UI
  setAuthTab('login');
  toggleRoleUI('student');

  // Load live hero numbers from API
  loadHeroStats();

  // If user is already logged in (returning visitor), redirect silently
  const existingSession = JSON.parse(localStorage.getItem('cc_session') || 'null');
  if (existingSession?.uid) {
    const role = (existingSession.role || 'student').toLowerCase();
    window.location.replace(role === 'admin' ? REDIRECT.admin : REDIRECT.student);
  }
});
