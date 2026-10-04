# MMM-SchoolLunch

A [MagicMirror²](https://magicmirror.builders/) module that reads the school's weekly lunch email and shows Monday to Friday on the mirror. Today is highlighted and past days fade.

## Install

```bash
cd ~/MagicMirror/modules
# copy this folder here, then:
cd MMM-SchoolLunch
npm install
```

## Configure

Add to `config/config.js`:

```js
{
  module: "MMM-SchoolLunch",
  position: "top_right",
  config: {
    imap: {
      host: "imap.gmail.com",
      user: "you@gmail.com",
      password: "your-app-password"
    },
    from: "lunch@yourschool.org",   // part of the sender's address
    subject: "lunch menu"           // optional, word(s) in the subject
  }
}
```

**Mailbox tips**

- Gmail: turn on 2-step verification, then create an *app password* (Google Account → Security → App passwords). Use that, not your normal password.
- Yahoo: host `imap.mail.yahoo.com`. Generate an *app password* under Account Info → Account security.
- Microsoft accounts may require OAuth for IMAP. The easy workaround is to forward the school's emails to a Gmail, iCloud or Fastmail address.
- MagicMirror sends `config.js` to the browser, so use a mailbox you don't mind exposing, or set `SCHOOL_LUNCH_IMAP_USER` and `SCHOOL_LUNCH_IMAP_PASSWORD` as environment variables and leave them out of the config.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `from`, `subject` | `""` | Narrow down which email is the menu. Set at least one. |
| `searchDays` | `21` | How far back to look. |
| `weekOffset` | `0` | Only used when the email doesn't say which week it covers. If it contains "week of 10/5", that date wins. Otherwise a Sat/Sun email is next week's menu, and a Mon-Fri email is this week's (use `1` for next week's). |
| `layout` | `"vertical"` | `"horizontal"` for a bottom or top bar. |
| `dayFormat` | `"short"` | `"long"` shows full weekday names. |
| `highlightToday` | `true` | |
| `hidePastDays` | `false` | Hide days that have already passed. |
| `updateInterval` | 1 hour | How often to check the mailbox. |
| `startAfter` | `""` | Regex. Only read the email from the first matching line on. Needed for newsletters. |
| `endBefore` | `""` | Regex. Stop reading at the first matching line. |
| `splitOr` | `false` | `Pizza or Quesadilla` becomes two lines, `Pizza` and `or Quesadilla`. |
| `debug` | `false` | Logs the email text the module sees and the parse result to the MagicMirror console. |
| `stopPatterns` | `[]` | Regex strings. A matching line ends the current day (good for footers). |
| `ignorePatterns` | `[]` | Regex strings. Matching lines are dropped (e.g. `"^breakfast"`). |
| `blankLineEndsDay` | `false` | End a day at the first blank line after its items. |
| `splitInline` | `true` | `Monday: A, B, C` becomes three items. |

## Newsletter-style emails (e.g. "The Bees' Buzz")

If the menu is one section of a longer newsletter, weekday names show up elsewhere too (an events list, the date in the header). Fence in the menu section with `startAfter` and `endBefore`. For Broadneck Elementary:

```js
config: {
  imap: { host: "imap.mail.yahoo.com", user: "you@yahoo.com", password: "app-password" },
  from: "aacps.org",
  subject: "Buzz",
  startAfter: "menu for the week of",
  endBefore: "Grab and Go|REMINDER",
  splitOr: true
}
```

The newsletter arrives Friday evening and says "the week of 10/5-10/9", so the module shows it as the following week automatically.

If it doesn't parse, set `debug: true`, restart MagicMirror, and look at the console output. It prints the exact text the module extracted from the email, which is what `startAfter` and `endBefore` need to match.

## How the parsing works

The module looks for lines that start with a weekday (`Monday`, `Tues:`, `**Wednesday 10/8**`). Everything after it, on the same line or the lines below, belongs to that day until the next weekday, a weekend line, a sign-off like "Thanks," or a `stopPatterns` match.

To check how your school's email parses without touching the mirror, paste the email body into a text file and run:

```bash
node parser.js my-email.txt --startAfter "menu for the week of" --endBefore "Grab and Go" --splitOr
```

If footer text sneaks onto Friday, add a `stopPatterns` entry for it. If breakfast and lunch are both listed, use `ignorePatterns` to drop the breakfast lines.

## Limits

- If the menu is an image or PDF attachment rather than text in the email body, it can't be read. A different approach (OCR or a link to the menu page) would be needed.
- Only the first block for each weekday is used, so a two-week menu shows the first week.
