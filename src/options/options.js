/* Options page. Every control writes straight through to storage; the guard
 * in each open tab picks the change up via chrome.storage.onChanged. */
(() => {
  const $ = (id) => document.getElementById(id);

  const NUMBERS = ['minSeconds', 'minVideoPx', 'passSeconds', 'baseWaitSeconds', 'questionCount'];
  const FLAGS = [
    'enabled',
    'blockShortFormPages',
    'hideShortFormUI',
    'allowLiveStreams',
    'strictMode',
    'escalate'
  ];
  const STEPS = ['questions', 'reflect', 'wait', 'pledge', 'math'];

  let settings = { ...NV.DEFAULTS };
  let savedTimer = 0;

  function flashSaved() {
    $('saved').classList.add('saved--on');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => $('saved').classList.remove('saved--on'), 900);
  }

  async function persist() {
    await chrome.storage.local.set({ settings });
    flashSaved();
  }

  function render() {
    for (const key of FLAGS) $(key).checked = !!settings[key];
    for (const key of NUMBERS) $(key).value = settings[key];
    for (const step of STEPS) $(`step-${step}`).checked = !!settings.steps[step];
    $('allowlist').value = (settings.allowlist || []).join('\n');
  }

  function renderStats(stats) {
    const all = stats.allTime || { blocked: 0, unlocks: 0, secondsWaited: 0 };
    $('t-blocked').textContent = all.blocked + stats.blocked;
    $('t-unlocks').textContent = all.unlocks + stats.unlocks;
    $('t-waited').textContent = NV.fmtDuration(all.secondsWaited + stats.secondsWaited);
  }

  for (const key of FLAGS) {
    $(key).addEventListener('change', (e) => {
      settings[key] = e.target.checked;
      persist();
    });
  }

  for (const key of NUMBERS) {
    $(key).addEventListener('change', (e) => {
      const el = e.target;
      const n = Number(el.value);
      const min = Number(el.min);
      const max = Number(el.max);
      const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : NV.DEFAULTS[key];
      settings[key] = clamped;
      el.value = clamped;
      persist();
    });
  }

  for (const step of STEPS) {
    $(`step-${step}`).addEventListener('change', (e) => {
      const next = { ...settings.steps, [step]: e.target.checked };

      /* Refuse to leave the challenge empty — that would turn the block into
       * a single click, which defeats the whole thing. */
      if (!STEPS.some((s) => next[s])) {
        e.target.checked = true;
        return;
      }
      settings.steps = next;
      persist();
    });
  }

  $('allowlist').addEventListener('change', (e) => {
    settings.allowlist = e.target.value
      .split('\n')
      .map((line) => NV.baseHost(line.trim()))
      .filter(Boolean);
    e.target.value = settings.allowlist.join('\n');
    persist();
  });

  $('reset-stats').addEventListener('click', async () => {
    const fresh = NV.emptyStats();
    await chrome.storage.local.set({ stats: fresh });
    renderStats(fresh);
    flashSaved();
  });

  $('reset-settings').addEventListener('click', async () => {
    settings = structuredClone(NV.DEFAULTS);
    render();
    await persist();
  });

  (async () => {
    const state = await chrome.runtime.sendMessage({ type: 'getState', host: '' });
    settings = { ...NV.DEFAULTS, ...state.settings, steps: { ...NV.DEFAULTS.steps, ...state.settings.steps } };
    render();
    renderStats(state.stats);
  })();
})();
