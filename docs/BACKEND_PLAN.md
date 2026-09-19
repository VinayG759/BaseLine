> Source: https://claude.ai/artifact/WoXoi1xr9J71YRp7NmfbiV (plan version 2). Converted to Markdown on 2026-09-19.

# Baseline Backend

*Baseline · Track A of 2 · AWS Tour Hackathon*

Everything behind one API: read the report, store the history, work out the trends, and put it live on AWS. Your teammate builds the page at the same time, against a pretend copy of your API. You join up at two fixed points.

Owner: **Vinay** · folder **backend/** · the other track: **web/**

| When | What |
|---|---|
| **SAT 18:45** | Merge 1. Real page + real backend, on your laptop. |
| **SUN 12:00** | Merge 2. Live page + live backend, on AWS. |
| **SUN 14:00** | Deploy cutoff. Not live → ship local. |
| **SUN 20:00** | Submissions close. The form shuts. |

## How the split works

- **You · Track A — `backend/`**: Bedrock extraction, trend engine, DynamoDB, S3, the API, the Lambda deploy. All three stages of the architecture.
- **Teammate · Track B — `web/ · samples/`**: The page, the upload flow, the trend cards and charts, the test report images, Amplify hosting. Everything a judge sees.

#### Three rules make parallel work safe

- [ ] **Never edit the other person’s folder.**
  You only touch `backend/`; they only touch `web/` and `samples/`. Two people never edit the same file, so git merge conflicts can’t happen.
- [ ] **The contract below is the only thing you share.**
  It says exactly what the API sends back. They build against a fake copy of it; you build the real thing. If both sides match it, the halves fit on the first try.
- [ ] **Changing the contract means telling them first.**
  Quietly renaming one field is how Merge 1 breaks. Agree the change, then update `CONTRACT.md` together.

> [!NOTE]
> **“Merging” here is not a git operation.** You both push to `main` all day, each in your own folder. A merge point is when the page *switches from the fake API to the real one*: one setting in their config file. It tests that the halves fit; it doesn’t merge code.

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

_Setup, not building. All of it is allowed before the clock starts._

### Pick one AWS account, then get yourself into it

Both of your accounts are still being verified. The project needs **one**: whichever answers the Nova Pro playground test first. The other goes unused.

- [ ] **Verify your student status on AWS Builder Center.** Your teammate does the same.
  Every entry is checked against it.
- [ ] **Re-run the Nova Pro playground test** on both accounts once verification clears. The first one that answers is the project account.
- [ ] **If Bedrock still says “Operation not allowed” on the Free plan:** upgrade the project account to the paid plan, as you’ve both agreed.
  The credits still apply. Right after upgrading, go to Billing → Budgets and create a **$5 monthly budget with an email alert**, so you’ll know if anything ever starts costing real money.
- [ ] Write down **the region** where it worked and the **exact inference profile ID** for Nova Pro.
  Bedrock console → Inference profiles. It looks like `eu.amazon.nova-pro-v1:0`. Copy it, don’t retype it. Every resource you create goes in this one region.
- [ ] **Whoever owns the project account creates an IAM user for the other person.** IAM is AWS’s own user system: a separate login inside the same account, so nobody shares a password.
  IAM → Users → Create user → tick console access → attach the AdministratorAccess policy. Then open that user → Security credentials → Create access key, for the command-line tools. Broad permissions, but fine for a throwaway weekend account. Delete the user on Monday.
- [ ] Install **Python 3.12**, the **AWS CLI** and **Git**. Run `aws configure` and give it your access key, secret key and the chosen region.
  Then run `aws sts get-caller-identity`. If it prints the account number, you’re connected.
- [ ] Get your teammate’s **GitHub username** so you can invite them tomorrow morning.
- [ ] **No code and no repo tonight.**
  The repo’s history has to match the event dates.

> [!WARNING]
> **Access keys never go in the repo, in chat, or in a screenshot.** They’re a password that can spend money. `aws configure` stores them on your machine outside the project folder, which is where they belong.

## Phase 1 — Create the repo, then learn

**When:** SAT 09:45 – 15:00

**⏱ 09:45 · 15 min · you do this, they wait for the invite**

### Repo, folders and contract: the shared ground

- [ ] Create a folder `baseline` and run `git init` in it. Inside, make the folders `backend/core`, `backend/tests`, `backend/scripts`, `web` and `samples`.
- [ ] Create **README.md** with one line: the project name and “A health record that notices.”
- [ ] Create **.gitignore** listing: `__pycache__/`, `.venv/`, `.env`, `*.pyc`, `.pytest_cache/`, `package/`, `build.zip`, `web-build.zip`.
  These are generated files and local settings. None belong in the repo.
- [ ] Create **CONTRACT.md** and paste the contract section from this page into it, word for word.
- [ ] Stage those three files **by name**, commit (“repo skeleton and API contract”), create a **public** repo on GitHub, and push.
- [ ] GitHub → Settings → Collaborators → invite your teammate, and tell them it’s ready.

> [!WARNING]
> **Never `git add -A` or `git add .`** Stage explicit paths every time, and always `git pull --rebase` before `git push`. You both push to `main`, just in different folders.

**⏱ 11:00 – 14:00 · both of you**

### Strands workshop

- [ ] Build the workshop exercise for real. **Learning** is a scored criterion, and “my first agent” is a genuine answer to it.
- [ ] Ask a mentor: **“Does a Lambda’s role need special permission to call a cross-region inference profile?”**
  Tomorrow’s most likely permissions error, answered for free.

## Phase 2 — Build the backend

**When:** SAT 15:00 – 18:45

_Goal by 18:45: a real report image goes in, contract-shaped JSON comes out, running on your laptop._

**⏱ 15:00 – 15:20**

### A1 — Environment and a Bedrock smoke test

A smoke test is the smallest possible check that something works at all. This one proves your account, region and model ID can read an image before you build anything on top of them.

> 📁 Create: **backend/pytest.ini** · **backend/core/__init__.py** · **backend/scripts/smoke_bedrock.py**

- [ ] In `backend/`, create a Python **virtual environment** (a private package folder for this project) named `.venv`, activate it, and install: `fastapi`, `uvicorn`, `python-multipart`, `mangum`, `boto3`, `pytest`.
  If PowerShell says “running scripts is disabled” when you activate it, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again.
- [ ] Set four environment variables in your terminal: `AWS_REGION` (the chosen region), `MODEL_ID` (the inference profile ID), `BUCKET` (a globally unique name like `baseline-reports-vinay-0919`), `TABLE` (`baseline-readings`).
  In PowerShell they only last for that terminal window. Keep the four lines in a note so you can paste them into every new terminal.
- [ ] Create **pytest.ini** with a `[pytest]` section that sets `pythonpath` to the current folder, and create an empty **core/__init__.py**.
  Without the pythonpath setting, your tests can’t import anything from `core/`.
- [ ] Write **scripts/smoke_bedrock.py**. It takes an image path from the command line, creates a `bedrock-runtime` client for `AWS_REGION`, and calls `converse` with the model from `MODEL_ID`. Send one user message holding two parts: the image bytes (format `jpeg`), then the text “List every test name and numeric value you can read.” Set temperature to 0, then print the text of the reply.
  The reply text lives at output → message → content → first item → text.
- [ ] Run it on `samples/amma-2026-09-12.jpg` (or any report photo if the samples aren’t pushed yet). Real test names should come back. Then commit.

> [!WARNING]
> **If Bedrock is still blocked, don’t wait.** Go straight to A2: it needs no AWS at all and it’s the most valuable hour of the day. Come back to this when access lands.

**⏱ 15:20 – 16:15**

### A2 — Trend engine, tests first (stage 2: code decides)

This is what makes the project more than a ChatGPT wrapper. It’s also where a bug means a wrong medical trend, so the tests get written **before** the code.

> 📁 Create: **backend/tests/test_trends.py** · **backend/core/trends.py**

#### The two data shapes

| Field | Meaning |
|---|---|
| `Reading` | One result from one report. A frozen dataclass with `test_key` (normalised name, e.g. hba1c), `test_name` (as printed), `value`, `unit`, `ref_low`, `ref_high` (either can be None) and `taken_on` (date as YYYY-MM-DD text). |
| `Trend` | The verdict for one test. Has exactly the fields in the contract’s trend object, **except** `summary` and `updated`, which the API adds later. Keeping the names identical to the contract means one conversion step instead of a mapping. |

#### The rules `compute_trend(readings)` must follow

It takes every reading for **one** test, in any order, and returns a Trend:

- [ ] **Sort by date first.** Never trust the order it was given. `current` is the newest value; `previous` is the one before it, or None if there’s only one reading.
- [ ] **direction:** `first` if there’s no previous value, otherwise `rising`, `falling` or `stable` by comparing current with previous.
- [ ] **streak:** starting from the newest pair and walking backwards, count how many consecutive moves went the same way as the latest move. Stop at the first move that differs. It’s 0 when the direction is `first` or `stable`.
  5.6 → 6.1 → 6.4 has two moves up, so the streak is 2. It counts *moves*, not readings.
- [ ] **status** uses the newest reading: `unknown` if both limits are missing, `low` if below `ref_low`, `high` if above `ref_high`, otherwise `normal`. A one-sided range (only a high limit, like cholesterol < 200) only checks the side it has.
- [ ] **history** is a list of `{"date", "value"}` pairs, oldest first. `ref_low` and `ref_high` come from the newest reading.
- [ ] Also write **`group_by_test(readings)`**, which splits a mixed pile of readings into one list per `test_key`, and **`sort_trends(trends)`**, which orders them the way the contract says: high or low first, then the longest streak, then alphabetical.

#### Write these eight tests first, and watch them fail

- [ ] A single reading → direction `first`, previous None, streak 0.
- [ ] 5.6, 6.1, 6.4 on three dates → `rising`, streak 2, previous 6.1.
- [ ] The same three readings given out of order → history still comes back oldest first.
- [ ] 5.6, 6.1, then 5.9 → `falling`, streak 1. The fall breaks the run of rises.
- [ ] 1.1 then 1.1 → `stable`, streak 0.
- [ ] Range 4.0–5.6: 6.4 is high, 3.1 is low, 5.1 is normal, and no range at all is unknown.
- [ ] Only a high limit of 200: 212 is high.
- [ ] Sorting puts a high result ahead of a normal one, even when the normal one comes first alphabetically.

- [ ] Run `pytest -v` **before writing trends.py**: every test should fail with an import error. That proves the tests are really testing your code. Then write trends.py until all eight pass, and commit both files.

> [!TIP]
> **Once these pass, you have the hard part.** Everything after is plumbing. If the rest of the day goes badly, this is what makes the project defensible, and eight seconds of passing tests belongs in the video.

**⏱ 16:15 – 17:10**

### A3 — Extraction (stage 1: model reads)

Split it into two functions on purpose. `extract()` talks to Bedrock. `parse()` turns the model’s text into readings and needs no network, so you can test it with fake model output.

> 📁 Create: **backend/tests/test_extract.py** · **backend/core/extract.py**

- [ ] **`normalise(name)`**: lowercase the name and remove every character that isn’t a letter or a digit.
  Two labs print “HbA1c” and “HBA1C”. Without this they become two separate one-point histories and there’s no trend: the product silently fails on exactly the case it exists for.
- [ ] **The prompt** tells the model it’s reading a printed lab report and must return **only JSON** with `report_date`, `lab_name` and a `readings` list (test_name, value, unit, ref_low, ref_high). Include these rules: copy values exactly as printed and never estimate; “4.0 - 5.6” means low 4.0 and high 5.6; “< 200” means no low and high 200; skip rows whose result isn’t a number; the date must be YYYY-MM-DD, or null if unreadable.
- [ ] **`strip_fence(text)`**: models often wrap JSON in a markdown fence (three backticks and the word json). If the text starts with one, remove the first line and the closing fence.
- [ ] **`parse(text)`**: strip the fence and load the JSON. If that fails, raise your own `ExtractionError` with a sentence a person can act on (“This image couldn’t be read as a lab report. Try a sharper, flatter photo.”). Build one Reading per row, **skipping** rows with no name or a value that won’t convert to a number. Leave `taken_on` empty; the API fills it in. Keep the date only if it really is YYYY-MM-DD, otherwise None. Return the date, lab name and readings together.
- [ ] **`extract(image_bytes, image_format, model_id, region)`**: the same converse call as your smoke test, with the real prompt, **temperature 0**, and maxTokens 2000. Pass the reply text to `parse()`.
  Temperature 0 means the same image gives the same numbers every time. For a medical value, a model that answers differently on Sunday than on Saturday isn’t acceptable.
- [ ] **Five tests:** three spellings of HbA1c normalise to the same key; a fenced reply still parses; a row whose value is “pale yellow” is skipped; a date written 12/09/2026 becomes None; plain prose raises ExtractionError.
- [ ] All 13 tests pass. Then run `extract()` by hand on the three Amma samples and **check every number against the image**. Commit.

**⏱ 17:10 – 17:40**

### A4 — Storage: this is the history

> 📁 Create: **backend/core/store.py** · AWS: DynamoDB table + S3 bucket

- [ ] **Create the DynamoDB table** (console or CLI) in the chosen region: name `baseline-readings`, partition key `personId` (String), sort key `sk` (String), on-demand capacity.
  The partition key groups rows by person; the sort key orders them. One query then returns everything for Amma, and grouping happens in Python. A person has tens of readings, not millions, so don’t design for scale you’ll never see.
- [ ] **Create the S3 bucket** with the name you put in `BUCKET`, same region, with Block Public Access left **on**. It holds the original images, so every extracted number can be checked against its source.
- [ ] **`save_readings(person_id, readings, report_id, s3_key)`**: one item per reading, written through a batch writer. Set `sk` to the test key, a `#`, then the date (e.g. `hba1c#2026-09-12`). Store every Reading field, plus the report ID and the S3 key.
  That sort key means uploading the same report twice *overwrites* instead of duplicating, so re-uploads on demo day are harmless. Worth a sentence in the video.
- [ ] **`load_readings(person_id)`**: query by `personId` and turn every item back into a Reading, converting numbers back to floats.
- [ ] Save one extracted report, load it back, and confirm the numbers survived the round trip. Commit.

> [!WARNING]
> **DynamoDB refuses Python floats.** Convert every number to `Decimal` on the way in, and build it from text (`Decimal(str(x))`), never straight from the float. Otherwise 6.4 is stored as 6.4000000000000003552… Convert back to float on the way out, and leave None as None.

**⏱ 17:40 – 18:30**

### A5 — A plain summary, and the API

Tonight the summary sentence comes from a **template**: fixed wording filled in with the computed facts, deterministic and instant. Tomorrow morning Bedrock rewrites it in friendlier words (A7), and the template stays as the fallback.

> 📁 Create: **backend/core/explain.py** · **backend/app.py**

#### The template: `template_summary(trend)`

- [ ] **Change sentence:** `first` → “First result on record.” `stable` → “Unchanged since the last report.” A streak of 2 or more → “Gone up 2 times in a row (5.6 → 6.1 → 6.4 %).”, using the last streak+1 values. Otherwise → “Gone up since the last report (6.1 → 6.4 %).”
- [ ] **Status sentence:** high → “Above the normal range (4–5.6 %).”, low → “Below the normal range (…).”, normal → “Within the normal range.”, unknown → nothing. Format numbers without trailing zeros, so 4.0 prints as 4.
- [ ] **`summarise(trends, lang)`** returns a dictionary from each test_key to its sentence. Tonight it ignores `lang` and always returns the English template. The API only ever calls this function, so tomorrow’s upgrade (friendlier wording and translation) changes one function and nothing else.

#### The API: `app.py`

- [ ] Create the FastAPI app. Add **CORS middleware** allowing any origin, for GET and POST. (CORS is the browser rule that decides whether a page on one address may call an API on another. Without this, the browser blocks every call from your teammate’s page.)
- [ ] Add an **exception handler** so every error goes out as `{"error": "..."}`, the contract’s error shape, instead of FastAPI’s default `{"detail": ...}`.
- [ ] A helper that builds the response: load the person’s readings → group → compute a trend for each group → sort → summarise → turn each trend into a dictionary and add `summary` plus `updated` (true if this upload touched that test). Return person_id, report and trends, exactly as in the contract.
- [ ] **Accept `lang` on both endpoints from tonight**, as the contract says: optional, one of `en`, `kn`, `hi`, defaulting to `en`, otherwise a 400 (“Language must be English, Kannada or Hindi.”). Pass it through the helper to `summarise()`.
  It does nothing yet, since the template is English only. But because the API accepts it now, Chethan can send it from the start, and nothing about the connection between you changes on Sunday.
- [ ] **GET /api/trends**: validate the person ID, then return the helper’s output with report set to null and nothing marked updated.
- [ ] **POST /api/reports**, checks in this order: person ID valid (400) → report_date, if sent, looks like YYYY-MM-DD (400) → image no bigger than 4 MB (413) → run `extract()`, turning an ExtractionError into a 422 → use the sent date or the extracted one, and if neither exists return 422 asking the user to enter the date → if no readings were found, 422 → stamp the date onto every reading → make a random report ID → put the image in S3 at `person_id/report_id.jpg` → save the readings → return the helper’s output with the report details and the touched tests marked updated.
  Write every error message for a person, not a developer. The page shows it exactly as written.
- [ ] At the bottom, create a variable named `handler` that wraps the app with **Mangum**. Mangum is an adapter that lets the same FastAPI app run on Lambda. Locally nothing uses it; tomorrow it’s the only change needed.
- [ ] Start it with `uvicorn app:app --reload --port 8000`. In a second terminal, **seed** the two older reports: send the March and August Amma images to POST /api/reports with `curl.exe`, passing person_id, file and report_date as form fields. Then call GET /api/trends for Amma.
  In PowerShell, plain `curl` is really `Invoke-WebRequest` and won’t accept form fields the same way. Always type `curl.exe`.
- [ ] Compare the GET response with the contract **field by field**. A missing or renamed field breaks the page at the merge.
- [ ] Leave the **September** report un-uploaded. It’s the live upload for the demo. Commit, pull, push.

**⏱ 18:45 – 19:00 · MERGE 1 · together, on your laptop**

### First join-up: real page against real backend

- [ ] `git pull` to get their latest `web/`.
- [ ] In their `web/config.js`, switch the mock off and point the API address at `http://localhost:8000`. **Don’t commit this edit**; it only applies to your laptop.
- [ ] From `web/`, run `python -m http.server 5500` and open `http://localhost:5500`.
- [ ] Pick Amma and upload the September report. Real extraction, real trends, their cards. **That’s the whole product working end to end.**

> [!NOTE]
> If something doesn’t fit, compare the real JSON against `CONTRACT.md` before anyone edits code. Whichever side differs from the contract is the side that changes.

## Phase 3 — Showcase, then the first deploy

**When:** SAT 19:00 – night

**⏱ 19:00 – 20:00 · both of you**

### Showcase: use the mentors

- [ ] Ask: **“I’m deploying FastAPI on Lambda with Mangum and a Function URL tonight. What will bite me?”**
- [ ] Explain model reads → code decides → model explains, and watch how they react.
- [ ] Write down every criticism word for word. Judge it tomorrow, not tonight.

**⏱ Sat night · ~90 min, then sleep**

### A6 — Deploy the real backend to Lambda, rough is fine

Deploy the real code tonight, not a hello-world. If it works, Sunday is only small updates. If it fails, you find out why while there’s still slack.

- [ ] **Build a Linux package on Windows.** Lambda runs on Linux, and some of your packages (pydantic, which FastAPI uses) contain compiled code built for one operating system. Install fastapi, mangum and python-multipart into a folder called `package` using pip’s options for a **different platform**: platform `manylinux2014_x86_64`, binary wheels only, Python version 3.12, implementation `cp`.
  Leave boto3 out: Lambda already includes it. If you just pip install normally, Lambda fails with `No module named 'pydantic_core._pydantic_core'`.
- [ ] Copy `app.py` and the whole `core/` folder into `package`, then zip the **contents** of `package` into `build.zip`, so `app.py` sits at the top of the zip.
  Use Python’s `shutil.make_archive`, not Windows’ own zip. Some versions of the built-in one write paths Linux can’t read.
- [ ] Lambda console → Create function `baseline-api`: **Python 3.12, x86_64**, a new role with basic permissions. Upload `build.zip`. In Runtime settings, set the handler to `app.handler`.
- [ ] Configuration → General: **timeout 60 seconds, memory 1024 MB**. Configuration → Environment variables: `MODEL_ID`, `BUCKET`, `TABLE`.
  Don’t add `AWS_REGION`. Lambda sets it automatically and won’t let you override it. The default 3-second timeout is far too short for a model call.
- [ ] IAM → the function’s role → attach `AmazonBedrockFullAccess`, `AmazonS3FullAccess` and `AmazonDynamoDBFullAccess`.
- [ ] Configuration → Function URL → create one, auth type **NONE**, and **leave its CORS option off**.
- [ ] Call GET /api/trends for Amma on the Function URL with `curl.exe`. JSON back means it’s alive. Send the URL to your teammate.
- [ ] For every later redeploy: re-copy `app.py` and `core/` into `package`, re-zip, and upload with `aws lambda update-function-code` (function name, plus the zip file).

> [!WARNING]
> **Leave the Function URL’s CORS off.** FastAPI already sends the CORS headers. If both do it, the browser receives the header twice and blocks every request, with an error that doesn’t explain why. One owner for CORS: FastAPI.

## Phase 4 — Model explains, then go live

**When:** SUN 09:00 – 14:00

**⏱ 09:00 – 10:30**

### A7 — Stage 3 properly: Bedrock rewrites the facts, in the reader’s language

The model is handed the **template sentences, already computed**, and never the raw history. Its only jobs are the wording and the language. If anything goes wrong, the English template goes out unchanged, so this can’t break the product.

- [ ] Change `summarise(trends, lang)`: build the English template sentences first. Then decide whether to call the model: **always** for Kannada or Hindi, since translation needs it; for English, only when the environment variable `PHRASE` is `1`. If no call is needed, return the templates.
- [ ] Send the templates to Bedrock as JSON (text only, no image), with a prompt that says: rewrite each fact as one warm, plain sentence for a family member with no medical training, **written in the requested language** (name it in full: English, Kannada or Hindi); use only the facts given and never add, change or round a number; **keep every number as ordinary digits and keep test names and units exactly as given**, untranslated; never diagnose, name a disease, or suggest treatment; if a value is out of range, end by saying it’s worth discussing with a doctor; at most 30 words each; return only JSON mapping each test_key to its sentence. Temperature 0.
  Keeping digits and test names untouched matters: a doctor or a relative reading the Kannada summary still has to be able to match it against the printed report.
- [ ] Parse the reply with `strip_fence`. For each test, use the model’s sentence if it gave one, otherwise the English template. If the call or the parsing fails in **any** way, return the English templates.
- [ ] **A cheap safety check:** after the reply comes back, pull every number out of each model sentence and check each one also appears in that test’s template. If a sentence contains a number the template doesn’t, throw that sentence away and use the template instead.
  This is the architecture rule applied one more time: the model is allowed to choose words, never numbers. It also catches a translation that quietly turned 6.4 into 64.
- [ ] Test locally in all three languages against Amma’s data. Every number must match the template exactly. Time an upload in Kannada; if the delay makes the demo drag, keep English phrasing off and use the model only for translation.
- [ ] **You and Chethan read the Kannada and Hindi output yourselves.** Is it natural? Is any medical term mistranslated? Does it ever sound like a diagnosis? Fix the prompt until it passes.
  This is ten minutes only the two of you can do. Nobody judging will read Kannada more carefully than a worried family member would.
- [ ] Add one test for the safety check: a fake model sentence containing a number that isn’t in the template gets replaced by the template. All 14 tests pass. Commit.

> [!NOTE]
> The prompt’s rules (never diagnose, never name a disease) decide where the product’s medical line sits. **That’s a decision for the two of you, not for me.** Read it together and move the line if you want it elsewhere.

**⏱ 10:30 – 12:00**

### A8 — Live backend, seeded, verified

- [ ] Redeploy. Add `PHRASE` to the Lambda’s environment variables if you’re keeping it.
- [ ] Seed the March and August Amma reports through the **Function URL**, the same way you did locally.
- [ ] Open CloudWatch Logs for the function once and check that a successful upload logs no errors.

**⏱ 12:00 · MERGE 2 · together**

### Live page against live backend

- [ ] Your teammate points `web/config.js` at your Function URL with the mock off, commits it, and redeploys to Amplify.
- [ ] Both of you open the **Amplify URL on a phone, on mobile data**, and upload the September report.

> [!IMPORTANT]
> **14:00 is a hard gate.** If it isn’t working live by then, stop and submit the version that ran at Merge 1. It still competes for Build It and Best UI. Losing the afternoon to a deploy you’d abandon anyway is how teams miss the form.

## Phase 5 — Make the architecture visible

**When:** SUN 14:00 – 17:00

_While your teammate polishes the UI, you make the backend readable to a judge in thirty seconds, and record the AWS footage the video needs._

- [ ] **README:** what it does, an architecture diagram (a Mermaid code block, which GitHub draws automatically), how to run it locally, and model reads → code decides → model explains in three lines.
- [ ] **Record the AWS footage** (Windows: `Win + Alt + R`): the Lambda function, the DynamoDB table with Amma’s items, the S3 bucket with the images, the Bedrock model.
  The rules are explicit that AWS has to appear in the video. This footage is how.
- [ ] Record `pytest -v` passing. Proof that the arithmetic isn’t left to the model.
- [ ] Draft the writeup: the problem, the build, where AWS fits, what you learned, and **the AI coding tools you used** (required by the rules).

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
| `AccessDeniedException` from Bedrock | Account still verifying, wrong region, or a plain model ID used instead of the inference profile ID | Use the exact profile ID from the console, in the chosen region | 1h+ |
| `Float types are not supported` | Python floats written to DynamoDB | Convert to Decimal via text on the way in | 20m |
| Browser blocks the call, console mentions CORS | CORS switched on in the Function URL *and* in FastAPI | Turn the Function URL’s CORS off | 1h |
| `No module named pydantic_core...` on Lambda | Package built for Windows | Rebuild with the Linux platform options | 45m |
| `Task timed out after 3.00 seconds` | Lambda’s default timeout | 60 seconds and 1024 MB | 10m |
| `ModuleNotFoundError: core` in pytest | pytest can’t see `backend/` | The pythonpath line in `pytest.ini`; run pytest from `backend/` | 15m |
| Kannada summary quietly shows a different number | The model rewrote or re-formatted a value while translating | The number safety check in A7 falls back to the template | 30m |
| Every trend says `first` | Labs spelled a test differently, or dates weren’t read | Check `normalise()`; send report_date when seeding | 30m |

---

Baseline · Track A: backend · model reads, code decides, model explains
