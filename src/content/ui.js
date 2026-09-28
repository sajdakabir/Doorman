/*
 * All of the extension's on-page UI, inside one closed shadow root so nothing
 * the host page ships can style it, read it, or trip over it.
 *
 * Two surfaces:
 *   badge  - a small plate pinned over a single blocked <video> in a feed
 *   modal  - a full-screen takeover, used for short-form pages and for the
 *            challenge itself
 */
var NV = globalThis.NV || (globalThis.NV = {});

NV.ui = (() => {
  const HOST_TAG = 'doorman-root';

  let host = null;
  let root = null;
  let badgeLayer = null;
  let modalLayer = null;
  let rafHandle = 0;
  let prevOverflow = null;

  /* video element -> { el, video } */
  const badges = new Map();

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .layer {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 15px;
      line-height: 1.5;
      color: #f4f5f7;
      -webkit-font-smoothing: antialiased;
    }

    /* ---------- badge over a single video ---------- */
    .badge {
      position: fixed;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      text-align: center;
      background: rgba(10, 11, 14, 0.94);
      backdrop-filter: blur(6px);
      pointer-events: auto;
      overflow: hidden;
    }
    .badge__mark {
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #ff8a65;
    }
    .badge__why { font-size: 14px; color: #cfd3da; max-width: 34ch; }
    .badge__row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .badge--tight { gap: 6px; padding: 10px; }
    .badge--tight .badge__why { display: none; }

    /* ---------- modal ---------- */
    .modal {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #07080b;
      pointer-events: auto;
      overflow-y: auto;
    }
    .modal--open { display: flex; }

    .card {
      width: 100%;
      max-width: 560px;
      background: #0e1014;
      border: 1px solid #1e222b;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
    }
    @media (max-width: 480px) { .card { padding: 22px; border-radius: 12px; } }

    .eyebrow {
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #ff8a65;
      margin-bottom: 14px;
    }
    h1 {
      font-size: 26px;
      line-height: 1.2;
      font-weight: 620;
      letter-spacing: -0.015em;
      margin-bottom: 10px;
    }
    @media (max-width: 480px) { h1 { font-size: 21px; } }
    .detail { color: #9aa1ad; margin-bottom: 8px; }
    .tally {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid #1a1e26;
      font-size: 13px;
      color: #6f7783;
    }

    .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 26px; }

    button {
      font: inherit;
      font-size: 15px;
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 13px 18px;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
    }
    button:disabled { cursor: not-allowed; opacity: 0.4; }

    /* The way out is the handsome button. The way in is a grey afterthought. */
    .btn-out {
      background: #f4f5f7;
      color: #0b0d11;
      font-weight: 600;
    }
    .btn-out:hover:not(:disabled) { background: #ffffff; }

    .btn-in {
      background: transparent;
      color: #71798a;
      border-color: #22262f;
      font-size: 13px;
      padding: 10px 14px;
    }
    .btn-in:hover:not(:disabled) { color: #98a1b0; border-color: #2e333d; }

    .btn-alt {
      background: #171b22;
      color: #cfd3da;
      border-color: #262b34;
      font-size: 14px;
    }
    .btn-alt:hover:not(:disabled) { background: #1d222a; }

    /* ---------- challenge steps ---------- */
    .progress {
      display: flex;
      gap: 6px;
      margin-bottom: 20px;
    }
    .pip {
      height: 3px;
      flex: 1;
      border-radius: 2px;
      background: #1e222b;
    }
    .pip--done { background: #ff8a65; }
    .pip--now { background: #6f7783; }

    /* ---------- question gauntlet ---------- */
    .qcount {
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: #6f7783;
      margin-bottom: 12px;
    }
    .question--big { font-size: 23px; line-height: 1.32; margin-bottom: 26px; }
    @media (max-width: 480px) { .question--big { font-size: 19px; } }

    /* Both answers look the same and their order shuffles, so there is no
     * button to learn and no rhythm to fall into — you have to read them. */
    .answers {
      display: flex;
      flex-direction: column;
      gap: 10px;
      opacity: 0.28;
      transition: opacity 280ms ease;
    }
    .answers--live { opacity: 1; }
    .btn-answer {
      width: 100%;
      text-align: left;
      background: #171b22;
      color: #e8eaee;
      border-color: #262b34;
      font-size: 15px;
      padding: 15px 17px;
    }
    .btn-answer:hover:not(:disabled) { background: #1f242c; border-color: #39404b; }

    .retort {
      font-size: 22px;
      line-height: 1.35;
      font-weight: 560;
      text-align: center;
      padding: 34px 0 14px;
    }

    .question {
      font-size: 20px;
      line-height: 1.35;
      font-weight: 560;
      letter-spacing: -0.01em;
      margin-bottom: 18px;
    }

    textarea, input {
      font: inherit;
      width: 100%;
      background: #04050700;
      background-color: #080a0d;
      color: #f4f5f7;
      border: 1px solid #262b34;
      border-radius: 10px;
      padding: 13px 14px;
      resize: vertical;
      outline: none;
    }
    textarea:focus, input:focus { border-color: #4a5260; }
    textarea { min-height: 116px; line-height: 1.55; }

    .hint {
      margin-top: 10px;
      font-size: 13px;
      color: #6f7783;
      min-height: 19px;
    }
    .hint--bad { color: #ff8a65; }

    /* forced wait */
    .count {
      font-variant-numeric: tabular-nums;
      font-size: 72px;
      font-weight: 300;
      letter-spacing: -0.03em;
      text-align: center;
      margin: 8px 0 4px;
      color: #f4f5f7;
    }
    .count--held { color: #6f7783; }
    .count-note { text-align: center; color: #6f7783; font-size: 13px; min-height: 19px; }

    /* pledge */
    .target {
      background: #080a0d;
      border: 1px solid #1a1e26;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 14px;
      font-size: 16px;
      line-height: 1.6;
      letter-spacing: 0.01em;
      user-select: none;
      -webkit-user-select: none;
      color: #545c69;
      word-break: break-word;
    }
    .target span.ok { color: #f4f5f7; }
    .target span.bad { color: #ff8a65; text-decoration: underline wavy #ff8a65; }

    .sum {
      font-variant-numeric: tabular-nums;
      font-size: 34px;
      font-weight: 400;
      letter-spacing: 0.01em;
      text-align: center;
      margin: 6px 0 20px;
      user-select: none;
      -webkit-user-select: none;
    }
    @media (max-width: 480px) { .sum { font-size: 27px; } }
  `;

  /* ------------------------------------------------------------------ */
  /* shadow host                                                         */
  /* ------------------------------------------------------------------ */

  function ensureRoot() {
    if (host && host.isConnected) return;

    host = document.createElement(HOST_TAG);
    host.style.cssText = 'all: initial; position: static;';
    root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;

    badgeLayer = document.createElement('div');
    badgeLayer.className = 'layer';

    modalLayer = document.createElement('div');
    modalLayer.className = 'layer';

    /* Keep our keystrokes out of the page's shortcut handlers, so typing a
     * pledge does not also drive the player underneath. */
    for (const type of ['keydown', 'keyup', 'keypress']) {
      modalLayer.addEventListener(type, (e) => e.stopPropagation());
      badgeLayer.addEventListener(type, (e) => e.stopPropagation());
    }

    root.append(style, badgeLayer, modalLayer);
    (document.documentElement || document.body).appendChild(host);
  }

  /* If the page wipes documentElement's children (SPA rerenders do this),
   * put ourselves back. */
  function watchHost() {
    const target = document.documentElement;
    if (!target) return;
    new MutationObserver(() => {
      if ((badges.size || isModalOpen()) && (!host || !host.isConnected)) {
        const open = isModalOpen() ? currentModal : null;
        host = null;
        ensureRoot();
        if (open) renderModal(open);
        const stale = [...badges.entries()];
        badges.clear();
        for (const [video, rec] of stale) mountBadge(video, rec.verdict, rec.onUnlock);
      }
    }).observe(target, { childList: true });
  }

  /* ------------------------------------------------------------------ */
  /* badge                                                               */
  /* ------------------------------------------------------------------ */

  function mountBadge(video, verdict, onUnlock) {
    ensureRoot();
    if (badges.has(video)) {
      badges.get(video).verdict = verdict;
      return;
    }

    const el = document.createElement('div');
    el.className = 'badge';

    const mark = document.createElement('div');
    mark.className = 'badge__mark';
    mark.textContent = 'Blocked';

    const why = document.createElement('div');
    why.className = 'badge__why';
    why.textContent = describe(verdict);

    const row = document.createElement('div');
    row.className = 'badge__row';

    const unlock = document.createElement('button');
    unlock.className = 'btn-in';
    unlock.textContent = 'I still want to watch';
    unlock.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onUnlock();
    });
    row.appendChild(unlock);

    el.append(mark, why, row);
    badgeLayer.appendChild(el);
    badges.set(video, { el, verdict, onUnlock });

    positionBadges();
    startTracking();
  }

  function unmountBadge(video) {
    const rec = badges.get(video);
    if (!rec) return;
    rec.el.remove();
    badges.delete(video);
    if (!badges.size) stopTracking();
  }

  function unmountAllBadges() {
    for (const video of [...badges.keys()]) unmountBadge(video);
  }

  function positionBadges() {
    for (const [video, rec] of badges) {
      if (!video.isConnected) {
        unmountBadge(video);
        continue;
      }
      const r = video.getBoundingClientRect();
      const offscreen =
        r.width < 2 ||
        r.height < 2 ||
        r.bottom < 0 ||
        r.top > innerHeight ||
        r.right < 0 ||
        r.left > innerWidth;

      rec.el.style.display = offscreen ? 'none' : 'flex';
      if (offscreen) continue;

      rec.el.style.left = `${r.left}px`;
      rec.el.style.top = `${r.top}px`;
      rec.el.style.width = `${r.width}px`;
      rec.el.style.height = `${r.height}px`;
      rec.el.classList.toggle('badge--tight', r.height < 150 || r.width < 260);
    }
  }

  function tick() {
    positionBadges();
    rafHandle = badges.size ? requestAnimationFrame(tick) : 0;
  }

  function startTracking() {
    if (!rafHandle) rafHandle = requestAnimationFrame(tick);
  }

  function stopTracking() {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    rafHandle = 0;
  }

  function describe(verdict) {
    if (!verdict) return 'This video is too short.';
    if (verdict.why === 'shortform') {
      return `${verdict.siteLabel || 'Short-form video'} is blocked here.`;
    }
    if (verdict.why === 'live') return 'Live streams are blocked by your settings.';
    if (typeof verdict.seconds === 'number') {
      return `This video is ${Math.round(verdict.seconds)} seconds long. Your floor is ${
        verdict.minSeconds
      }.`;
    }
    return 'This video is shorter than your limit.';
  }

  /* ------------------------------------------------------------------ */
  /* modal                                                               */
  /* ------------------------------------------------------------------ */

  let currentModal = null;

  function isModalOpen() {
    return !!currentModal;
  }

  function lockScroll() {
    if (prevOverflow === null && document.documentElement) {
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
  }

  function unlockScroll() {
    if (prevOverflow !== null && document.documentElement) {
      document.documentElement.style.overflow = prevOverflow;
      prevOverflow = null;
    }
  }

  function hideModal() {
    currentModal = null;
    if (modalLayer) modalLayer.replaceChildren();
    unlockScroll();
  }

  /*
   * info: {
   *   eyebrow, title, detail, tally,
   *   canUnlock, unlockLabel, onUnlock,
   *   onLeave
   * }
   */
  function showModal(info) {
    ensureRoot();
    currentModal = info;
    renderModal(info);
    lockScroll();
  }

  function renderModal(info) {
    const modal = document.createElement('div');
    modal.className = 'modal modal--open';

    const card = document.createElement('div');
    card.className = 'card';

    if (info.eyebrow) {
      const eyebrow = document.createElement('div');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = info.eyebrow;
      card.appendChild(eyebrow);
    }

    const h1 = document.createElement('h1');
    h1.textContent = info.title;
    card.appendChild(h1);

    if (info.detail) {
      const detail = document.createElement('p');
      detail.className = 'detail';
      detail.textContent = info.detail;
      card.appendChild(detail);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    const out = document.createElement('button');
    out.className = 'btn-out';
    out.textContent = info.leaveLabel || 'Get me out of here';
    out.addEventListener('click', () => info.onLeave && info.onLeave());
    actions.appendChild(out);

    if (info.canUnlock) {
      const inBtn = document.createElement('button');
      inBtn.className = 'btn-in';
      inBtn.textContent = info.unlockLabel || 'I still want to watch';
      inBtn.addEventListener('click', () => info.onUnlock && info.onUnlock());
      actions.appendChild(inBtn);
    }

    card.appendChild(actions);

    if (info.tally) {
      const tally = document.createElement('div');
      tally.className = 'tally';
      tally.textContent = info.tally;
      card.appendChild(tally);
    }

    modal.appendChild(card);
    modalLayer.replaceChildren(modal);
  }

  /* ------------------------------------------------------------------ */
  /* challenge wizard                                                    */
  /* ------------------------------------------------------------------ */

  const blockClipboard = (el) => {
    for (const type of ['paste', 'drop', 'copy', 'cut']) {
      el.addEventListener(type, (e) => e.preventDefault());
    }
  };

  /*
   * Runs the whole sequence. Resolves { ok, secondsSpent }.
   */
  function runChallenge(challenge, ctx) {
    ensureRoot();
    lockScroll();
    const startedAt = Date.now();

    return new Promise((resolve) => {
      let index = 0;

      const finish = (ok) => {
        hideModal();
        resolve({ ok, secondsSpent: Math.round((Date.now() - startedAt) / 1000) });
      };

      const next = () => {
        index += 1;
        if (index >= challenge.steps.length) finish(true);
        else draw();
      };

      const draw = () => {
        const step = challenge.steps[index];
        const modal = document.createElement('div');
        modal.className = 'modal modal--open';

        const card = document.createElement('div');
        card.className = 'card';

        const progress = document.createElement('div');
        progress.className = 'progress';
        challenge.steps.forEach((_, i) => {
          const pip = document.createElement('div');
          pip.className =
            'pip' + (i < index ? ' pip--done' : i === index ? ' pip--now' : '');
          progress.appendChild(pip);
        });
        card.appendChild(progress);

        const eyebrow = document.createElement('div');
        eyebrow.className = 'eyebrow';
        eyebrow.textContent = `Step ${index + 1} of ${challenge.steps.length}`;
        card.appendChild(eyebrow);

        const body = document.createElement('div');
        card.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'actions';

        const proceed = document.createElement('button');
        proceed.className = 'btn-alt';
        proceed.textContent = 'Continue';
        proceed.disabled = true;

        const bail = document.createElement('button');
        bail.className = 'btn-out';
        bail.textContent = 'Forget it, close this';
        bail.addEventListener('click', () => finish(false));

        actions.append(bail, proceed);
        card.appendChild(actions);

        modal.appendChild(card);
        modalLayer.replaceChildren(modal);

        const renderer = RENDERERS[step.kind];
        renderer(body, step, { proceed, next, bail, actions, finish, ctx });
      };

      draw();
    });
  }

  const RENDERERS = {
    /*
     * A run of questions inside one step. Answering honestly ends the whole
     * challenge on the spot, so the default footer buttons are removed — the
     * way out is one of the answers, on every single question.
     */
    questions(body, step, { actions, next, finish }) {
      actions.remove();

      const wrap = document.createElement('div');
      body.appendChild(wrap);

      let index = 0;

      const draw = () => {
        const q = step.items[index];
        wrap.replaceChildren();

        const count = document.createElement('div');
        count.className = 'qcount';
        count.textContent = `Question ${index + 1} of ${step.items.length}`;

        const text = document.createElement('div');
        text.className = 'question question--big';
        text.textContent = q.text;

        const answers = document.createElement('div');
        answers.className = 'answers';

        const button = (label, onClick) => {
          const b = document.createElement('button');
          b.className = 'btn-answer';
          b.textContent = label;
          b.disabled = true;
          b.addEventListener('click', onClick);
          return b;
        };

        const onward = button(q.yes, () => {
          index += 1;
          if (index >= step.items.length) next();
          else draw();
        });

        const out = button(q.no, () => {
          wrap.replaceChildren();
          const retort = document.createElement('div');
          retort.className = 'retort';
          retort.textContent = q.retort;
          wrap.appendChild(retort);
          setTimeout(() => finish(false), 1900);
        });

        answers.append(...(Math.random() > 0.5 ? [onward, out] : [out, onward]));
        wrap.append(count, text, answers);

        /* Long enough that the answers have to be read rather than swatted. */
        setTimeout(() => {
          onward.disabled = false;
          out.disabled = false;
          answers.classList.add('answers--live');
        }, 1200 + Math.random() * 900);
      };

      draw();
    },

    reflect(body, step, { proceed, next }) {
      const q = document.createElement('div');
      q.className = 'question';
      q.textContent = step.question;

      const input = document.createElement('textarea');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('autocomplete', 'off');
      input.placeholder = 'Type an honest answer.';
      blockClipboard(input);

      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = `At least ${step.minWords} words.`;

      const check = () => {
        const verdict = NV.gradeReflection(input.value, step.minWords);
        proceed.disabled = !verdict.ok;
        hint.textContent = verdict.ok ? 'That will do.' : verdict.message;
        hint.classList.toggle('hint--bad', !verdict.ok && input.value.length > 0);
      };
      input.addEventListener('input', check);

      proceed.addEventListener('click', () => {
        if (!proceed.disabled) next();
      });

      body.append(q, input, hint);
      setTimeout(() => input.focus(), 30);
    },

    wait(body, step, { proceed, next }) {
      const q = document.createElement('div');
      q.className = 'question';
      q.textContent = 'Sit with it for a moment.';

      const count = document.createElement('div');
      count.className = 'count';

      const note = document.createElement('div');
      note.className = 'count-note';
      note.textContent = 'The timer only runs while this tab is in front.';

      body.append(q, count, note);
      proceed.textContent = 'Continue';

      let remaining = step.seconds * 1000;
      let last = Date.now();

      const render = () => {
        const secs = Math.ceil(remaining / 1000);
        count.textContent = String(Math.max(0, secs));
        const held = document.hidden;
        count.classList.toggle('count--held', held);
        note.textContent = held
          ? 'Paused. Come back to this tab to keep the clock running.'
          : 'The timer only runs while this tab is in front.';
      };

      const timer = setInterval(() => {
        const now = Date.now();
        const delta = now - last;
        last = now;
        if (!document.hidden) remaining -= delta;
        render();
        if (remaining <= 0) {
          clearInterval(timer);
          proceed.disabled = false;
          count.textContent = '0';
          note.textContent = 'Still want to?';
        }
      }, 200);

      document.addEventListener('visibilitychange', render);
      render();

      proceed.addEventListener('click', () => {
        if (proceed.disabled) return;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', render);
        next();
      });
    },

    pledge(body, step, { proceed, next }) {
      const q = document.createElement('div');
      q.className = 'question';
      q.textContent = 'Type this out, exactly.';

      const target = document.createElement('div');
      target.className = 'target';
      const chars = [...step.sentence].map((ch) => {
        const span = document.createElement('span');
        span.textContent = ch;
        target.appendChild(span);
        return span;
      });
      blockClipboard(target);

      const input = document.createElement('textarea');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('autocomplete', 'off');
      input.placeholder = 'No pasting.';
      blockClipboard(input);

      const hint = document.createElement('div');
      hint.className = 'hint';

      const check = () => {
        const typed = [...input.value];
        let firstBad = -1;
        chars.forEach((span, i) => {
          span.className = '';
          if (i < typed.length) {
            const good = typed[i] === step.sentence[i];
            span.className = good ? 'ok' : 'bad';
            if (!good && firstBad < 0) firstBad = i;
          }
        });

        const exact = input.value === step.sentence;
        proceed.disabled = !exact;

        if (exact) {
          hint.textContent = 'Word for word.';
          hint.classList.remove('hint--bad');
        } else if (firstBad >= 0) {
          hint.textContent = `Mismatch at character ${firstBad + 1}.`;
          hint.classList.add('hint--bad');
        } else {
          const left = step.sentence.length - typed.length;
          hint.textContent = `${left} character${left === 1 ? '' : 's'} to go.`;
          hint.classList.remove('hint--bad');
        }
      };

      input.addEventListener('input', check);
      proceed.addEventListener('click', () => {
        if (!proceed.disabled) next();
      });

      body.append(q, target, input, hint);
      check();
      setTimeout(() => input.focus(), 30);
    },

    math(body, step, { proceed, next }) {
      const q = document.createElement('div');
      q.className = 'question';
      q.textContent = 'Work this out. No calculator.';

      const sum = document.createElement('div');
      sum.className = 'sum';

      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.setAttribute('autocomplete', 'off');
      input.placeholder = 'Answer';
      blockClipboard(input);

      const hint = document.createElement('div');
      hint.className = 'hint';

      /* A wrong answer earns a fresh problem and a short lockout, so guessing
       * costs more than thinking. */
      let current = step;
      let strikes = 0;

      const load = (problem) => {
        current = problem;
        sum.textContent = `${problem.prompt} = ?`;
        input.value = '';
        proceed.disabled = true;
      };

      const submit = () => {
        const given = Number(input.value.trim());
        if (!input.value.trim() || Number.isNaN(given)) return;

        if (given === current.answer) {
          next();
          return;
        }

        strikes += 1;
        const penalty = 4 + strikes * 2;
        hint.textContent = `Wrong. New problem in ${penalty}s.`;
        hint.classList.add('hint--bad');
        input.disabled = true;
        proceed.disabled = true;

        let left = penalty;
        const timer = setInterval(() => {
          left -= 1;
          if (left > 0) {
            hint.textContent = `Wrong. New problem in ${left}s.`;
            return;
          }
          clearInterval(timer);
          input.disabled = false;
          hint.textContent = strikes > 1 ? `${strikes} wrong so far.` : '';
          hint.classList.remove('hint--bad');
          load(NV.newMathProblem(strikes + 1));
          input.focus();
        }, 1000);
      };

      input.addEventListener('input', () => {
        proceed.disabled = !input.value.trim();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });

      proceed.textContent = 'Check';
      proceed.addEventListener('click', () => {
        if (!proceed.disabled) submit();
      });

      body.append(q, sum, input, hint);
      load(step);
      setTimeout(() => input.focus(), 30);
    }
  };

  return {
    mountBadge,
    unmountBadge,
    unmountAllBadges,
    showModal,
    hideModal,
    isModalOpen,
    runChallenge,
    watchHost,
    describe
  };
})();
