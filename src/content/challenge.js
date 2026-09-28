/*
 * Challenge generation. Pure data in, pure descriptors out — no DOM here.
 *
 * The point is friction, not security. Anyone determined enough will get
 * through; the goal is to make the cost of the next reel high enough that the
 * reflex dies. So: every challenge is freshly randomised (muscle memory is the
 * enemy), the wait is unskippable, and difficulty climbs with each unlock.
 */
var NV = globalThis.NV || (globalThis.NV = {});

const REFLECTIONS = [
  'What were you about to do before you opened this?',
  'What is the one thing on your list you are avoiding right now?',
  'How will you feel about the next ten minutes an hour from now?',
  'What are you hoping the next video gives you?',
  'When did you last decide to stop scrolling, and what happened?',
  'What would you rather have done with this half hour?',
  'Is this rest, or is this avoidance? Say which and why.',
  'What thought showed up just before you reached for your phone?',
  'Name the thing you will do the moment you close this tab.',
  'If you had to justify this to yourself tomorrow, what would you say?',
  'What are you actually tired of right now?',
  'Describe what you expect to remember from this in a week.'
];

/*
 * The gauntlet. Each question offers an honest way out and a way onward;
 * picking the honest answer ends it there and then. That is the whole
 * mechanism — you are not solving a puzzle, you are being asked to say out
 * loud that this is worth more than the alternative, six or seven times over.
 */
const QUESTIONS = [
  {
    text: 'Are you sure you want to watch this? Or can you just not stop yourself?',
    yes: 'I am sure',
    no: 'I cannot stop myself',
    retort: 'Then stopping is the whole point.'
  },
  {
    text: 'Is this better than taking a walk?',
    yes: 'Yes, this is better',
    no: 'No, a walk is better',
    retort: 'Go outside.'
  },
  {
    text: 'Is this better than calling your mom?',
    yes: 'Yes, this is better',
    no: 'No, I should call her',
    retort: 'Call her.'
  },
  {
    text: 'Is this better than watching birds?',
    yes: 'Yes, this is better',
    no: 'No, birds are better',
    retort: 'Go and find some birds.'
  },
  {
    text: 'Is this better than finishing the thing you said you would finish today?',
    yes: 'Yes, this is better',
    no: 'No, I should finish it',
    retort: 'Go and finish it.'
  },
  {
    text: 'Is this better than sleeping an hour earlier tonight?',
    yes: 'Yes, this is better',
    no: 'No, I need the sleep',
    retort: 'Then stop now and go and get it.'
  },
  {
    text: 'Is this better than texting the friend you keep meaning to text?',
    yes: 'Yes, this is better',
    no: 'No, I should text them',
    retort: 'Text them.'
  },
  {
    text: 'Is this better than reading ten pages of something?',
    yes: 'Yes, this is better',
    no: 'No, I would rather read',
    retort: 'Ten pages. Go.'
  },
  {
    text: 'Is this better than cooking yourself something properly?',
    yes: 'Yes, this is better',
    no: 'No, I should eat properly',
    retort: 'Go and cook.'
  },
  {
    text: 'Is this better than sitting outside doing nothing at all?',
    yes: 'Yes, this is better',
    no: 'No, I would rather sit outside',
    retort: 'Go and sit outside.'
  },
  {
    text: 'Is this better than moving your body for fifteen minutes?',
    yes: 'Yes, this is better',
    no: 'No, I should move',
    retort: 'Go and move.'
  },
  {
    text: 'Will you remember a single one of these videos tomorrow?',
    yes: 'Yes, I will',
    no: 'No, I will not',
    retort: 'Then what is it for?'
  },
  {
    text: 'Are you resting, or are you hiding?',
    yes: 'I am resting',
    no: 'I am hiding',
    retort: 'Then go and deal with the thing.'
  },
  {
    text: 'If someone watched you for the next hour, would you be proud of it?',
    yes: 'Yes, I would',
    no: 'No, I would not',
    retort: 'Then close it.'
  },
  {
    text: 'Is this better than starting the thing you have been putting off?',
    yes: 'Yes, this is better',
    no: 'No, I should start it',
    retort: 'Start it.'
  },
  {
    text: 'Is this better than ten minutes of quiet and a glass of water?',
    yes: 'Yes, this is better',
    no: 'No, I need the quiet',
    retort: 'Go and get the water.'
  }
];

/*
 * The opener always comes first — it is the only question about you rather
 * than about a trade-off, and it sets up everything after it. The rest are
 * drawn at random so the run is never the same twice.
 */
function buildQuestions(count, rng) {
  const [opener, ...rest] = QUESTIONS;
  const shuffled = rest.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const wanted = Math.max(1, Math.min(QUESTIONS.length, count | 0));
  return { kind: 'questions', items: [opener, ...shuffled.slice(0, wanted - 1)] };
}

