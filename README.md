# Doorman

Doorman is a browser extension that stops you watching short videos.

Any video under 30 seconds will not play. YouTube Shorts, Instagram Reels,
TikTok, Facebook Reels and Snapchat Spotlight are blocked completely.

You can still get in if you really want to. But first Doorman asks you seven
questions, one at a time:

> **Is this better than calling your mom?**
> *Yes, this is better* · *No, I should call her*

If you answer honestly, it closes and you do not get in. It just says
*"Call her."* and the video stays blocked.

That is the whole idea. It is not trying to lock you out. It is trying to make
you stop and think for a moment, because most of the time you were not
choosing to watch. You were just scrolling.

## What it does

- Blocks any video shorter than 30 seconds, on any website
- Blocks Shorts, Reels, TikTok and Spotlight pages completely
- Hides the Shorts shelf on YouTube and the Reels tab on Instagram, so you do
  not even see the link
- Counts how many videos it stopped today, on the toolbar icon
- Leaves normal things alone: ads, long videos, live streams, hover previews
  and background videos all play as usual

## Install

You need a Chromium browser: Chrome, Edge, Brave, Arc or Dia. Version 111 or
newer.

1. Download this folder to your computer
2. Open `chrome://extensions` in your browser (in Dia, open `dia://extensions`)
3. Turn on **Developer mode**. The switch is in the top right corner
4. Click **Load unpacked**
5. Choose the Doorman folder
6. Pin the icon to your toolbar so you can see the counter

The settings page opens by itself the first time.

Firefox does not work yet. See [Notes](#notes) at the bottom.

## How to use it

You do not have to do anything. It works as soon as it is installed.

When a short video is blocked you will see a dark panel over it. You have two
choices:

- **Get me out of here** — closes the page or goes back
- **I still want to watch** — starts the seven questions

If you answer all seven and say yes every time, the video unlocks for 90
seconds. Then it locks again.

Every time you force your way in, the next time gets harder. One more question
is added each time. It resets at midnight.

## Settings

Click the icon, then **All settings**. You can change:

| Setting | What it means |
|---|---|
| Minimum video length | 30 seconds by default. Anything shorter is blocked |
| An unlock lasts | How long you get after answering. 90 seconds by default. Set it to 5 seconds if you want to be asked every single time |
| How many questions | 7 by default |
| Strict mode | No questions and no way in at all. You have to come back here to turn it off |
| Never block these sites | A list of websites to leave alone |

There are two harder steps you can turn on if the questions get too easy:
typing out a sentence word for word, and doing maths in your head.

### You cannot switch it off from YouTube

On a site Doorman guards — YouTube, Instagram, TikTok, Facebook, Snapchat —
the switches in the popup are locked. You cannot turn Doorman off, and you
cannot add the site to the allow list, while you are standing on it.

Reaching for the off switch halfway through a reel is the exact moment the
extension exists for, so that is the one moment it says no.

You can always make it stricter from anywhere: turning Doorman back **on**, or
removing a site that is already allowed, works everywhere. Only loosening is
blocked, and only on the sites it guards. Anywhere else, both switches behave
normally.

To turn it off properly, open **All settings** — which takes a deliberate
visit, rather than one thumb movement without thinking.

## For developers

No build step and no dependencies. The files you load are the files that run.

Run the tests:

```bash
node dev/logic.test.mjs
```

Try the blocking without opening a real reel:

```bash
python3 dev/serve.py
```

Then open <http://127.0.0.1:8731/dev/>. It shows fake videos of known lengths,
each one labelled with what should happen to it, so you can see at a glance if
something is wrong. You can also add `?steps=questions`, `?unlocks=3` or
`?pass=8` to the URL to test different situations quickly.

Redraw the icons after changing them:

```bash
python3 tools/make-icons.py
```

### How it works

A browser extension normally runs in its own separate JavaScript world. That
means it cannot stop a website's own code from playing a video. So Doorman is
split in two:

- **`src/content/enforcer.js`** runs inside the page's own world and does one
  job: refuse to play locked videos. It reports the same error the browser
  gives when autoplay is blocked, so video players handle it calmly instead of
  breaking.
- **`src/content/guard.js`** runs separately and makes all the decisions:
  measuring videos, showing the panel, keeping score.

The two halves talk through HTML attributes, because both can see the same
page. `data-doorman-lock` on a video means that video cannot play.

> **Careful:** that attribute name is written in both files, because the
> enforcer cannot read shared code. If you change one and not the other,
> blocking stops working and nothing reports an error. There is a test that
> catches this.

```
manifest.json
src/
  shared/defaults.js     all the settings and their defaults
  shared/sites.js        rules for YouTube, Instagram, TikTok and the rest
  content/enforcer.js    refuses to play locked videos
  content/guard.js       decides what to block
  content/challenge.js   writes the questions
  content/ui.js          the panel and the questions screen
  background/            saves settings and counts
  options/  popup/       the settings page and the toolbar popup
dev/                     tests and a practice page
tools/make-icons.py      draws the icons
```

## Notes

- **Site rules will break eventually.** The code that hides the Shorts shelf
  and the Reels tab depends on how those websites are built today. When they
  redesign, it will stop hiding them. Everything is in `src/shared/sites.js`.
- **It needs permission for every website**, because short videos can be on
  any website. Nothing is sent anywhere. There is no network code in the
  extension at all. Everything stays in your browser.
- **This is friction, not a lock.** Anyone who really wants to get through
  will get through. That is on purpose. It only makes the habit cost something.
- **Firefox** does not support the trick the enforcer uses, so it would need a
  different approach there. Everything else is standard.
