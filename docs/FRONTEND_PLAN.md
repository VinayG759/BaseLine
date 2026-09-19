> Source: https://claude.ai/artifact/8x49BAqU2iAvAugw8SJBSf (plan version 2). Converted to Markdown on 2026-09-19.

# Baseline Frontend

*Baseline · Track B of 2 · AWS Tour Hackathon*

Everything a person sees and touches: the page, the upload, the trend cards, the charts, the test reports and the public URL. You build against a pretend API from the first minute, so you never wait on the backend. You join up with your teammate at two fixed points.

Owner: **Chethan** · folders **web/** and **samples/** · the other track: **backend/**

| When | What |
|---|---|
| **SAT 18:45** | Merge 1. Your page against the real backend, on Vinay’s laptop. |
| **SUN 12:00** | Merge 2. Live page + live backend, on AWS. |
| **SUN 14:00** | Deploy cutoff. Not live → ship local. |
| **SUN 20:00** | Submissions close. The form shuts. |

## What you’re building, and why it matters

_Baseline turns photos of printed lab reports into a history, and notices when a value keeps moving. ChatGPT can explain one report, but it can’t tell you that HbA1c has risen three reports in a row, because it never saw the old ones._

The backend does the reading and the maths. **Your job is the moment a judge understands it in two seconds**: a number, its history drawn as a line climbing out of the normal band, and one plain sentence. The judges only see a 3-minute video, and your page is most of it. Best UI is also a ₹1,00,000 prize of its own.

- **Teammate · Track A — `backend/`**: Bedrock extraction, trend maths, DynamoDB, S3, the API and its Lambda deploy.
- **You · Track B — `web/ · samples/`**: The page, the upload flow, trend cards, charts, test report images, Amplify hosting.

#### Three rules make parallel work safe

- [ ] **Never edit `backend/`.** You own `web/` and `samples/`; Vinay owns `backend/`.
  Two people never edit the same file, so git merge conflicts can’t happen.
- [ ] **Build to the contract below, exactly.**
  Your fake data has the same shape the real API will send. If you match the contract, switching to the real backend just works.
- [ ] **Need a new field? Ask first.**
  Don’t invent fields in your fake data that the backend doesn’t know about. Agree the change with Vinay and update `CONTRACT.md` together.

> [!NOTE]
> **“Merging” is one setting, not a git operation.** You both push to `main` all day, each in your own folder. A merge point is when `web/config.js` switches from the fake API to the real address.

## The contract — identical in both plans

_Two endpoints, one response shape. This goes into the repo as `CONTRACT.md` at 09:45. **Version 2** adds the `lang` setting._

**endpoints**

```
GET  {API}/api/trends?person_id=amma&lang=kn
     → the person's history, nothing uploaded

POST {API}/api/reports
     multipart/form-data:
       person_id    text, required, matches ^[a-z0-9-]{1,32}$
       file         image/jpeg or image/png, required, at most 4 MB
       report_date  YYYY-MM-DD, optional (overrides the date read off the report)
       lang         en | kn | hi, optional
     → reads the report, saves it, returns the person's full history

lang   language of the "summary" sentence only. en = English, kn = Kannada, hi = Hindi.
       Optional on both endpoints; missing means en. Anything else is a 400.
```

**both return 200 with this shape**

```
{
  "person_id": "amma",
  "report": {                          // null on GET
    "report_id": "3f9c2a...",
    "report_date": "2026-09-12",
    "lab_name": "Sri Sai Diagnostics"   // may be null
  },
  "trends": [
    {
      "test_key": "hba1c",
      "test_name": "HbA1c",
      "unit": "%",
      "current": 6.4,
      "previous": 6.1,                 // null if first reading
      "direction": "rising",           // first | rising | falling | stable
      "streak": 2,                     // moves in a row the same way; 0 if first or stable
      "status": "high",                // normal | high | low | unknown
      "ref_low": 4.0,                  // may be null
      "ref_high": 5.6,                 // may be null
      "history": [
        {"date": "2026-03-04", "value": 5.6},
        {"date": "2026-08-08", "value": 6.1},
        {"date": "2026-09-12", "value": 6.4}
      ],                               // oldest first
      "summary": "Gone up 2 times in a row (5.6 → 6.1 → 6.4 %). Above the normal range (4–5.6 %).",
      "updated": true                  // true if this upload touched it; always false on GET
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `order` | Out-of-range results first (high or low), then the longest streak, then alphabetical by name. |
| `errors` | Any non-200 carries `{"error": "a sentence a person can act on"}`. The page shows that sentence as-is, so write it for a human. |
| `language` | Only `summary` is translated. Test names, units, numbers and dates are always returned exactly as printed on the report, whatever the language. If translation fails, `summary` comes back in English; the page doesn’t need to handle that specially. |
| `people` | Fixed list on the page: `amma`, `appa`, `me`. No accounts, no login. |

## Phase 0 — Clear the runway

**When:** TONIGHT · before sleep

_Setup and test data. None of it is code, so all of it is allowed before the clock starts._

### Accounts

- [ ] **Verify your student status on AWS Builder Center.**
  Every entry is checked against it.
- [ ] Once your account’s verification clears, **re-run the Nova Pro playground test**. If yours answers before Vinay’s, yours becomes the project account.
- [ ] **If Bedrock still says “Operation not allowed” on the Free plan** and yours is the project account: upgrade to the paid plan, as you’ve both agreed.
  The credits still apply. Straight after, create a **$5 monthly budget with an email alert** under Billing → Budgets.
- [ ] **If the project account is yours,** create an IAM user for Vinay (a separate login inside your account, so you never share your password).
  IAM → Users → Create user → console access → attach AdministratorAccess. Then that user → Security credentials → Create access key. Send him the login link and keys **privately**, never in a group chat. Delete the user on Monday.
- [ ] Send Vinay your **GitHub username**. Install **Git**, **VS Code** and **Python 3** (only needed to run a small local web server).

### Make the three test reports: you own the demo data

The whole demo rests on these. One person, **Amma**, with three reports across six months. The first two are loaded in advance; the third is photographed live on camera. The numbers are chosen so three results rise twice in a row.

| Test name | 04-Mar-2026 | 08-Aug-2026 | 12-Sep-2026 | Unit | Ref. range |
|---|---|---|---|---|---|
| HbA1c | 5.6 | 6.1 H | 6.4 H | % | 4.0 – 5.6 |
| Fasting Blood Glucose | 98 | 109 H | 118 H | mg/dL | 70 – 100 |
| Total Cholesterol | 224 H | 215 H | 212 H | mg/dL | < 200 |
| Haemoglobin | 13.9 | 13.6 | 13.8 | g/dL | 13.0 – 17.0 |
| Serum Creatinine | 1.0 | 1.1 | 1.1 | mg/dL | 0.7 – 1.3 |

- [ ] **Best method: design one lab-report page in Google Docs or Word, print three copies with these values, and photograph each with your phone.**
  Header “Sri Sai Diagnostics, Bengaluru”, patient “Amma (sample)”, the report date, then the table. Real paper and a real photo are what the demo shows, and every number is guaranteed right.
- [ ] Name the files exactly `amma-2026-03-04.jpg`, `amma-2026-08-08.jpg` and `amma-2026-09-12.jpg`.
  Vinay’s seeding steps use these exact names.
- [ ] **Keep the printed September report.** You’ll photograph it live in the demo video.

> [!WARNING]
> **AI image generators garble numbers**, so 6.4 can come out as 6.A or lose a digit. If you use one, check every value against the table first. Printing and photographing avoids the problem entirely.

> [!NOTE]
> **Made-up data only.** Never use a real family member’s report: it ends up in a public repo and on YouTube.

## Phase 1 — Clone, push the samples, learn

**When:** SAT 09:45 – 15:00

**⏱ ~10:00 · 10 min**

### Get the repo and hand over the test data

- [ ] Accept Vinay’s GitHub invite and **clone** the repo to your laptop.
- [ ] Copy the three images into `samples/`, stage them **by name**, commit (“sample lab reports for Amma”), `git pull --rebase`, then push.
- [ ] Do this **before the workshop**. Vinay needs the samples at 15:00 for his first test.

> [!WARNING]
> **Never `git add -A` or `git add .`** Name each file, and always pull before you push.

**⏱ 11:00 – 14:00 · both of you**

### Strands workshop

- [ ] Build the workshop exercise for real. **Learning** is a scored criterion, and you’ll each say what you learned in the video.
- [ ] Ask a mentor: **“Can a Free plan account use Amplify Hosting, and what’s the fastest way to deploy a static folder?”**

## Phase 2 — Build the page against the fake API

**When:** SAT 15:00 – 18:45

_Goal by 18:45: pick a person, see their history, upload a report, see updated trends, all on fake data. Use plain HTML, CSS and JavaScript with no framework and no build step, so nothing can fail to compile at midnight._

**⏱ 15:00 – 15:40**

### B1 — The page, the config and the fake data

> 📁 Create: **web/index.html** · **web/config.js** · **web/mock.js**

- [ ] **index.html** has, top to bottom: a header with the name “Baseline” and the tagline “Your family’s lab results, remembered.”; an “Add a report” panel with a **person dropdown** (id `person`), a **language dropdown** (id `lang`, options English / ಕನ್ನಡ / हिन्दी with values `en`, `kn`, `hi`, each written in its own script so a reader can find their language), an **image file input** (id `file`, accepting images only), a collapsible “Date not printed clearly?” section holding a **date input** (id `date`), and a **Read report** button (id `send`, disabled to start); a **status line** (id `status`); an empty **results area** (id `trends`); and a footer with the boundary: “Baseline explains and tracks lab results. It does not diagnose or recommend treatment. Talk to a doctor about any result.”
  Give every input a visible label. Mark the status line as a live region (`role="status"`, `aria-live="polite"`) so screen readers announce progress. Load `styles.css` in the head, and `config.js`, `mock.js` and `app.js` in that order at the end of the body.
- [ ] **config.js** sets one global object with two settings: `apiUrl` (start with `http://localhost:8000`) and `useMock` (start with `true`).
  This is the only file that changes at the merge points. Everything else reads from it.
- [ ] **mock.js** holds two fake responses in exactly the contract’s shape. `before` is Amma’s history after March and August: report null, and three trends (Fasting Blood Glucose, HbA1c, Haemoglobin) with two-point histories from the test data table. `after` is what comes back after the September upload: a report object dated 2026-09-12, the same three tests with three-point histories, and `updated` true on each.
  Work out direction, streak and status by hand from the rules in the contract, and write a summary sentence in the style of its example. Order them as the contract says: out-of-range first. Getting this exactly right is what makes Merge 1 painless.
- [ ] Commit the three files.

**⏱ 15:40 – 16:40**

### B2 — The logic: load, draw, upload

> 📁 Create: **web/app.js**

#### Talking to the API

- [ ] A fixed list of people: Amma (`amma`), Appa (`appa`), Me (`me`). Fill the dropdown from it on page load.
- [ ] **`getTrends(personId)`**: in mock mode, wait about 300 ms (so loading states get exercised), then return a copy of `before` for Amma, or an empty trends list for anyone else. Otherwise, fetch GET `/api/trends` with the person ID in the query string.
- [ ] **`uploadReport(personId, file, date)`**: shrink the image first (next step). In mock mode, wait about 4 seconds (roughly the real extraction time) and return a copy of `after`. Otherwise, send a POST to `/api/reports` as form data with `person_id`, `file`, and `report_date` only if the date box was filled.
- [ ] **`shrink(file)`**: draw the photo onto a canvas scaled so its longest side is at most 2000 pixels, and export it as a JPEG at about 0.88 quality.
  Phone photos are 5–12 MB and the contract caps uploads at 4 MB. At 2000 px, printed text stays sharp and the file drops under 1 MB. It also converts iPhone photos to JPEG, which the backend expects.
- [ ] **Send the language on every call:** `lang` in the query string for GET, and as a form field for POST, taken from the language dropdown. Mock mode ignores it and stays English.
  The backend accepts `lang` from Saturday, but it only starts translating on Sunday morning. So at Merge 1, choosing Kannada still gives English sentences. That’s expected, not a bug.
- [ ] **Error handling for both calls:** read the JSON reply. If the status isn’t OK, throw an error using the reply’s `error` sentence, or “Something went wrong. Try again.” if there isn’t one.

#### Drawing the results

- [ ] **`escapeHtml(text)`**: replaces `& < > " '` with their HTML-safe forms. **Every** piece of text from the API goes through it before touching the page.
  Test names and units are whatever the model read off a photo. Unescaped, a crafted image could inject HTML into your page. This is a real security rule, not decoration.
- [ ] **One card per trend**: the test name; an **H** or **L** flag when status is high or low (borrowed from real lab reports, which flag out-of-range values the same way); the current value large, with its unit and an arrow for the direction (↑ ↓ →); the chart; the normal range as text (“Normal 4–5.6 %”, “Normal below 200 mg/dL”, or “No reference range printed”); and the summary sentence. Give the card a class for its status, and another when `updated` is true, so CSS can style both.
- [ ] **The chart** is a small inline SVG, about 280 × 72, drawn by hand (no chart library). Work out the vertical scale from the lowest and highest of all the history values *and* the range limits, so the band always fits. If they’re all equal, widen the scale by 1 either side so you don’t divide by zero. Draw the **normal range as a shaded rectangle** behind everything, then a line through the history points, then a dot on each point, with the newest dot bigger and in the accent colour. Space the points evenly left to right, and centre a single point.
  Give the SVG an accessible label such as “HbA1c: 3 results, latest 6.4”. The shaded band is the whole idea: the reader sees the line climbing out of it without reading a word.
- [ ] **Empty state**: if a person has no trends, show “No reports yet. Add this person’s most recent lab report to start their history.”

#### Wiring it together

- [ ] **On load, and whenever the person or the language changes:** show “Loading history…”, fetch the trends, draw them, clear the status. On failure, show the error in the status line, styled as an error.
- [ ] Enable the **Read report** button only while a file is chosen.
- [ ] **On Read report:** disable the button, show “Reading the report…”, and after 3 seconds switch to “Comparing with N earlier reports…”, where N is how many distinct dates are in the history currently on screen. When the reply arrives, draw it, show “Added 3 results from the 2026-09-12 report.”, and clear the file input. On failure, show the error. Either way, cancel the timer and re-enable the button.
  The switch at 3 seconds runs on a timer; it isn’t live progress from the server. That’s fine, because the server really does both steps, but don’t call it live progress tracking in the video.
- [ ] From `web/`, run `python -m http.server 5500` and open `http://localhost:5500`. Amma shows three cards with two-point lines; Appa shows the empty state; uploading any image shows both status messages, then three updated cards with three-point lines. Commit.

**⏱ 16:40 – 17:40**

### B3 — The first look

Aim for clean and clinical, borrowing from the lab report itself: that’s the vernacular your user already reads. This is your base for the Best UI pass on Sunday, so get it solid rather than fancy.

> 📁 Create: **web/styles.css**

- [ ] **Colours as CSS variables** at the top: background, card, text, muted text, lines, one accent (a deep teal works well for health without being cold), the band tint, and a red plus a pale red for out-of-range. Redefine them inside a dark-mode media query, so dark mode is just new values, not new rules.
- [ ] **Two typefaces:** a clean sans-serif for text, and a monospaced face for numbers, units, ranges and the status line. Lab reports print results in fixed-width columns, and monospaced digits line up the same way. IBM Plex Sans and Plex Mono from Google Fonts pair well.
  **Plex has no Kannada or Hindi letters.** Load **Noto Sans Kannada** and **Noto Sans Devanagari** from Google Fonts too, and list them in the text font stack right after Plex Sans. The browser then uses Plex for English and switches to Noto for any Kannada or Hindi characters automatically. Without them, Kannada can show up as empty boxes on some phones.
- [ ] **Layout:** one column, at most about 720 px wide, with at least 16 px of side padding. Cards stack on phones and go two across on wider screens. Every tap target is comfortably finger-sized.
- [ ] **Out-of-range cards** show the big number in red and the H/L flag as a small boxed badge in red on pale red. Updated cards get an accent-coloured edge.
- [ ] **The chart** gets a faint accent-tinted band, a dark line, small dots, and a larger accent-coloured newest dot. It scales to the card’s width.
- [ ] A visible **keyboard focus** outline on everything clickable, and error text in the red.
- [ ] Check it at phone width: DevTools (`F12`) → device toolbar (`Ctrl+Shift+M`) → a 390 px phone. Commit.

**⏱ 17:40 – 18:40**

### B4 — Test the unhappy paths

A demo only shows the happy path, but mentors at the showcase will click everything. Force each failure in mock mode and check the page says something a person can act on.

- [ ] **Error message:** temporarily make the mock upload throw “Couldn’t read a date on this report. Enter the report date and upload again.”, check it shows in red, then remove it.
- [ ] **Double click:** the button stays disabled while an upload is running.
- [ ] **Big photo:** pick a full-size phone photo and log the shrunk image’s size in the console. It should be well under 4 MB.
- [ ] **Switching people** mid-session loads the right history.
- [ ] Commit, pull, push, and tell Vinay it’s ready for Merge 1.

**⏱ 18:45 – 19:00 · MERGE 1 · together, on Vinay’s laptop**

### First join-up: your page against the real backend

- [ ] Vinay pulls your work, switches `useMock` off in `config.js` **without committing**, and serves `web/` on port 5500.
- [ ] Upload the September report: real extraction, real trends, your cards.

> [!NOTE]
> If a card draws wrong, compare the real JSON with `CONTRACT.md` before anyone edits code. Whichever side differs from the contract is the side that changes.

## Phase 3 — Showcase, then put the page online

**When:** SAT 19:00 – night

**⏱ 19:00 – 20:00 · both of you**

### Showcase: collect honest reactions

- [ ] Hand the laptop to someone and **say nothing**. Watch where they hesitate: that’s your Sunday-morning list.
- [ ] Ask: **“What did the page tell you in the first two seconds?”** If the answer isn’t “this number keeps going up”, the design isn’t doing its job yet.

**⏱ Sat night · ~45 min, then sleep**

### B5 — Put the fake-data version on Amplify

Deploy tonight, while the page still runs on fake data. Any hosting problem shows up now, when nothing depends on it, instead of at noon on Sunday.

- [ ] Zip the **contents** of `web/` into `web-build.zip`, so `index.html` sits at the top level of the zip, not inside a folder.
  Python’s `shutil.make_archive`, given the `web` folder as its root, does exactly this.
- [ ] Amplify console → Create new app → **Deploy without Git** → drag in the zip.
- [ ] Open the `amplifyapp.com` address on your phone and check that the fake demo works. Send Vinay the URL. **Sleep.**

> [!WARNING]
> **If Amplify is blocked on a Free plan account,** host it on S3 instead: a bucket with Static website hosting on, Block Public Access off, a public-read bucket policy, and the contents of `web/` uploaded. Slower to set up, same result. Ask a mentor if it fights you.

## Phase 4 — The Best UI pass, then go live

**When:** SUN 09:00 – 14:00

**⏱ 09:00 – 12:00**

### B6 — Make one thing unmistakable

Best UI goes to “a pleasure to use, not only a pleasure to describe.” With an app this small, what wins is precision, not features. In priority order:

- [ ] **The out-of-range card is the page.** On Amma’s screen the eye should land first on a red number whose line climbs out of the shaded band. Everything else steps back.
- [ ] **The chart tells the story alone.** Add small date labels under the first and last points, and make sure the band is readable in both light and dark mode.
- [ ] **Uploading feels good on a phone:** big tap targets, the camera one tap away, and an unmistakable working state. The demo is filmed on a phone.
- [ ] **Changed cards announce themselves** with a brief, subtle highlight on the ones this upload updated (that’s what `updated` in the contract is for). If you animate it, switch the animation off for people who’ve asked their device for reduced motion.
- [ ] **Kannada and Hindi look as deliberate as English.** Before the real translation arrives, paste a real Kannada sentence and a Hindi one into a mock summary to test the layout: these scripts need more line height, and sentences run longer. Check at phone width that nothing overflows.
  Also remember the chosen language on the device (localStorage, wrapped in try/catch) so a parent who picks Kannada once doesn’t have to pick it again.
- [ ] **The boundary line stays visible.** “Explains and tracks, doesn’t diagnose” is part of the product, not small print.
- [ ] Commit as you go: explicit paths, pull before push.

> [!NOTE]
> **Not on the list, on purpose:** login, extra pages, settings, a report viewer, animations for their own sake, a landing page. Each costs an hour, and none shows up in a 3-minute demo.

**⏱ 12:00 · MERGE 2 · together**

### Live page against live backend

- [ ] In `config.js`, set `apiUrl` to Vinay’s Function URL (the `https://` one, **with no slash at the end**) and `useMock` to false. This time, **commit it**.
  A trailing slash plus `/api` gives `//api`, which returns a 404 that looks like a backend bug.
- [ ] Rebuild the zip and drag it onto the same Amplify app to redeploy.
- [ ] On a phone, on mobile data: Amma’s history loads, and uploading the September report works end to end.
- [ ] Switch the language to **ಕನ್ನಡ**, then to **हिन्दी**. The summaries change language; the numbers, test names and units don’t.

> [!IMPORTANT]
> **14:00 is a hard gate.** If it isn’t working live by then, stop and record the demo from the Merge 1 setup on Vinay’s laptop. It still competes for Build It and Best UI.

## Phase 5 — Polish, freeze, film

**When:** SUN 14:00 – 17:00

- [ ] One last polish pass from the showcase notes, then **freeze the UI at 15:30**. No changes after that, or the footage won’t match the product.
- [ ] **Film the demo on a phone** with screen recording on: open the live URL, pick Amma, photograph the **printed** September report with the camera, and watch the trends update.
  A real paper report, a real camera and a real result in one unbroken take is the most convincing minute you can give a judge.
- [ ] Before filming, check the September report **hasn’t already been uploaded** to the live backend. If it has, ask Vinay to reset and reseed Amma.
- [ ] Take clean screenshots of the page for the README and your blog.

## Phase 6 — What actually gets judged

**When:** SUN 17:00 – 20:00 · together

_No live demo and no call. The judges see the video, the repo and the writeup, and nothing else. A feature that isn’t on film counts for nothing, so protect these three hours from any urge to keep building._

**⏱ 17:00 – 18:15 · Chethan edits**

### The video: under three minutes

| Time | Shot |
|---|---|
| 0:00–0:20 | **The problem**, with a printed report in hand. Nobody explained it to you, and the old ones are in a drawer. Say it plainly. _(either)_ |
| 0:20–0:35 | **Why a chatbot doesn’t solve it.** One report, one answer, nothing remembered. The insight is in the change between reports. _(either)_ |
| 0:35–1:35 | **The demo**, recorded on a phone against the live URL: pick Amma, photograph the printed September report, and watch it land on her history. *Gone up twice in a row, now above range.* One take, real waiting time. Then switch the language to **ಕನ್ನಡ** and let the same sentence appear in Kannada, so the parent can read it too. _(Chethan)_ |
| 1:35–2:20 | **Architecture**: the three stages, why the arithmetic is deliberately not the model’s job, the passing tests, then Lambda, DynamoDB, S3 and Bedrock in the console. _(Vinay)_ |
| 2:20–2:45 | **What you each learned**: first agent, first Lambda, first Bedrock call, first Amplify deploy. Learning is a scored criterion, so answer it directly. _(both)_ |
| 2:45–3:00 | **The live URL on screen**, and the line: it explains and tracks, it doesn’t diagnose. _(either)_ |

- [ ] Under 3:00, uploaded to YouTube as public or unlisted.
- [ ] **Open the link in a signed-out incognito window.** A private video means an unscored submission.

**⏱ 18:15 – 19:15**

### Writeup and blogs

- [ ] Writeup: the problem, the build, where AWS fits, what each of you learned, **the AI coding tools you used**, and both names.
- [ ] README has the architecture diagram and a screenshot of the page.
- [ ] **Each of you publishes your own post on AWS Builder Center.** Vinay writes about the backend: the Decimal trap, building Linux packages on Windows, why code decides and not the model. Chethan writes about the frontend: designing around a lab report’s own conventions, shrinking phone photos in the browser, Amplify.
  The keyboard prize goes to five *people*, not five teams, so two posts are two chances. Write about what fought back; that’s what people read.

**⏱ 19:15 – 19:30**

### Submit, with forty minutes to spare

- [ ] Repo is **public**, checked from an incognito window.
- [ ] Video, live URL and both blog links open signed-out.
- [ ] Registered names and emails are correct. Prizes go to those details.
- [ ] Submitted **once**, by whoever registered as team leader.

> [!WARNING]
> **Don’t submit at 19:59.** The form closes at 20:00 and nothing gets in after.

## What will go wrong on your side

| Symptom | Cause | Fix | Costs |
|---|---|---|---|
| Console says `blocked by CORS policy` | Backend configuration, not your code | Send Vinay the exact console error. Don’t work around it on your side. | 1h |
| Console says `Mixed Content` | An HTTPS page calling an `http://` API | The live `apiUrl` must be the `https://` Function URL | 15m |
| 404 on every call after Merge 2 | Slash at the end of `apiUrl` | Remove it | 20m |
| Old version still showing after a redeploy | Browser cache | `Ctrl+Shift+R`, or test in an incognito window | 20m |
| Blank page, nothing in the Network tab | A JavaScript error before anything loaded | Open the Console. Usually a typo in `config.js` or `mock.js`. | 10m |
| Amplify shows “404 Not Found” | `index.html` is inside a folder in the zip | Zip the *contents* of `web/`, not the folder itself | 15m |
| Kannada or Hindi text shows as empty boxes | No font on the phone has those letters | Load Noto Sans Kannada and Noto Sans Devanagari (step B3) | 15m |
| Chart line missing or flat | One data point, or all values equal | The single-point and equal-values cases in the chart step | 10m |

---

Baseline · Track B: frontend · the number, its history, one plain sentence
