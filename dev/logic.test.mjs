import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

/* Defaults to the project root, so `node dev/logic.test.mjs` just works. */
/* fileURLToPath, not .pathname — a path with spaces comes back percent-encoded. */
const ROOT = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const ctx = vm.createContext({ console, Date, Math, Number, Set, Map, String, crypto, Uint32Array });
for (const f of ['src/shared/defaults.js', 'src/shared/sites.js', 'src/content/challenge.js']) {
  vm.runInContext(fs.readFileSync(`${ROOT}/${f}`, 'utf8'), ctx, { filename: f });
}
const NV = ctx.NV;

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

console.log('cross-world contract');
t('the lock attributes match in both worlds', () => {
  /* enforcer.js runs in the page's own JS world and cannot read NV, so it
   * repeats these two strings by hand. If the copies ever drift, blocking
   * stops working silently — no error, videos just play. */
  const enforcer = fs.readFileSync(`${ROOT}/src/content/enforcer.js`, 'utf8');
  const grab = (src, name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`));
    assert.ok(m, `${name} not found`);
    return m[1];
  };
  assert.equal(grab(enforcer, 'LOCK_ATTR'), NV.LOCK_ATTR);
  assert.equal(grab(enforcer, 'LOCK_ALL_ATTR'), NV.LOCK_ALL_ATTR);
});
t('the shadow host tag and hide-style id carry the product name', () => {
  const ui = fs.readFileSync(`${ROOT}/src/content/ui.js`, 'utf8');
  const guard = fs.readFileSync(`${ROOT}/src/content/guard.js`, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(`${ROOT}/manifest.json`, 'utf8'));
  const slug = manifest.name.toLowerCase();
  assert.ok(ui.includes(`'${slug}-root'`), 'shadow host tag is stale');
  assert.ok(guard.includes(`'${slug}-hide'`), 'hide-style id is stale');
  assert.ok(NV.LOCK_ATTR.includes(slug), 'lock attribute is stale');
});

console.log('site matching');
t('youtube shorts page is short form', () => {
  const site = NV.isShortFormPage({ hostname: 'www.youtube.com', pathname: '/shorts/abc123' });
  assert.equal(site.id, 'youtube');
});
t('youtube watch page is not', () => {
  assert.equal(NV.isShortFormPage({ hostname: 'www.youtube.com', pathname: '/watch' }), null);
});
t('no site offers a way to reach the same video unblocked', () => {
  for (const site of NV.SITES) {
    assert.equal(typeof site.escape, 'undefined', `${site.id} still has an escape hatch`);
  }
});
t('feed-only sites are marked to close rather than go back', () => {
  const byId = Object.fromEntries(NV.SITES.map(s => [s.id, s]));
  assert.equal(byId.tiktok.closeTab, true);
  assert.equal(byId.snapchat.closeTab, true);
  assert.ok(!byId.youtube.closeTab);
});
t('instagram reel and stories match, profile does not', () => {
  assert.ok(NV.isShortFormPage({ hostname: 'www.instagram.com', pathname: '/reels/x/' }));
  assert.ok(NV.isShortFormPage({ hostname: 'instagram.com', pathname: '/reel/x/' }));
  assert.ok(NV.isShortFormPage({ hostname: 'instagram.com', pathname: '/stories/bob/' }));
  assert.equal(NV.isShortFormPage({ hostname: 'instagram.com', pathname: '/someuser/' }), null);
});
t('all of tiktok matches; unrelated hosts do not', () => {
  assert.ok(NV.isShortFormPage({ hostname: 'www.tiktok.com', pathname: '/foryou' }));
  assert.equal(NV.matchSite({ hostname: 'vimeo.com' }), null);
});
t('lookalike hosts do not match', () => {
  assert.equal(NV.matchSite({ hostname: 'notyoutube.com' }), null);
  assert.equal(NV.matchSite({ hostname: 'youtube.com.evil.net' }), null);
});

console.log('host normalisation');
t('www/m prefixes collapse', () => {
  assert.equal(NV.baseHost('www.YouTube.com'), 'youtube.com');
  assert.equal(NV.baseHost('m.youtube.com'), 'youtube.com');
});

console.log('challenge generation');
t('default challenge is the gauntlet then a wait', () => {
  const c = NV.buildChallenge({ unlocksToday: 0, settings: NV.DEFAULTS });
  assert.equal(c.steps.map(s => s.kind).join(','), 'questions,wait');
  assert.equal(c.level, 0);
});
t('enabling every step keeps them in a fixed order', () => {
  const all = { questions: true, reflect: true, wait: true, pledge: true, math: true };
  const c = NV.buildChallenge({ unlocksToday: 0, settings: { ...NV.DEFAULTS, steps: all } });
  assert.equal(c.steps.map(s => s.kind).join(','), 'questions,reflect,wait,pledge,math');
});
t('difficulty escalates and adds a second sum', () => {
  const on = { ...NV.DEFAULTS, steps: { questions: true, reflect: true, wait: true, pledge: true, math: true } };
  const a = NV.buildChallenge({ unlocksToday: 0, settings: on });
  const d = NV.buildChallenge({ unlocksToday: 4, settings: on });
  const wait = c => c.steps.find(s => s.kind === 'wait').seconds;
  assert.ok(wait(d) > wait(a), `${wait(d)} > ${wait(a)}`);
  assert.equal(d.steps.filter(s => s.kind === 'math').length, 2);
  assert.ok(d.steps.find(s => s.kind === 'reflect').minWords >
            a.steps.find(s => s.kind === 'reflect').minWords);
});
t('escalate off keeps level 0 however many unlocks', () => {
  const c = NV.buildChallenge({
    unlocksToday: 9,
    settings: { ...NV.DEFAULTS, escalate: false, steps: { ...NV.DEFAULTS.steps, math: true } }
  });
  assert.equal(c.level, 0);
  assert.equal(c.steps.filter(s => s.kind === 'math').length, 1);
  assert.equal(c.steps.find(s => s.kind === 'questions').items.length, 7);
});
t('every step disabled still yields a challenge', () => {
  const c = NV.buildChallenge({
    unlocksToday: 0,
    settings: { ...NV.DEFAULTS, steps: { questions: false, reflect: false, wait: false, pledge: false, math: false } }
  });
  assert.ok(c.steps.length >= 1);
});
t('math answers are correct for 500 generated problems', () => {
  for (let i = 0; i < 500; i++) {
    const p = NV.newMathProblem(i % 5);
    const [, a, b, op2, c, op3, d] =
      p.prompt.match(/^(\d+) × (\d+) ([+−]) (\d+) ([+−]) (\d+)$/);
    const first = Number(a) * Number(b);
    const step2 = op2 === '+' ? first + Number(c) : first - Number(c);
    const expect = op3 === '+' ? step2 + Number(d) : step2 - Number(d);
    assert.equal(p.answer, expect, p.prompt);
  }
});
t('challenges are not repeats of each other', () => {
  const seen = new Set();
  const withMath = { ...NV.DEFAULTS, steps: { ...NV.DEFAULTS.steps, math: true } };
  for (let i = 0; i < 40; i++) {
    seen.add(NV.buildChallenge({ unlocksToday: 2, settings: withMath })
      .steps.find(s => s.kind === 'math').prompt);
  }
  assert.ok(seen.size > 20, `only ${seen.size} distinct prompts in 40`);
});

console.log('question gauntlet');
t('default challenge leads with seven questions', () => {
  const c = NV.buildChallenge({ unlocksToday: 0, settings: NV.DEFAULTS });
  assert.equal(c.steps[0].kind, 'questions');
  assert.equal(c.steps[0].items.length, 7);
});
t('the opener is always first', () => {
  for (let i = 0; i < 20; i++) {
    const c = NV.buildChallenge({ unlocksToday: 0, settings: NV.DEFAULTS });
    assert.match(c.steps[0].items[0].text, /can you just not stop yourself/);
  }
});
t('every question offers a way out and a way on', () => {
  const c = NV.buildChallenge({ unlocksToday: 0, settings: NV.DEFAULTS });
  for (const q of c.steps[0].items) {
    for (const key of ['text', 'yes', 'no', 'retort']) {
      assert.ok(q[key] && q[key].length > 2, `${key} missing on: ${q.text}`);
    }
  }
});
t('no question is asked twice in one run', () => {
  for (let i = 0; i < 30; i++) {
    const items = NV.buildChallenge({ unlocksToday: 0, settings: NV.DEFAULTS }).steps[0].items;
    assert.equal(new Set(items.map(q => q.text)).size, items.length);
  }
});
t('the run is shuffled, not fixed', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(NV.buildChallenge({ unlocksToday: 0, settings: NV.DEFAULTS })
      .steps[0].items.map(q => q.text).join('|'));
  }
  assert.ok(seen.size > 20, `only ${seen.size} distinct runs in 30`);
});
t('each unlock today adds another question', () => {
  const at = n => NV.buildChallenge({ unlocksToday: n, settings: NV.DEFAULTS }).steps[0].items.length;
  assert.equal(at(0), 7);
  assert.equal(at(2), 9);
  assert.equal(at(4), 11);
});
t('the pool caps the run rather than repeating', () => {
  const c = NV.buildChallenge({
    unlocksToday: 4,
    settings: { ...NV.DEFAULTS, questionCount: 16 }
  });
  const items = c.steps[0].items;
  assert.equal(new Set(items.map(q => q.text)).size, items.length);
});
t('the gauntlet can be switched off', () => {
  const c = NV.buildChallenge({
    unlocksToday: 0,
    settings: { ...NV.DEFAULTS, steps: { ...NV.DEFAULTS.steps, questions: false } }
  });
  assert.ok(!c.steps.some(s => s.kind === 'questions'));
  assert.ok(c.steps.length >= 1);
});

console.log('reflection grading');
t('rejects short, spam and repetition; accepts real answers', () => {
  assert.equal(NV.gradeReflection('no', 8).ok, false);
  assert.equal(NV.gradeReflection('aaa aaa aaa aaa aaa aaa aaa aaa', 8).ok, false);
  assert.equal(NV.gradeReflection('x x x x x x x x x x', 8).ok, false);
  assert.equal(
    NV.gradeReflection('I was meant to be finishing the migration script before dinner', 8).ok,
    true
  );
});
t('word-repetition guard catches padded answers', () => {
  const r = NV.gradeReflection('bored bored bored bored tired of this whole thing today', 8);
  assert.equal(r.ok, false);
  assert.match(r.message, /bored/);
});

console.log('formatting');
t('durations read naturally', () => {
  assert.equal(NV.fmtDuration(1), '1 second');
  assert.equal(NV.fmtDuration(45), '45 seconds');
  assert.equal(NV.fmtDuration(90), '1m 30s');
  assert.equal(NV.fmtDuration(120), '2 minutes');
  assert.equal(NV.fmtDuration(3900), '1h 5m');
});

console.log(`\n${pass} assertions passed`);