const PLEDGE_PARTS = {
  opener: [
    'I am choosing this on purpose',
    'I know exactly what I am doing here',
    'Nobody made me open this'
  ],
  middle: [
    'and I am spending real time I do not get back',
    'and this is time borrowed from something I said mattered',
    'and I will not pretend this was an accident'
  ],
  closer: [
    'so I accept that the next hour is on me',
    'so I own whatever this costs me today',
    'so I will not complain about where the evening went'
  ]
};

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function intBetween(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

/* Unseeded on purpose. Seeding a PRNG from the clock made two challenges
 * generated in the same millisecond come out identical, and left nearby
 * seeds visibly correlated — the opposite of what something that must not
 * become memorisable needs. */
function rand() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

/*
 * A chained arithmetic problem. Deliberately awkward to do in your head but
 * entirely possible — two-digit multiplication then two more operations, with
 * digit sizes growing by level.
 */
function buildMath(level, rng) {
  const a = intBetween(12 + level * 4, 29 + level * 12, rng);
  const b = intBetween(4, 8 + level * 2, rng);
  const c = intBetween(30, 90 + level * 40, rng);
  const d = intBetween(11, 60 + level * 30, rng);

  const addFirst = rng() > 0.5;
  const answer = addFirst ? a * b + c - d : a * b - c + d;
  const prompt = addFirst
    ? `${a} × ${b} + ${c} − ${d}`
    : `${a} × ${b} − ${c} + ${d}`;

  return { kind: 'math', prompt, answer };
}

function buildPledge(level, rng, ctx) {
  const parts = [pick(PLEDGE_PARTS.opener, rng), pick(PLEDGE_PARTS.middle, rng)];
  if (level >= 1) parts.push(pick(PLEDGE_PARTS.closer, rng));

  let sentence = parts.join(', ') + '.';

  /* Fold in today's real numbers so the sentence is never the same twice and
   * typing it out means reading the tally. */
  if (level >= 2 && ctx.unlocksToday > 0) {
    sentence =
      `This is unlock number ${ctx.unlocksToday + 1} today. ` + sentence;
  }
  return { kind: 'pledge', sentence };
}

/*
 * ctx: { seconds, reason, siteLabel, unlocksToday, settings }
 */
NV.buildChallenge = function buildChallenge(ctx) {
  const settings = ctx.settings || NV.DEFAULTS;
  const rng = rand;

  /* Level 0 on the first unlock of the day, climbing to 4. */
  const level = settings.escalate ? Math.min(4, ctx.unlocksToday) : 0;

  const steps = [];
  const want = settings.steps || NV.DEFAULTS.steps;

  if (want.questions) {
    /* One extra question for every unlock already spent today. */
    const base = settings.questionCount || NV.DEFAULTS.questionCount;
    steps.push(buildQuestions(base + level, rng));
  }

  if (want.reflect) {
    steps.push({
      kind: 'reflect',
      question: pick(REFLECTIONS, rng),
      minWords: 8 + level * 2
    });
  }

  if (want.wait) {
    steps.push({
      kind: 'wait',
      seconds: Math.max(5, (settings.baseWaitSeconds | 0) + level * 10)
    });
  }

  if (want.pledge) steps.push(buildPledge(level, rng, ctx));

  if (want.math) {
    steps.push(buildMath(level, rng));
    /* From the third unlock on, one sum is not enough. */
    if (level >= 3) steps.push(buildMath(level, rng));
  }

  /* Never let the challenge be empty — that would turn the block into a
   * single click, which is the one outcome that defeats the whole point. */
  if (!steps.length) steps.push(buildMath(level, rng));

  return { level, steps };
};

/*
 * Reflection answers are graded for effort, not content: enough words, enough
 * distinct words, and no single word hammered over and over.
 */
NV.gradeReflection = function gradeReflection(text, minWords) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);

  if (words.length < minWords) {
    return { ok: false, message: `${minWords} words minimum — you have ${words.length}.` };
  }

  const distinct = new Set(words);
  if (distinct.size < Math.ceil(minWords * 0.6)) {
    return { ok: false, message: 'Use real words. Repeating one does not count.' };
  }

  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  for (const [w, n] of counts) {
    if (n > 3 && w.length > 2) {
      return { ok: false, message: `You typed "${w}" ${n} times. Write a real answer.` };
    }
  }

  return { ok: true };
};

/* A fresh problem on its own, for the retry-after-wrong-answer path. */
NV.newMathProblem = function newMathProblem(level) {
  return buildMath(Math.max(0, Math.min(4, level | 0)), rand);
};
