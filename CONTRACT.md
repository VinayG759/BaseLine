# Baseline API contract (version 6)

Shared by backend/ and web/. Change it only after both of you agree.

**Version 6** adds these:
- **Profiles:** gender, age (which grows by itself each year), height and weight; `PATCH /api/people/{id}`.
- **Two-step upload:** preview → review → confirm, with a check of the patient name printed on the report.
- **Report history:** list, detail with the photo and a plain-language summary, edit, and delete.
- **No caching:** every API response carries `Cache-Control: no-store`.

**Version 5** adds email + password accounts. Every endpoint except register and login now needs
`Authorization: Bearer <token>`, and answers **401** without a valid session. Each account sees only its own people.
**Version 4** replaces the fixed people list with real profiles (`GET/POST /api/people`). Every other endpoint now answers **404** for a `person_id` that was never created, so the page must take IDs from `GET /api/people`.
**Version 3** added a `reminder` field, the doctor view (`GET /api/doctor`) and the chatbot (`POST /api/chat`).

## Accounts (v5)

```
POST {API}/api/auth/register   JSON {"email": "you@example.com", "password": "at least 8 chars", "username": "Vinay"}
     → 201 {"email": "you@example.com", "username": "Vinay"}   (creates the account only; the person then logs in)
POST {API}/api/auth/login      JSON {"email": ..., "password": ...}
     → 200 {"token": "...", "email": ..., "username": ...}
POST {API}/api/auth/logout     (with the token) → 200 {"ok": true}; the token stops working
GET  {API}/api/auth/me         (with the token) → 200 {"email": ..., "username": ...}
```

| Field | Meaning |
|---|---|
| `token` | Send on every other request as `Authorization: Bearer <token>`. Valid for 7 days. |
| `email` | Stored lowercased; `Vinay@X.com` and `vinay@x.com` are the same account. Used to log in. |
| `username` | Shown in the app ("Signed in as Vinay"). 2–30 characters: letters in any script, digits, spaces, `. _ -`. Accounts made before usernames existed get the part of the email before `@`. |
| errors | 400 bad email or password length (8–128), 409 email already registered, 401 "Email or password is incorrect." (the same for an unknown email and a wrong password). |
| 401 anywhere else | Not logged in or session expired: forget the token and show the login page. |

## People (v4, extended in v6)

```
GET  {API}/api/people
     → {"people": [ {"person_id": "arjun-rao-1a2b", "title": "Mr", "name": "Arjun Rao",
                     "is_self": true, "display_name": "Mr Arjun Rao",
                     "gender": "male", "age": 22, "height_cm": 175.0, "weight_kg": null}, ... ]}
       The "myself" profile (is_self true) comes first, then alphabetical by name.

POST {API}/api/people
     application/json: {"title": "Mrs", "name": "Sunita Rao", "is_self": false,
                        "gender": "female", "age": 54, "height_cm": 158, "weight_kg": null}
     → 201 with one person object, shaped as above

PATCH {API}/api/people/{person_id}          (v6)
     application/json: only the fields to change, from title, name, gender, age, height_cm, weight_kg
     → 200 with the updated person object
```

| Field (v6) | Meaning |
|---|---|
| `gender` | Required on POST: `female`, `male` or `other`. |
| `age` | Required on POST: whole years, 0–120. The backend remembers the date it was entered and adds a year on each anniversary, so the `age` it returns is always current. Sending a new age in PATCH restarts that count. |
| `height_cm`, `weight_kg` | Optional (null when unknown). Height 30–250 cm, weight 1–350 kg. Saving a report that includes a height or weight updates the profile too. |

| Field | Meaning |
|---|---|
| `title` | One of `Mr`, `Ms`, `Mrs`, `Miss`, `Dr`, `Mx`, or `""` / missing for none. Anything else is a 400. |
| `name` | 1–40 characters: letters in any script (Kannada and Hindi work), spaces, `.` `'` `-`. Extra spaces are tidied. Otherwise 400. |
| `is_self` | "This is me." At most one profile; a second one is a **409** "A profile for yourself already exists." |
| `display_name` | Title and name together, e.g. "Mrs Sunita Rao". Show this, don't build your own. |
| `person_id` | Created by the backend from the name plus 4 random characters, e.g. `sunita-rao-4f2a`. Treat it as opaque. |
| privacy | Each account sees only its own profiles (v5). Use made-up names in demos. |

## Trends and uploads

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
  ],
  "reminder": {                        // v3. null if the person has no reports
    "last_report": "2026-09-12",
    "next_due": "2026-12-11",          // 90 days after the latest report
    "overdue": false                   // true once next_due has passed
  }
}
```

| Field | Meaning |
|---|---|
| `order` | Out-of-range results first (high or low), then the longest streak, then alphabetical by name. |
| `errors` | Any non-200 carries `{"error": "a sentence a person can act on"}`. The page shows that sentence as-is, so write it for a human. |
| `language` | Only `summary` is translated. Test names, units, numbers and dates are always returned exactly as printed on the report, whatever the language. If translation fails, `summary` comes back in English; the page doesn’t need to handle that specially. |
| `people` | From `GET /api/people` (v4). A `person_id` that doesn't exist gets **404** with an error sentence on every endpoint. |
| `errors, 503` | 503 means AWS or the model is unreachable. The `error` sentence says to try again in a minute. |

## Reviewed uploads (v6)

The app uses these two steps instead of the one-step `POST /api/reports`. The one-step endpoint still works, and it refuses reports whose printed name belongs to someone else.

```
POST {API}/api/reports/preview
     multipart/form-data: person_id, file, report_date (optional), lang (optional)   (same rules as /api/reports)
     → 200, and NOTHING is saved:
     {
       "person_id": "sunita-rao-4f2a",
       "name_check": {"status": "same", "detected_name": "Mrs. Sunita Rao"},
       "report_date": "2026-09-12",            // null if no date could be read
       "lab_name": "Sri Sai Diagnostics",      // may be null
       "patient_name": "Mrs. Sunita Rao",      // as printed; may be null
       "readings": [ {"test_key": "hba1c", "test_name": "HbA1c", "value": 6.4, "unit": "%",
                      "ref_low": 4.0, "ref_high": 5.6, "status": "high"} ],
       "saved": false,
       "analysis": { "trends": [...], "summary": "..." }   // ONLY when name_check.status is "different"
     }

