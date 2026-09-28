/*
 * Isolated-world guard: the policy half of the extension.
 *
 * Decides what counts as a short video, stamps the lock attributes the
 * MAIN-world enforcer obeys, owns the UI, and talks to the service worker for
 * settings, passes and stats.
 */
(() => {
  const hostKey = NV.baseHost(location.hostname);
  const isTop = window.top === window;

  let settings = { ...NV.DEFAULTS };
  let pass = { active: false, expiresAt: 0 };
  let stats = NV.emptyStats();
  let passTimer = 0;

  /* video -> { state: 'gated' | 'allowed', verdict } */
  const decided = new WeakMap();

  let lockedSite = null; /* the site rule, when the whole page is short form */
  let lastUrl = location.href;
  let challengeRunning = false;

  /* ------------------------------------------------------------------ */
  /* service worker                                                      */
  /* ------------------------------------------------------------------ */

  async function ask(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      /* Extension reloaded or updated under us; the page keeps working. */
      return null;
    }
  }

  async function refreshState() {
    const res = await ask({ type: 'getState', host: hostKey });
    if (!res) return;
    settings = res.settings;
    pass = res.pass;
    stats = res.stats;
    schedulePassExpiry();
  }

  function passActive() {
    return pass && pass.active && Date.now() < pass.expiresAt;
  }

  function schedulePassExpiry() {
    clearTimeout(passTimer);
    if (!passActive()) return;
    passTimer = setTimeout(() => {
      pass = { active: false, expiresAt: 0 };
      apply();
    }, Math.max(250, pass.expiresAt - Date.now()));
  }

  /* ------------------------------------------------------------------ */
  /* verdicts                                                            */
  /* ------------------------------------------------------------------ */

  function allowlisted() {
    return (settings.allowlist || []).includes(hostKey);
  }

  function gatingOff() {
    return !settings.enabled || allowlisted() || passActive();
  }

  /* Ad breaks are short by nature. Blocking them would break the player and
   * teach nothing, so they are exempt. */
  function isAd(video) {
    try {
      if (video.closest('.ad-showing, .ad-interrupting, .ytp-ad-module')) return true;
      const player = video.closest('.html5-video-player');
      if (player && player.classList.contains('ad-showing')) return true;
    } catch {}
    return false;
  }

  /* Background loops and hover previews are not "watching a video". */
  function isDecorative(video, rect) {
    if (video.muted && video.loop && !video.controls) {
      const d = video.duration;
      if (!Number.isFinite(d) || d < 8) return true;
    }
    if (video.muted) {
      const share = (rect.width * rect.height) / (innerWidth * innerHeight || 1);
      if (share < NV.MUTED_VIEWPORT_SHARE) return true;
    }
    return false;
  }

  function judge(video) {
    if (isAd(video)) return { allow: true, why: 'ad' };

    const rect = video.getBoundingClientRect();
    const w = rect.width || video.clientWidth;
    const h = rect.height || video.clientHeight;

    /* Not laid out yet — wait for a later pass rather than guessing. */
    if (!w || !h) return { unknown: true };

    if (w < settings.minVideoPx || h < settings.minVideoPx * 0.5) {
      return { allow: true, why: 'tiny' };
    }
    if (isDecorative(video, rect)) return { allow: true, why: 'decorative' };

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      /* readyState 0 means metadata has not arrived; Infinity means live. */
      if (video.readyState === 0) return { unknown: true };
      return settings.allowLiveStreams
        ? { allow: true, why: 'live' }
        : { gate: true, why: 'live' };
    }

    if (duration < settings.minSeconds) {
      return {
        gate: true,
        why: 'short',
        seconds: duration,
        minSeconds: settings.minSeconds
      };
    }
    return { allow: true, why: 'long' };
  }

  /* ------------------------------------------------------------------ */
  /* locking                                                             */
  /* ------------------------------------------------------------------ */

  function gate(video, verdict) {
    const prior = decided.get(video);
    decided.set(video, { state: 'gated', verdict });

    video.setAttribute(NV.LOCK_ATTR, '1');
    try {
      video.pause();
    } catch {}

    NV.ui.mountBadge(video, verdict, () => beginChallenge({ kind: 'video', video, verdict }));

    if (!prior || prior.state !== 'gated') {
      ask({ type: 'recordBlock', host: hostKey });
    }
  }

  function release(video) {
    decided.set(video, { state: 'allowed' });
    video.removeAttribute(NV.LOCK_ATTR);
    NV.ui.unmountBadge(video);
  }

  function lockPage(site) {
    lockedSite = site;
    document.documentElement.setAttribute(NV.LOCK_ALL_ATTR, '1');
    for (const v of document.querySelectorAll('video')) {
      try {
        v.pause();
      } catch {}
    }
    showPageBlock(site);
    ask({ type: 'recordBlock', host: hostKey });
  }

  function unlockPage() {
    lockedSite = null;
    document.documentElement.removeAttribute(NV.LOCK_ALL_ATTR);
    NV.ui.hideModal();
  }

  function leave() {
    /* On a site that is nothing but a feed, going "back" lands you in more of
     * it, so close the tab instead. window.close() only works for windows a
     * script opened, hence the fallbacks. */
    if (lockedSite && lockedSite.closeTab) {
      try {
        window.close();
      } catch {}
      location.replace('about:blank');
      return;
    }
    if (history.length > 1) history.back();
    else location.replace('about:blank');
  }

  function tally() {
    const bits = [`${stats.blocked} blocked today`];
    if (stats.unlocks) bits.push(`${stats.unlocks} forced through`);
    if (stats.secondsWaited) bits.push(`${NV.fmtDuration(stats.secondsWaited)} spent unlocking`);
    return bits.join(' · ');
  }

  function showPageBlock(site) {
    NV.ui.showModal({
      eyebrow: 'Blocked',
      title: `${site.label} is off limits.`,
      detail: settings.strictMode
        ? 'Strict mode is on, so there is no way through from here. Turn it off in the extension options if you really mean it.'
        : 'This is the feed that eats the evening. You can force your way in, but it is going to cost you.',
      tally: tally(),
      canUnlock: !settings.strictMode,
      onUnlock: () => beginChallenge({ kind: 'page', site }),
      onLeave: leave
    });
  }

  /* ------------------------------------------------------------------ */
  /* the challenge                                                       */
  /* ------------------------------------------------------------------ */

  async function beginChallenge(context) {
    if (challengeRunning || settings.strictMode) return;
    challengeRunning = true;

    const challenge = NV.buildChallenge({
      seconds: context.verdict ? context.verdict.seconds : undefined,
      siteLabel: context.site ? context.site.label : undefined,
      unlocksToday: stats.unlocks,
      settings
    });

    let result = { ok: false, secondsSpent: 0 };
    try {
      result = await NV.ui.runChallenge(challenge, context);
    } finally {
      challengeRunning = false;
    }

    if (result.secondsSpent > 0) {
      ask({ type: 'recordWait', seconds: result.secondsSpent });
      stats.secondsWaited += result.secondsSpent;
    }

    if (!result.ok) {
      /* Backed out. Put the block back exactly as it was. */
      apply();
      return;
    }

    const granted = await ask({
      type: 'grantPass',
      host: hostKey,
      seconds: settings.passSeconds
    });

    pass = granted && granted.expiresAt
      ? { active: true, expiresAt: granted.expiresAt }
      : { active: true, expiresAt: Date.now() + settings.passSeconds * 1000 };
    stats.unlocks += 1;
    schedulePassExpiry();

    apply();

    /* Start what they paid for. */
    const video =
      context.video && context.video.isConnected
        ? context.video
        : pickVisibleVideo();
    if (video) {
      try {
        await video.play();
      } catch {}
    }
  }

  function pickVisibleVideo() {
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.bottom > 0 && r.top < innerHeight) {
        best = v;
        bestArea = area;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* the main pass                                                       */
  /* ------------------------------------------------------------------ */

  function apply() {
    if (challengeRunning) return;

    /* Page-level short-form surfaces first — on those, individual durations
     * are beside the point. */
    const site =
      isTop && settings.blockShortFormPages ? NV.isShortFormPage(location) : null;
    const wantPageLock = !!site && !gatingOff();

    if (wantPageLock) {
      if (!lockedSite) lockPage(site);
      else if (!NV.ui.isModalOpen()) showPageBlock(site);
      NV.ui.unmountAllBadges();
      return;
    }
    if (lockedSite) unlockPage();

    if (gatingOff()) {
      for (const v of document.querySelectorAll(`[${NV.LOCK_ATTR}]`)) release(v);
      NV.ui.unmountAllBadges();
      return;
    }

    for (const video of document.querySelectorAll('video')) {
      const verdict = judge(video);
      if (verdict.gate) gate(video, verdict);
      else if (verdict.allow) {
        const prior = decided.get(video);
        if (!prior || prior.state !== 'allowed') release(video);
      }
      /* verdict.unknown: leave it alone; a later event or sweep will decide. */
    }
  }

  /* A media element's identity outlives navigation on SPA players — YouTube
   * reuses the same <video> for the next clip — so a duration change has to
   * throw away the old verdict. */
  function reconsider(video) {
    decided.delete(video);
    apply();
  }

  function onMediaEvent(event) {
    const el = event.target;
    if (!(el instanceof HTMLVideoElement)) return;

    if (event.type === 'durationchange' || event.type === 'loadedmetadata') {
      reconsider(el);
      return;
    }
    apply();
  }

  for (const type of ['loadedmetadata', 'durationchange', 'play', 'playing', 'canplay']) {
    document.addEventListener(type, onMediaEvent, true);
  }

  /* ------------------------------------------------------------------ */
  /* short-form UI removal                                               */
  /* ------------------------------------------------------------------ */

  function applyHideCss() {
    const site = NV.matchSite(location);
    const existing = document.getElementById('doorman-hide');
    const want = settings.enabled && settings.hideShortFormUI && site && site.hideCss;

    if (!want) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const style = document.createElement('style');
    style.id = 'doorman-hide';
    style.textContent = site.hideCss;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /* navigation and upkeep                                               */
  /* ------------------------------------------------------------------ */

  function onNavigate() {
    /* Same elements, new content: every verdict is stale. */
    for (const v of document.querySelectorAll('video')) decided.delete(v);
    NV.ui.unmountAllBadges();
    if (lockedSite) unlockPage();
    applyHideCss();
    apply();
  }

  addEventListener('popstate', onNavigate);
  addEventListener('hashchange', onNavigate);

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onNavigate();
      return;
    }
    apply();
  }, 700);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !(changes.settings || changes.stats)) return;
    await refreshState();
    if (!changes.settings) return;
    applyHideCss();
    apply();
  });

  /* ------------------------------------------------------------------ */

  (async () => {
    NV.ui.watchHost();
    applyHideCss();
    await refreshState();
    applyHideCss();
    apply();
  })();
})();
