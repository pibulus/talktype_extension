# Website kit — talktype.app/extension

Everything the landing page and the privacy page need. Assets referenced here live in this folder; copy them into the webapp repo's static dir.

## Files

| File | Size | Use |
|---|---|---|
| `og-image.png` | 1200×630 | `og:image` / `twitter:image` for talktype.app/extension |
| `github-social.png` | 1280×640 | GitHub → repo Settings → Social preview |
| `promo-marquee.png` | 1400×560 | Store marquee tile; also works as a landing page hero band |
| `screenshot-1..5.png` | 1280×800 | Store screenshots; reuse on the landing page as a feature strip |
| `../src/icons/ghost/ghost-512.png` | 512 | Favicon / apple-touch-icon source |

## `<head>` for talktype.app/extension

```html
<title>TalkType for Chrome — talk into any text box</title>
<meta name="description" content="Voice to text in any text box on the web. Zero setup, or bring your own key for personality styles, live streaming, or fully offline transcription. No account, no server in the middle.">
<link rel="canonical" href="https://talktype.app/extension">

<meta property="og:type" content="website">
<meta property="og:site_name" content="TalkType">
<meta property="og:title" content="TalkType for Chrome — talk into any text box">
<meta property="og:description" content="Say it messy, get it clean. Voice to text anywhere on the web. Works the second you install; no account, no server in the middle.">
<meta property="og:url" content="https://talktype.app/extension">
<meta property="og:image" content="https://talktype.app/og/extension.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The TalkType ghost next to the words: Say it messy, get it clean. Voice to text in any text box.">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="TalkType for Chrome — talk into any text box">
<meta name="twitter:description" content="Say it messy, get it clean. Voice to text anywhere on the web. No account, no server in the middle.">
<meta name="twitter:image" content="https://talktype.app/og/extension.png">

<meta name="theme-color" content="#fff8eb">
```

Structured data (optional, helps the Chrome listing and search snippets):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "TalkType for Chrome",
  "applicationCategory": "BrowserApplication",
  "operatingSystem": "Chrome",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "Voice to text in any text box on the web. Zero setup, or bring your own key for personality styles, live streaming, or fully offline transcription.",
  "url": "https://talktype.app/extension",
  "author": { "@type": "Person", "name": "Pablo Murdoch" }
}
</script>
```

## Landing page copy

**Hero**

> # Talk into any text box.
> Say it messy, get it clean. A little ghost appears next to every text field on the web. Click it, say your thing, it lands where your cursor is.
>
> [Add to Chrome — it's free]   _No account. Works the second you install._

**Three beats** (icons: bolt / cloud / lock)

> **Zero setup.** Install, click the ghost, talk. Chrome's built-in recognition kicks in with nothing to configure.
>
> **Your key, your styles.** Plug in a free Gemini key for six personality styles, or Deepgram for words that stream in as you talk. Keys stay on your device.
>
> **Or fully private.** Whisper runs inside Chrome. One download, then your voice never leaves your machine.

**Feature strip** (use the five store screenshots, in order, with these one-liners)

1. Talk into any text box. — Gmail, Notion, Slack, Discord, Reddit, ChatGPT, comment boxes, forms.
2. One button. Any text box. — Or Alt+Shift+D from the keyboard. Esc throws it away.
3. Four engines. Your call. — Quick, Cloud, Live, Private. Switch any time.
4. Six personalities. Or bring your own. — Clean & Accurate for work. Surly Pirate for Slack.
5. No account. No server in the middle. — No analytics, no telemetry. Private mode keeps every word on your machine.

**Trust line** (above the fold, small)

> No accounts. No analytics. No server in the middle. [Privacy policy]

**Footer CTA**

> ## Go talk.
> [Add to Chrome]   [Source on GitHub]

## Privacy page

Publish `../PRIVACY.md` verbatim at `https://talktype.app/extension/privacy`. The store listing and the extension's Settings page both link there.

## Alt text for screenshots

1. "A mail compose window with the TalkType ghost button beside each text field and a listening toast in the corner."
2. "The TalkType popup: a Start talking button, an engine chip, the keyboard shortcut, and a settings chip."
3. "Four engine tiles: Quick, Cloud, Live, Private."
4. "A grid of output styles: Clean & Accurate, Surly Pirate, L33t Sp34k, Sparkle Pop, Code Whisperer, Quill & Ink, Bring your own."
5. "The engine picker with the headline: No account. No server in the middle."
