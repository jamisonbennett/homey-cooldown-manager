# Cooldown Manager for Homey

This **`README.md`** is the project documentation for **GitHub**. The long description for the **Homey App Store** is maintained separately in [`README.txt`](./README.txt); keep user-facing facts in sync when you change either file.


Keep Flows from triggering too often with reusable cooldown keys — no timer spaghetti, logic variables, or helper Flows required.

Add one **And** card to throttle an automation:

```text
AND Allow hall_motion once every 10 minutes
```

When a run is blocked, Cooldown Manager tracks a **block count** — how many times in a row that key has been blocked since the last allowed run. Use **When** cards to react to repeated blocks, or **Then** cards to reset the cooldown, suspend it, or adjust how many runs remain in the current interval.

---

## Common use cases

Cooldown Manager fits anywhere a Flow can fire too often:

- **Motion and presence** — one notification per interval, not per sensor ping
- **Doorbell and intercom** — one alert per visit when someone rings repeatedly
- **Messages and push notifications** — stop the same Flow from messaging you over and over
- **Leaks, pressure, and environmental warnings** — e.g. high water pressure at most once per day while the condition continues
- **Doors, windows, and garage left open** — one reminder, not every few minutes
- **Camera and doorbell motion** — one clip or alert per burst of activity
- **Heating, cooling, and fans** — avoid short cycling when a sensor flaps near the threshold

---

## Flow cards

All cards share a **key** (for example `door_alert`). An Allow condition defines the cooldown duration for that key — or, with **Allow up to**, how many runs are allowed per interval.

### And — Allow … once every …

Checks whether the cooldown is active. If allowed, it atomically starts the cooldown and returns true so the Flow continues; otherwise it returns false, increments the block count, and may fire matching **When** cards.

### And — Allow … up to … times every …

Checks whether the key still has capacity in the current interval. If allowed, it counts one use and returns true; otherwise it returns false, increments the block count, and may fire matching **When** cards. Use this when you want several runs per window — for example three doorbell notifications every ten minutes instead of one.

### When — block count triggers

- **… blocked N times in a row** — runs when the block count reaches exactly N.
- **… blocked N or more times in a row** — runs when the block count is at least N.

Both pass the current block count as a Flow tag. They only run for keys that also have a matching Allow condition in another Flow.

### Then — cooldown and interval actions

- **Reset cooldown for …** — clears the cooldown so the key can trigger again immediately.
- **Suspend cooldown for …** — marks the cooldown as active until the duration from the Allow condition elapses. Also blocks Allow up to keys until reset.
- **Restore one time for …** — makes one more run available for this key in the current interval.
- **Restore … times for …** — makes that many more runs available in the current interval.
- **Reset times used for …** — clears how many times the key has been used so the full max times is available again in the current interval.

Card titles in Flow use your chosen key, duration, and unit — for example **Allow doorbell once every 2 minutes**, **Allow doorbell up to 3 times every 10 minutes**, or **doorbell blocked 5 times in a row**.

---

## Examples

### Motion notification throttle

```text
WHEN  Motion detected in the hall
AND   Allow hall_motion once every 10 minutes
THEN  Send a notification
```

One alert per window, not one per motion event.

### High water pressure — alert once per day

```text
WHEN  Water pressure is high
AND   Allow water_pressure_alert once every 1 day
THEN  Send a notification
```

The sensor may stay above the threshold all day; you still get one message, not one every time the Flow runs.

### Message throttle

```text
WHEN  Leak sensor wet
AND   Allow leak_message once every 30 minutes
THEN  Send a message to Jamie
```

If the sensor keeps retriggering, Jamie gets one message per half hour, not a stream of duplicates. The same pattern works for push notifications, SMS, or any Then card that contacts someone.

### Several doorbell alerts per visit

```text
WHEN  Doorbell pressed
AND   Allow doorbell up to 3 times every 10 minutes
THEN  Send a notification
```

Up to three notifications per ten-minute window. Further presses are blocked until the interval resets or you restore capacity with a Then card.

### Escalation when someone rings repeatedly

Someone presses the doorbell several times in quick succession. The first press sends a notification; each extra press while the cooldown is active is blocked.

**Flow 1**

```text
WHEN  Doorbell pressed
AND   Allow doorbell once every 2 minutes
THEN  Send a notification
```

**Flow 2**

```text
WHEN  doorbell blocked 5 times in a row
THEN  Send an urgent alert
```

After five blocked presses in a row, Flow 2 sends an urgent alert. The When card passes the current **block count** as a Flow tag.

For a threshold instead of an exact count, use **doorbell blocked 5 or more times in a row**.

### Manual override after you respond

```text
WHEN  I dismiss the alert
THEN  Reset cooldown for doorbell
```

Clears the cooldown immediately so the next doorbell press can get through. Use **Suspend cooldown for …** when you want to block further runs until the Allow duration elapses. For Allow up to keys, use **Restore one time for …** or **Reset times used for …** to give capacity back without clearing the interval timer.

---

## Installation

1. Install **Cooldown Manager** from the [Homey App Store](https://homey.app) (or run from source; see [Building](#building)).
2. In a Flow, add an **Allow … once every …** or **Allow … up to … times every …** condition for each cooldown key you need. Add **When** or **Then** cards from Cooldown Manager when you want block-count triggers or manual cooldown and interval control.
3. Open the app **Settings** page to see active keys, block counts, times used this interval, last-run times, and any Flow configuration issues (for example a When or Then card using a key with no matching Allow card).

---

## Contributing

Issues and pull requests are welcome on GitHub: [github.com/jamisonbennett/homey-cooldown-manager](https://github.com/jamisonbennett/homey-cooldown-manager).

---

## Building

Use **Node.js 22+**. Run `npm install`, then use the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli) via `npx homey`.

```bash
npm install
npm run build            # build and lint
npx homey app run        # run on your Homey (development)
npx homey app validate   # check app.json and structure before publish
npx homey app install    # install this folder on your Homey
```

Log in once when needed: `npx homey login`.

This app is written in TypeScript. Run lint with `npm run lint` and use `npm run build` for a compile (output under `.homeybuild/`); `build` runs lint first. Unit tests: `npm test`.

### Homey Compose

Flow card metadata is merged from **Homey Compose** sources under [`.homeycompose/`](./.homeycompose/). The root [`app.json`](./app.json) is **regenerated** when you use the CLI (for example `homey app run` or `homey app build`); edit the compose files, not `app.json`, by hand.

### Translate

#### Setup

Set your OpenAI credentials:

```bash
export OPENAI_ORG_ID="YOUR_ORG_ID"
export OPENAI_API_KEY="YOUR_API_KEY"
```

> Never commit real API keys to git.

#### Regenerate Locale Files

If `locales/en.json` changes, delete all non-English locale files.

Homey only generates translations for locale files that do not already exist.

```bash
find locales -type f ! -name 'en.json' -delete
```

#### Regenerate README Translations

If `README.txt` changes, delete the translated README files so they can be regenerated.

```bash
rm -f README.*.txt
```

#### Retranslate Existing Strings

If existing English strings were modified, remove the corresponding translated values from the JSON files before running the translator.

Homey only generates translations for JSON elements that do not already exist.

#### Run Translation

```bash
npx homey app translate
npx homey app translate --file .homeychangelog.json
```

---

## License

This project is licensed under the MIT License; see [LICENSE](./LICENSE).
