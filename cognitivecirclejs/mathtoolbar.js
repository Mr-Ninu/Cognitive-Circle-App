/* ================================================
   Cognitive Circle — Math Input Toolbar + Live Preview
   + Word-style Equation Editor (powered by MathLive)
   ─────────────────────────────────────────────────────
   Self-contained: injects its own CSS.

   WHAT IT DOES:
   • Toolbar of clickable buttons that insert math snippets at the cursor
   • Live preview panel below each TEXTAREA — updates as you type
   • "fx Equation" button opens a Word-like equation editor (MathLive)
     with empty boxes for variables, fractions, exponents, roots, matrices,
     integrals, etc. On Insert, the equation is added as $LaTeX$ at the
     cursor and rendered live by KaTeX, exactly as students will see it.

   REQUIRES (loaded in the HTML <head>):
     <script defer src="https://unpkg.com/mathlive"></script>
     (KaTeX + mathrender.js already in place for rendering)

   Usage in HTML (before </body>):
     <script src="../cognitivecirclejs/mathtoolbar.js"></script>
     <script>
       document.addEventListener('DOMContentLoaded', function () {
         initMathToolbar('mathToolbar', [
           'questionText','optA','optB','optC','optD','explanationText'
         ]);
       });
     </script>
   ================================================ */

