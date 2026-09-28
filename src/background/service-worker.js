/*
 * Service worker: the single owner of settings, unlock passes and stats.
 *
 * Content scripts never write storage directly. Routing every mutation
 * through here keeps two tabs from clobbering each other's counters, and
 * keeps passes in session storage, which content scripts cannot reach.
 */
importScripts('/src/shared/defaults.js');

const SESSION_PASS_KEY = 'passes';

/* Storage reads and writes are serialised so concurrent tabs cannot lose a
 * counter increment to a read-modify-write race. */
let queue = Promise.resolve();
function serialize(work) {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...NV.DEFAULTS, ...(settings || {}) };
}

/* Stats roll over at local midnight; the previous day folds into all-time. */
async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  const today = NV.localDay();

  if (!stats) {
    const fresh = NV.emptyStats();
    await chrome.storage.local.set({ stats: fresh });
    return fresh;
  }
  if (stats.day === today) return stats;

  const rolled = {
    day: today,
    blocked: 0,
    unlocks: 0,
    secondsWaited: 0,
    allTime: {
      blocked: (stats.allTime?.blocked || 0) + (stats.blocked || 0),
      unlocks: (stats.allTime?.unlocks || 0) + (stats.unlocks || 0),
      secondsWaited: (stats.allTime?.secondsWaited || 0) + (stats.secondsWaited || 0)
    }
  };
  await chrome.storage.local.set({ stats: rolled });
  return rolled;
}

async function writeStats(stats) {
  await chrome.storage.local.set({ stats });
  await paintBadge(stats);
}

async function paintBadge(stats) {
  try {
    const settings = await getSettings();
    const text = !settings.enabled ? 'off' : stats.blocked ? String(stats.blocked) : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: settings.enabled ? '#b8412a' : '#5a5f6b' });
  } catch {}
}

async function getPasses() {
  const stored = await chrome.storage.session.get(SESSION_PASS_KEY);
  return stored[SESSION_PASS_KEY] || {};
}

async function readPass(host) {
  const passes = await getPasses();
  const expiresAt = passes[host] || 0;
  if (!expiresAt || Date.now() >= expiresAt) return { active: false, expiresAt: 0 };
  return { active: true, expiresAt };
}

async function grantPass(host, seconds) {
  const passes = await getPasses();
  const expiresAt = Date.now() + Math.max(1, seconds | 0) * 1000;
  passes[host] = expiresAt;

  /* Drop anything already stale so session storage does not grow forever. */
  const now = Date.now();
  for (const key of Object.keys(passes)) {
    if (passes[key] <= now) delete passes[key];
  }

  await chrome.storage.session.set({ [SESSION_PASS_KEY]: passes });
  return { expiresAt };
}

const HANDLERS = {
  async getState({ host }) {
    const [settings, stats, pass] = await Promise.all([
      getSettings(),
      getStats(),
      readPass(host)
    ]);
    return { settings, stats, pass };
  },

  async grantPass({ host, seconds }) {
    return serialize(async () => {
      const granted = await grantPass(host, seconds);
      const stats = await getStats();
      stats.unlocks += 1;
      await writeStats(stats);
      return granted;
    });
  },

  async recordBlock() {
    return serialize(async () => {
      const stats = await getStats();
      stats.blocked += 1;
      await writeStats(stats);
      return { ok: true };
    });
  },

  async recordWait({ seconds }) {
    return serialize(async () => {
      const stats = await getStats();
      stats.secondsWaited += Math.max(0, seconds | 0);
      await writeStats(stats);
      return { ok: true };
    });
  },

  async revokePass({ host }) {
    const passes = await getPasses();
    delete passes[host];
    await chrome.storage.session.set({ [SESSION_PASS_KEY]: passes });
    return { ok: true };
  },

  async clearPasses() {
    await chrome.storage.session.set({ [SESSION_PASS_KEY]: {} });
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  const handler = message && HANDLERS[message.type];
  if (!handler) return false;

  handler(message)
    .then(respond)
    .catch((err) => respond({ error: String(err && err.message) }));
  return true; /* keep the channel open for the async reply */
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await getSettings();
  await chrome.storage.local.set({ settings });
  await paintBadge(await getStats());

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.session.set({ [SESSION_PASS_KEY]: {} });
  await paintBadge(await getStats());
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) await paintBadge(await getStats());
});
