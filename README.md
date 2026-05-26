# Cooldown Manager for Homey

This **`README.md`** is the project documentation for **GitHub**. The long description for the **Homey App Store** is maintained separately in [`README.txt`](./README.txt); keep user-facing facts in sync when you change either file.


Prevent automations from firing too often with reusable cooldowns for Homey Flows.

Cooldown Manager is a lightweight Homey utility app designed to stabilize noisy automations by adding simple execution throttling to Flows.

Instead of manually combining:
- timers
- logic variables
- delayed resets
- multiple Flows

you can simply use:

```text
AND allow "door_alert" once every 5 minutes
```

The app focuses on one simple idea:

> Allow this action once every X.

---

## Installation

1. Install **Cooldown Manager** from the [Homey App Store](https://homey.app) (or run from source; see [Building](#building)).
2. In the Homey mobile app, add a device and choose **Cooldown Manager**

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

Metadata and drivers are merged from **Homey Compose** sources under [`.homeycompose/`](./.homeycompose/) and [`drivers/cooldown-manager/driver.*.compose.json`](./drivers/cooldown-manager/). The root [`app.json`](./app.json) is **regenerated** when you use the CLI (for example `homey app run` or `homey app build`); edit the compose files, not `app.json`, by hand.

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