POST {API}/api/reports/confirm
     multipart/form-data:
       person_id   text, required
       file        the same photo, required (it is stored with the report)
       payload     JSON text: {"report_date": "2026-09-12", "lab_name": ..., "patient_name": ...,
                               "readings": [ {"test_name", "value", "unit", "ref_low", "ref_high"} ],
                               "height_cm": 158, "weight_kg": null, "name_confirmed": false, "lang": "en"}
     → 200 in the same shape as POST /api/reports; `report` also carries `summary` (see below)
```

| `name_check.status` | Meaning and what the page does |
|---|---|
| `same` | The printed name matches the chosen person. Review, then confirm. |
| `other_person` | It matches someone else in this account (`person_id` and `display_name` are included). Offer to switch to them. Confirming for the wrong person gets a **409**. |
| `different` | Nobody in this account. The report was read for someone being helped: show `analysis` (result cards and a summary) and **never save it**. Confirm gets a **409**. |
| `unknown` | No name was printed. Confirm only after the person agrees; send `"name_confirmed": true`, otherwise **409**. |

| Field | Meaning |
|---|---|
| name matching | Titles (Mr, Mrs, Smt, Shri, Dr…) are ignored. The first name must match (one typo allowed for names of 5+ letters). The surname must match if both names have one, or match an initial ("S. Rao"). |
| reviewed readings | 1–80 rows, name ≤ 60 characters, a numeric value, unit ≤ 20 characters, ref_low ≤ ref_high, no test twice. Otherwise **400** with a sentence. |
| height/weight | Optional. When given, they update the person's profile as well. |

## Report history (v6)

```
GET    {API}/api/reports?person_id=...
       → {"person_id": ..., "reports": [ report, ... ]}          newest first

GET    {API}/api/reports/{report_id}?person_id=...&lang=kn
       → { ...report, "image_url": "https://...", "readings": [ ... ], "summary": "..." }

PUT    {API}/api/reports/{report_id}
       application/json: {"person_id": ..., "readings": [ ... ], "report_date": "2026-09-12", "lang": "en"}
       → 200 in the same shape as POST /api/reports

DELETE {API}/api/reports/{report_id}?person_id=...
       → {"ok": true}; the photo, the values and the record are all removed

report = {"report_id": "3f9c...", "report_date": "2026-09-12", "lab_name": ..., "patient_name": ...,
          "uploaded_at": "2026-09-19T10:31:02+00:00", "height_cm": 158.0, "weight_kg": null, "result_count": 12}
```

| Field | Meaning |
|---|---|
| `image_url` | A private link to the photo, valid for 10 minutes. Fetch a fresh one each time the report is opened. `null` for demo reports that have no photo. |
| `readings` | The values on that report, alphabetical, with `status` (normal, high, low or unknown). Same row shape as preview. |
| `summary` | A short, plain-language paragraph about the whole report, in `lang`. Same number safety as the chatbot, with a template fallback. It is written once per language and then cached. Editing clears the cache. |
| edit | Replaces all of the report's values (same rules as confirm). The photo stays. |
| unknown `report_id` | **404** "This report isn't in Baseline." |

## Doctor view (v3)

```
GET {API}/api/doctor?person_id=amma
    → every result as a clinical table. Always English, no friendly sentences.

200:
{
  "person_id": "amma",
  "report_dates": ["2026-03-04", "2026-08-08", "2026-09-12"],   // oldest first
  "tests": [                                                     // alphabetical by test_name
    {
      "test_key": "hba1c",
      "test_name": "HbA1c",
      "results": [                                               // oldest first
        {"date": "2026-03-04", "value": 5.6, "unit": "%", "ref_low": 4.0, "ref_high": 5.6, "flag": ""},
        {"date": "2026-08-08", "value": 6.1, "unit": "%", "ref_low": 4.0, "ref_high": 5.6, "flag": "H"},
        {"date": "2026-09-12", "value": 6.4, "unit": "%", "ref_low": 4.0, "ref_high": 5.6, "flag": "H"}
      ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `flag` | `"H"` above range, `"L"` below range, `""` within range or no range printed. |
| per-result range | Each result carries the unit and range printed on *its own* report, because labs differ. Show them per row. |
| layout | Suggested: one table per test, columns Date · Result · Unit · Reference range · Flag, printable on A4. |

## Chatbot (v3)

```
POST {API}/api/chat
     application/json:
       {"person_id": "amma", "question": "Is anything getting worse?", "lang": "kn"}
       question   required, 1–500 characters
       lang       en | kn | hi, optional, missing means en
     → {"person_id": "amma", "reply": "one short answer in the requested language"}
```

| Field | Meaning |
|---|---|
| memory | None. Each question is answered on its own; the page may show the conversation, but must not rely on earlier answers. |
| no reports | Returns 200 with a reply saying there are no reports yet. |
| safety | If the model writes a number that isn't in the person's data, the reply is replaced with a sentence suggesting the result cards or a doctor. Show `reply` as-is. |
| timing | Slower than the other endpoints (several seconds). Show a working state. |
