/* Popup: today's numbers, the master switch, and a per-site exemption. */
(() => {
  const $ = (id) => document.getElementById(id);

  let settings = { ...NV.DEFAULTS };
  let host = '';
  let guarded = false;
  let passExpiresAt = 0;
  let countdown = 0;

  const flashSaved = () => {
    $('saved').classList.add('saved--on');
    setTimeout(() => $('saved').classList.remove('saved--on'), 900);
  };

  async function save(patch) {
    settings = { ...settings, ...patch };
    await chrome.storage.local.set({ settings });
    flashSaved();
  }

  /*
   * On a site Doorman guards you may tighten it but never loosen it. Reaching
   * for the off switch mid-scroll is the exact moment the extension exists
   * for, so that is the one moment it refuses. Turning it back ON, or removing
   * an existing exemption, stays available — locking those would only ever
   * trap you in the weaker state.
   */
  function applyLocks() {
    const siteAllowed = !!host && (settings.allowlist || []).includes(host);
    const lockMaster = guarded && settings.enabled;
    const lockSite = guarded && !siteAllowed;

    $('enabled').disabled = lockMaster;
    $('allow-site').disabled = !host || lockSite;

    const why = lockMaster
      ? `Doorman will not let you switch it off while you are on ${host}.`
      : lockSite
        ? `Doorman will not let you exempt ${host} from here.`
        : '';

    $('locked').hidden = !why;
    $('locked-why').textContent = why;
  }

  function renderPass() {
    const left = passExpiresAt - Date.now();
    if (left <= 0) {
      $('pass').hidden = true;
      clearInterval(countdown);
      return;
    }
    $('pass').hidden = false;
    $('pass-left').textContent = `${Math.ceil(left / 1000)}s`;
  }

  async function load() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let url = null;
    try {
      url = tab && tab.url ? new URL(tab.url) : null;
    } catch {}

    host = url && /^https?:$/.test(url.protocol) ? NV.baseHost(url.hostname) : '';
    guarded = NV.isGuardedHost(host);
    $('host').textContent = host || 'not a web page';

    const state = await chrome.runtime.sendMessage({ type: 'getState', host });
    settings = state.settings;

    $('enabled').checked = settings.enabled;
    $('allow-site').checked = !!host && (settings.allowlist || []).includes(host);
    applyLocks();

    $('s-blocked').textContent = state.stats.blocked;
    $('s-unlocks').textContent = state.stats.unlocks;
    $('s-waited').textContent = NV.fmtShort(state.stats.secondsWaited);

    passExpiresAt = state.pass.active ? state.pass.expiresAt : 0;
    if (passExpiresAt) {
      renderPass();
      countdown = setInterval(renderPass, 500);
    }
  }

  $('enabled').addEventListener('change', (e) => {
    if (guarded && !e.target.checked) {
      e.target.checked = true; /* disabled inputs do not fire, but be certain */
      applyLocks();
      return;
    }
    save({ enabled: e.target.checked }).then(applyLocks);
  });

  $('allow-site').addEventListener('change', (e) => {
    if (!host) return;
    if (guarded && e.target.checked) {
      e.target.checked = false;
      applyLocks();
      return;
    }
    const list = new Set(settings.allowlist || []);
    if (e.target.checked) list.add(host);
    else list.delete(host);
    save({ allowlist: [...list] }).then(applyLocks);
  });

  $('relock').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'revokePass', host });
    passExpiresAt = 0;
    renderPass();
  });

  $('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  load();
})();