(function (global) {
  'use strict';

  /* ── Inject styles once ──────────────────────────────────────────── */
  if (!document.getElementById('__mathToolbarCSS')) {
    var style = document.createElement('style');
    style.id  = '__mathToolbarCSS';
    style.textContent = [
      '.mtb-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:8px 10px;margin-bottom:6px;background:#f0f6ff;border:1px solid #bfdbfe;border-radius:8px;user-select:none;}',
      '.mtb-sep{width:1px;height:22px;background:#bfdbfe;margin:0 4px;flex-shrink:0;}',
      '.mtb-btn{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:28px;padding:0 7px;background:#fff;border:1px solid #bfdbfe;border-radius:5px;font-size:13px;font-weight:500;color:#1e40af;cursor:pointer;transition:background .12s,border-color .12s,color .12s;white-space:nowrap;line-height:1;font-family:inherit;}',
      '.mtb-btn:hover{background:#2563eb;border-color:#2563eb;color:#fff;}',
      '.mtb-btn:active{background:#1d4ed8;color:#fff;}',
      '.mtb-btn.mtb-fx{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border-color:#1d4ed8;font-weight:700;padding:0 12px;}',
      '.mtb-btn.mtb-fx:hover{background:linear-gradient(135deg,#1d4ed8,#1e3a8a);}',
      '.mtb-hint{font-size:10px;color:#94a3b8;margin-left:auto;white-space:nowrap;}',
      '.mtb-preview{display:none;margin-top:4px;margin-bottom:6px;padding:10px 14px;min-height:36px;background:#fff;border:1px solid #bfdbfe;border-radius:7px;font-size:15px;line-height:1.7;color:#1e293b;}',
      '.mtb-preview.visible{display:block;}',
      '.mtb-preview-label{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#2563eb;display:block;margin-bottom:4px;}',
      '.mtb-preview-content{word-break:break-word;}',
      '.mtb-preview .katex{font-size:1.05em;}',
      '.mtb-preview .katex-display{margin:.3em 0;}',
      /* Equation editor modal */
      '.mleq-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;z-index:99999;padding:16px;}',
      '.mleq-backdrop.open{display:flex;}',
      '.mleq-modal{background:#fff;border-radius:12px;width:min(720px,100%);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,.35);overflow:hidden;font-family:Inter,system-ui,sans-serif;}',
      '.mleq-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;}',
      '.mleq-head h3{margin:0;font-size:16px;font-weight:600;}',
      '.mleq-close{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;}',
      '.mleq-body{padding:18px;display:flex;flex-direction:column;gap:14px;overflow:auto;}',
      '.mleq-label{font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#2563eb;}',
      '.mleq-field{width:100%;min-height:80px;font-size:22px;padding:12px 14px;border:2px solid #bfdbfe;border-radius:8px;background:#f8fbff;}',
      '.mleq-field:focus-within{border-color:#2563eb;background:#fff;outline:none;}',
      '.mleq-latex{width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#475569;min-height:42px;resize:vertical;}',
      '.mleq-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;}',
      '.mleq-btn{padding:9px 18px;border-radius:7px;font-weight:600;font-size:14px;cursor:pointer;border:1px solid transparent;}',
      '.mleq-btn.ghost{background:#fff;border-color:#cbd5e1;color:#334155;}',
      '.mleq-btn.ghost:hover{background:#f1f5f9;}',
      '.mleq-btn.primary{background:#2563eb;color:#fff;}',
      '.mleq-btn.primary:hover{background:#1d4ed8;}',
      '.mleq-presets{display:flex;flex-wrap:wrap;gap:6px;}',
      '.mleq-preset{padding:6px 10px;font-size:12px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:5px;cursor:pointer;font-family:inherit;}',
      '.mleq-preset:hover{background:#2563eb;color:#fff;border-color:#2563eb;}',
    ].join('');
    document.head.appendChild(style);
  }

  /* ── Button definitions (quick inserts) ─────────────────────────── */
  var GROUPS = [
    { buttons: [
      { label: 'a/b',  tip: 'Fraction',          snippet: 'a/b',     selectFrom: 0, selectLen: 3 },
      { label: 'xⁿ',   tip: 'Exponent',          snippet: 'x^2',     selectFrom: 2, selectLen: 1 },
      { label: '√x',   tip: 'Square root',       snippet: 'sqrt(x)', selectFrom: 5, selectLen: 1 },
      { label: 'xₙ',   tip: 'Subscript',         snippet: 'x_1',     selectFrom: 2, selectLen: 1 },
      { label: '|x|',  tip: 'Absolute value',    snippet: '|x|',     selectFrom: 1, selectLen: 1 },
    ]},
    { buttons: [
      { label: 'π',  tip: 'Pi',     snippet: 'pi '    },
      { label: 'α',  tip: 'Alpha',  snippet: 'alpha ' },
      { label: 'β',  tip: 'Beta',   snippet: 'beta '  },
      { label: 'θ',  tip: 'Theta',  snippet: 'theta ' },
      { label: 'Δ',  tip: 'Delta',  snippet: 'delta ' },
      { label: 'σ',  tip: 'Sigma',  snippet: 'sigma ' },
      { label: '∞',  tip: 'Infinity', snippet: 'infinity ' },
    ]},
    { buttons: [
      { label: '≤', tip: 'Less or equal',    snippet: '<= ' },
      { label: '≥', tip: 'Greater or equal', snippet: '>= ' },
      { label: '≠', tip: 'Not equal',        snippet: '!= ' },
      { label: '±', tip: 'Plus-minus',       snippet: '+- ' },
      { label: '×', tip: 'Multiply',         snippet: '* '  },
      { label: '÷', tip: 'Divide',           snippet: '/ '  },
    ]},
  ];

  /* Quick-insert presets shown inside the equation editor */
  var EQ_PRESETS = [
    { label: 'a/b',          latex: '\\frac{\\placeholder{}}{\\placeholder{}}' },
    { label: 'xⁿ',           latex: '\\placeholder{}^{\\placeholder{}}' },
    { label: '√x',           latex: '\\sqrt{\\placeholder{}}' },
    { label: 'ⁿ√x',          latex: '\\sqrt[\\placeholder{}]{\\placeholder{}}' },
    { label: 'xₙ',           latex: '\\placeholder{}_{\\placeholder{}}' },
    { label: '∫',            latex: '\\int_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}\\,d\\placeholder{}' },
    { label: '∑',            latex: '\\sum_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}' },
    { label: 'lim',          latex: '\\lim_{\\placeholder{}\\to\\placeholder{}}\\placeholder{}' },
    { label: '( )',          latex: '\\left(\\placeholder{}\\right)' },
    { label: 'matrix',       latex: '\\begin{pmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{pmatrix}' },
    { label: 'ax²+bx+c',     latex: 'ax^2+bx+c=0' },
    { label: 'quadratic',    latex: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
  ];

  /* ── Insert text at cursor ──────────────────────────────────────── */
  function insertAtCursor(el, snippet, selectFrom, selectLen) {
    if (!el) return;
    var start = el.selectionStart, end = el.selectionEnd;
    el.value  = el.value.slice(0, start) + snippet + el.value.slice(end);
    if (selectFrom !== undefined && selectLen > 0) {
      el.setSelectionRange(start + selectFrom, start + selectFrom + selectLen);
    } else {
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    }
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ── Live preview ───────────────────────────────────────────────── */
  var _debounceTimers = {};

  function attachPreview(textarea) {
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;
    var previewId = '__mtbPrev_' + textarea.id;
    if (document.getElementById(previewId)) return;

    var panel = document.createElement('div');
    panel.id = previewId;
    panel.className = 'mtb-preview';
    panel.innerHTML = '<span class="mtb-preview-label">&#128065; Live Preview</span><div class="mtb-preview-content"></div>';
    textarea.parentNode.insertBefore(panel, textarea.nextSibling);

    var content = panel.querySelector('.mtb-preview-content');

    function updatePreview() {
      var raw = textarea.value.trim();
      if (!raw) { panel.classList.remove('visible'); return; }
      var rendered = typeof window.mathHtml === 'function'
        ? window.mathHtml(raw)
        : raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      content.innerHTML = rendered;
      panel.classList.add('visible');
    }

    textarea.addEventListener('input', function () {
      clearTimeout(_debounceTimers[textarea.id]);
      _debounceTimers[textarea.id] = setTimeout(updatePreview, 120);
    });
  }

  /* ── Equation editor modal (MathLive) ───────────────────────────── */
  var _modal = null, _mathField = null, _latexOut = null, _currentTarget = null;

  function ensureModal() {
    if (_modal) return _modal;
    _modal = document.createElement('div');
    _modal.className = 'mleq-backdrop';
    _modal.innerHTML =
      '<div class="mleq-modal" role="dialog" aria-modal="true">' +
        '<div class="mleq-head">' +
          '<h3><i class="fa-solid fa-square-root-variable" style="margin-right:8px"></i>Equation Editor</h3>' +
          '<button type="button" class="mleq-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="mleq-body">' +
          '<div>' +
            '<div class="mleq-label">Build your equation</div>' +
            '<math-field class="mleq-field" virtual-keyboard-mode="manual"></math-field>' +
            '<div style="font-size:11px;color:#64748b;margin-top:4px">' +
              'Tap the keyboard icon for full symbols, or pick a quick template below.' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<div class="mleq-label" style="margin-bottom:6px">Quick templates</div>' +
            '<div class="mleq-presets"></div>' +
          '</div>' +
          '<div>' +
            '<div class="mleq-label" style="margin-bottom:6px">LaTeX (auto)</div>' +
            '<textarea class="mleq-latex" rows="2" spellcheck="false"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="mleq-foot">' +
          '<button type="button" class="mleq-btn ghost" data-act="cancel">Cancel</button>' +
          '<button type="button" class="mleq-btn primary" data-act="insert">' +
            '<i class="fa-solid fa-check" style="margin-right:6px"></i>Insert into question' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(_modal);

    _mathField = _modal.querySelector('math-field');
    _latexOut  = _modal.querySelector('.mleq-latex');

    /* keep LaTeX textarea in sync with the math field */
    _mathField.addEventListener('input', function () {
      _latexOut.value = _mathField.value || '';
    });
    /* allow editing raw LaTeX too */
    _latexOut.addEventListener('input', function () {
      try { _mathField.setValue(_latexOut.value, { silenceNotifications: true }); }
      catch (_) {}
    });

    /* preset buttons */
    var presetsWrap = _modal.querySelector('.mleq-presets');
    EQ_PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mleq-preset';
      b.textContent = p.label;
      b.title = p.latex;
      b.addEventListener('click', function () {
        try { _mathField.insert(p.latex, { focus: true }); }
        catch (_) {
          _mathField.value = (_mathField.value || '') + p.latex;
        }
        _latexOut.value = _mathField.value || '';
      });
      presetsWrap.appendChild(b);
    });

    _modal.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (e.target === _modal || e.target.classList.contains('mleq-close')) closeModal();
      else if (act === 'cancel') closeModal();
      else if (act === 'insert') doInsert();
    });

    document.addEventListener('keydown', function (e) {
      if (_modal.classList.contains('open') && e.key === 'Escape') closeModal();
    });

    return _modal;
  }

  function openModal(target) {
    if (typeof customElements === 'undefined' || !customElements.get('math-field')) {
      alert('Equation editor is still loading — please try again in a moment.');
      return;
    }
    ensureModal();
    _currentTarget = target;
    _mathField.value = '';
    _latexOut.value  = '';
    _modal.classList.add('open');
    setTimeout(function () { try { _mathField.focus(); } catch (_) {} }, 50);
  }

  function closeModal() {
    if (_modal) _modal.classList.remove('open');
  }

  function doInsert() {
    var latex = (_mathField && _mathField.value || '').trim();
    if (!latex) { closeModal(); return; }
    var snippet = '$' + latex + '$';
    insertAtCursor(_currentTarget, snippet);
    closeModal();
  }

  /* ── Build toolbar DOM ──────────────────────────────────────────── */
  function buildToolbar(mount, targets) {
    var activeEl = targets[0];

    targets.forEach(function (el) {
      el.addEventListener('focus', function () { activeEl = el; });
      attachPreview(el);
    });

    var wrap = document.createElement('div');
    wrap.className = 'mtb-wrap';

    /* fx Equation Editor button (primary) */
    var fx = document.createElement('button');
    fx.type = 'button';
    fx.className = 'mtb-btn mtb-fx';
    fx.innerHTML = '<i class="fa-solid fa-square-root-variable" style="margin-right:6px"></i>fx Equation';
    fx.title = 'Open the Word-style equation editor';
    fx.addEventListener('mousedown', function (e) { e.preventDefault(); });
    fx.addEventListener('click', function () { openModal(activeEl || targets[0]); });
    wrap.appendChild(fx);

    var sep0 = document.createElement('span');
    sep0.className = 'mtb-sep';
    wrap.appendChild(sep0);

    GROUPS.forEach(function (group, gi) {
      if (gi > 0) {
        var sep = document.createElement('span');
        sep.className = 'mtb-sep';
        wrap.appendChild(sep);
      }
      group.buttons.forEach(function (btn) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'mtb-btn';
        b.textContent = btn.label;
        b.title = btn.tip || btn.label;
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () {
          insertAtCursor(activeEl || targets[0], btn.snippet, btn.selectFrom, btn.selectLen);
        });
        wrap.appendChild(b);
      });
    });

    var hint = document.createElement('span');
    hint.className = 'mtb-hint';
    hint.textContent = 'Click fx for the full equation editor ↑';
    wrap.appendChild(hint);

    mount.appendChild(wrap);
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  global.initMathToolbar = function (mountId, targetIds) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    var targets = targetIds
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    if (!targets.length) return;
    buildToolbar(mount, targets);
  };

  /* expose the modal opener too, for custom buttons */
  global.openEquationEditor = function (targetId) {
    var t = document.getElementById(targetId);
    if (t) openModal(t);
  };

})(window);
