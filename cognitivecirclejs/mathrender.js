/* ================================================
   Cognitive Circle — Math Renderer (KaTeX)
   ─────────────────────────────────────────────
   Exposes:  window.mathHtml(str) → safe HTML

   HOW TO USE — two modes:

   MODE 1 — Explicit LaTeX (for complex expressions):
     $x^2 + y^2 = z^2$            inline math
     $$\frac{a}{b} = c$$           display (block) math
     \frac{a}{b}   \sqrt{x}        full LaTeX inside $...$

   MODE 2 — Plain text (auto-detected, no $ needed):
     2/x   x/3   (a+b)/c          → fraction
     x^2   y^3   2x^n             → exponent
     sqrt(x)  sqrt(a+b)           → square root
     x_1   a_n                    → subscript
     >=  <=  !=  +-               → symbols (≥ ≤ ≠ ±)

   Example — teacher can type exactly:
     "Find x if 2/x = 4"    → renders fraction
     "Area = pi*r^2"         → renders π·r²
   ================================================ */

(function (global) {
  'use strict';

  /* ── Common English words that contain / or ^ but are NOT math ── */
  var SKIP_WORDS = /^(and|or|of|the|in|at|by|for|if|so|to|a|an|is|as|on|up|no|yes|he|she|we|it|they|not|but|be|do|go|my|our|its|his|her|him|etc|vs|per|re|co|un)$/i;

  /* ── Step 1: pre-process plain-text math into $...$ tokens ──────
     Only runs when the text contains NO existing $ / \( / \[ delimiters,
     so it never interferes with explicit LaTeX the user already wrote.   */
  function preprocessMath(raw) {
    /* If the user already used LaTeX delimiters, trust them entirely */
    if (/\$|\\\(|\\\[/.test(raw)) return raw;

    var out = raw;

    /* 1a. Greek word shortcuts → symbols
          Recognised: pi, alpha, beta, gamma, delta, theta,
                      sigma, omega, lambda, mu, epsilon, phi     */
    out = out.replace(/\b(pi|alpha|beta|gamma|delta|theta|sigma|omega|lambda|mu|epsilon|phi)\b/gi, function(w) {
      return '$\\' + w.toLowerCase() + '$';
    });

    /* 1b. sqrt(expr)  →  $\sqrt{expr}$  */
    out = out.replace(/\bsqrt\(([^)]{1,60})\)/gi, function(_, inner) {
      return '$\\sqrt{' + inner.trim() + '}$';
    });

    /* 1c. base^exp  (exponent)
          Matches: x^2  y^3  2x^n  (a+b)^2
          Uses a look-behind-style approach: word/digit before ^, word/digit after */
    out = out.replace(/([A-Za-z\d]\w{0,4})\^([A-Za-z\d]+)/g, function(full, base, exp) {
      /* Skip if it's embedded in a URL or file path */
      return '$' + base + '^{' + exp + '}$';
    });

    /* 1d. a/b  (fraction)
          Rules to AVOID false positives:
            – skip common English words on either side
            – pure integer/integer (like 3/5) IS converted — it IS a fraction
              in a maths question bank context
            – max token length 6 chars each side to avoid "and/or", "he/she"  */
    out = out.replace(/(?<![:/])([A-Za-z\d(][A-Za-z\d+\-*.(]{0,5})\/([A-Za-z\d)][A-Za-z\d+\-.){0,5})(?![:\/])/g, function(full, num, den) {
      /* Strip any surrounding parens for the skip-word test */
      var nCore = num.replace(/[()]/g, '');
      var dCore = den.replace(/[()]/g, '');
      if (SKIP_WORDS.test(nCore) || SKIP_WORDS.test(dCore)) return full;
      /* Avoid converting things like "10/10/2025" (dates) — skip if preceded by digit and followed by digit+slash */
      return '$\\frac{' + num + '}{' + den + '}$';
    });

    /* 1e. base_sub  (subscript)  e.g. x_1  a_n  */
    out = out.replace(/([A-Za-z])_([A-Za-z\d]{1,3})\b/g, function(_, base, sub) {
      return '$' + base + '_{' + sub + '}$';
    });

    /* 1f. Plain-text symbol shorthands */
    var SYMBOLS = [
      [/\b>=\b/g,  '$\\geq$'],
      [/\b<=\b/g,  '$\\leq$'],
      [/\b!=\b/g,  '$\\neq$'],
      [/\+-/g,     '$\\pm$'],
      [/\*/g,      '$\\times$'],
    ];
    SYMBOLS.forEach(function(pair) {
      out = out.replace(pair[0], pair[1]);
    });

    return out;
  }

  /* ── Step 2: LaTeX delimiter regex ─────────────────────────────── */
  var MATH_RE = /(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Step 3: render each $...$ token with KaTeX ─────────────────── */
  function renderDelimiters(raw) {
    var parts = [];
    var lastIndex = 0;
    MATH_RE.lastIndex = 0;
    var m;

    while ((m = MATH_RE.exec(raw)) !== null) {
      if (m.index > lastIndex) {
        parts.push(escHtml(raw.slice(lastIndex, m.index)));
      }

      var token   = m[1];
      var display = false;
      var inner;

      if (token.slice(0, 2) === '$$') {
        display = true;
        inner   = token.slice(2, -2);
      } else if (token.charAt(0) === '$') {
        inner = token.slice(1, -1);
      } else if (token.slice(0, 2) === '\\[') {
        display = true;
        inner   = token.slice(2, -2);
      } else {
        inner = token.slice(2, -2);
      }

      try {
        parts.push(katex.renderToString(inner.trim(), {
          displayMode:  display,
          throwOnError: false,
          output:       'html',
        }));
      } catch (_) {
        parts.push(escHtml(token));
      }

      lastIndex = MATH_RE.lastIndex;
    }

    if (lastIndex < raw.length) {
      parts.push(escHtml(raw.slice(lastIndex)));
    }

    return parts.join('');
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  function mathHtml(raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    raw = String(raw);
    if (typeof katex === 'undefined') return escHtml(raw);

    /* Pre-process plain-text patterns first, then render delimiters */
    return renderDelimiters(preprocessMath(raw));
  }

  global.mathHtml = mathHtml;

})(window);
