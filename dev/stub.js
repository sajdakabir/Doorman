/* Stands in for the extension platform so the real content scripts can run
 * on an ordinary page. Loaded after defaults.js, before guard.js. */
(() => {
  const state = {
    settings: { ...NV.DEFAULTS },
    stats: { day: NV.localDay(), blocked: 0, unlocks: 0, secondsWaited: 0, allTime: {} },
    pass: { active: false, expiresAt: 0 }
  };
  window.__harness = state;

  /* Query options, so one page can exercise several configurations:
       ?steps=math,wait   only these challenge steps
       ?unlocks=3         pretend you have already unlocked 3 times today
       ?pass=8            make an unlock last 8s, to watch it re-lock  */
  const params = new URLSearchParams(location.search);
  if (params.has('steps')) {
    const want = params.get('steps').split(',');
    for (const k of Object.keys(state.settings.steps)) {
      state.settings.steps[k] = want.includes(k);
    }
  }
  if (params.has('unlocks')) state.stats.unlocks = Number(params.get('unlocks'));
  if (params.has('pass')) state.settings.passSeconds = Number(params.get('pass'));

  const HANDLERS = {
    getState: () => ({ settings: state.settings, stats: state.stats, pass: state.pass }),
    grantPass: ({ seconds }) => {
      state.pass = { active: true, expiresAt: Date.now() + seconds * 1000 };
      state.stats.unlocks += 1;
      return { expiresAt: state.pass.expiresAt };
    },
    recordBlock: () => { state.stats.blocked += 1; return { ok: true }; },
    recordWait: ({ seconds }) => { state.stats.secondsWaited += seconds; return { ok: true }; }
  };

  window.chrome = {
    runtime: {
      id: 'harness',
      sendMessage: async (msg) => (HANDLERS[msg.type] ? HANDLERS[msg.type](msg) : null)
    },
    storage: { onChanged: { addListener() {} } }
  };

  /* Give each <video> the shape guard.js reads, without needing real media.
   * The loader runs after DOMContentLoaded, so do it now if the DOM is ready. */
  const shapeVideos = () => {
    for (const v of document.querySelectorAll('video[data-duration]')) {
      const raw = v.dataset.duration;
      const duration = raw === 'Infinity' ? Infinity : Number(raw);
      Object.defineProperty(v, 'duration', { get: () => duration, configurable: true });
      Object.defineProperty(v, 'readyState', { get: () => 1, configurable: true });
    }
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', shapeVideos);
  } else {
    shapeVideos();
  }
})();
