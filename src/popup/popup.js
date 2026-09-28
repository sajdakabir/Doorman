/* Popup: today's numbers, the master switch, and a per-site exemption. */
(() => {
  const $ = (id) => document.getElementById(id);

  let settings = { ...NV.DEFAULTS };
  let host = '';
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
    $('host').textContent = host || 'not a web page';
    $('allow-site').disabled = !host;

    const state = await chrome.runtime.sendMessage({ type: 'getState', host });
    settings = state.settings;

    $('enabled').checked = settings.enabled;
    $('allow-site').checked = !!host && (settings.allowlist || []).includes(host);

    $('s-blocked').textContent = state.stats.blocked;
    $('s-unlocks').textContent = state.stats.unlocks;
    $('s-waited').textContent = NV.fmtShort(state.stats.secondsWaited);

    passExpiresAt = state.pass.active ? state.pass.expiresAt : 0;
    if (passExpiresAt) {
      renderPass();
      countdown = setInterval(renderPass, 500);
    }
  }

  $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));

  $('allow-site').addEventListener('change', (e) => {
    if (!host) return;
    const list = new Set(settings.allowlist || []);
    if (e.target.checked) list.add(host);
    else list.delete(host);
    save({ allowlist: [...list] });
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
