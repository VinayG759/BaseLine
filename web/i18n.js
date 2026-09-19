/**
 * Baseline interface translations: English, Kannada, Hindi.
 *
 * Technical Concept: i18n ("internationalisation")
 * Every piece of interface text has a key. HTML elements carry the key in a data-i18n attribute, and
 * scripts call t("key"). Switching language re-fills every element, so the whole interface changes.
 *
 * Never translated: test names, numbers, units, report dates' digits, and the doctor view (clinical English).
 * Kannada and Hindi were written by an AI assistant: have a native speaker proofread them before a demo.
 */
const I18n = (() => {
  const LANGS = ["en", "kn", "hi"];
  const LOCALES = { en: "en-IN", kn: "kn-IN", hi: "hi-IN" };

  const STRINGS = {
    en: {
      "doc.title": "Baseline - A Health Record That Notices",
      "doc.titleLogin": "Baseline - Log in",
      "common.home": "Baseline Home",
      "common.theme": "Toggle dark mode",
      "common.language": "Language",
      "common.mascotAlt": "Cartoon doctor mascot",
      "common.boundary": "Baseline explains and tracks lab results. It does not diagnose or recommend treatment. Talk to a doctor about any result.",
      "common.madeFor": "Made for the AWS student hackathon",
      "error.generic": "Something went wrong. Try again.",
      "error.photo": "Couldn't open this photo. Try another one.",

      "landing.badge": "AWS Hackathon",
      "landing.title": "Baseline: a health record that notices",
      "landing.lead": "Photograph your family's lab reports. Baseline remembers every result and tells you, in your language, when a number keeps moving the wrong way.",
      "landing.cta": "Open Baseline →",
      "landing.whyAria": "Why Baseline exists",
      "landing.why1": "Reports sit in a drawer.",
      "landing.why2": "Each one gets a glance.",
      "landing.why3": "The warning is in the change BETWEEN reports.",
      "landing.howAria": "How Baseline works",
      "landing.how": "How It Works",
      "landing.step1": "1. Photograph",
      "landing.step1Text": "Snap a photo of your printed lab test report with your camera.",
      "landing.step2": "2. Remembers",
      "landing.step2Text": "Reads every number and connects it to your earlier reports.",
      "landing.step3": "3. Notices",
      "landing.step3Text": "Charts each result against its normal range and points out numbers that keep rising.",
      "landing.featuresAria": "Key features",
      "landing.features": "Built for Families & Doctors",
      "landing.f1Text": "Summaries in your mother tongue",
      "landing.f2": "Doctor View",
      "landing.f2Text": "Clinical tables ready for consultation",
      "landing.f3": "Ask Questions",
      "landing.f3Text": "Clear answers straight from your reports",
      "landing.f4": "Next-Test Reminders",
      "landing.f4Text": "Gentle reminders when the next test is due",

      "login.welcome": "Welcome back! Log in to see your family's lab history.",
      "login.welcomeNew": "Create an account to keep lab reports for yourself and your family.",
      "login.tabsAria": "Log in or create an account",
      "login.login": "Log in",
      "login.register": "Create account",
      "login.username": "Username",
      "login.usernamePh": "What should we call you?",
      "login.email": "Email",
      "login.password": "Password",
      "login.passwordPh": "At least 8 characters",
      "login.confirm": "Confirm password",
      "login.confirmPh": "Type it again",
      "login.show": "Show password",
      "login.hide": "Hide password",
      "login.loggingIn": "Logging in...",
      "login.creating": "Creating account...",
      "login.mismatch": "The two passwords don't match.",
      "login.created": "Account created, {name}. Log in with your new password.",

      "app.demo": "Demo",
      "app.doctorView": "🩺 Doctor view",
      "app.doctorViewAria": "Open Doctor View",
      "app.signedIn": "Signed in as {name}",
      "app.logout": "Log out",
      "app.peopleAria": "Family Member and Language Controls",
      "app.selectPerson": "Select Family Member",
      "app.loadingProfiles": "Loading profiles...",
      "app.noOne": "No one added yet",
      "app.myself": "Myself ({name})",
      "app.addPerson": "+ Add person",
      "app.addPersonAria": "Add a new family member",
      "app.mascotAria": "Doctor Mascot Assistant",
      "app.hello": "Hello! Loading your health records...",
      "app.pathAria": "History Path and Next Test Reminder",
      "path.heading": "Tracking Journey",
      "path.reportDate": "Report Date",
      "path.next": "Next Test",
      "path.nextTitle": "Next Test Due",
      "path.overdue": "Overdue",
      "path.overdueTitle": "Overdue Test",

      "upload.aria": "Upload New Lab Report",
      "upload.title": "Add a Report",
      "upload.take": "📷 Take photo",
      "upload.gallery": "🖼️ From gallery",
      "upload.previewAlt": "Selected lab report preview",
      "upload.dateToggle": "Date not printed clearly?",
      "upload.dateLabel": "Report Date (Optional)",
      "upload.read": "Read report",
      "upload.reading": "Reading...",
      "upload.readingReport": "Reading the report...",
      "upload.comparing": "Comparing with {n} earlier reports...",
      "upload.needPerson": "Add a person first: tap \"+ Add person\", then read the report.",
      "upload.needPhoto": "Take or choose a photo of the report first.",
      "upload.added": "Added {n} results from the {date} report.",
      "upload.addedNoDate": "Added {n} results.",
      "upload.inProgress": "A report is being read. Please wait.",
      "celebrate.self": "Report added to your history!",
      "celebrate.other": "Report added to {name}'s history!",
      "celebrate.title": "Report Added!",
      "celebrate.text": "Baseline recorded results into history.",

      "trends.aria": "Lab Test Trends",
      "trends.loading": "Loading health history...",
      "trends.emptyTitle": "No reports tracked yet",
      "trends.emptyText": "Photograph or choose a lab report to start tracking changes.",
      "range.both": "Normal {low}–{high} {unit}",
      "range.below": "Normal below {high} {unit}",
      "range.above": "Normal above {low} {unit}",
      "range.none": "No reference range printed",
      "card.high": "High result",
      "card.low": "Low result",
      "card.tap": "Tap to hear the summary for {test}",
      "card.chart": "{test}: {n} results, latest {value}",
      "dir.rising": "rising",
      "dir.falling": "falling",
      "dir.stable": "stable",

      "chat.aria": "Ask questions about lab results",
      "chat.title": "Ask about these results",
      "chat.quickAria": "Quick questions",
      "chat.q1": "Is anything getting worse?",
      "chat.q2": "What should I ask the doctor?",
      "chat.q3": "Explain HbA1c simply.",
      "chat.welcome": "Ask me any question about these lab tests.",
      "chat.label": "Type a question",
      "chat.placeholder": "Ask about your numbers...",
      "chat.inputAria": "Type your health question",
      "chat.send": "Send",
      "chat.note": "Answers come only from these reports. Baseline doesn't diagnose.",
      "chat.thinking": "Thinking...",

      "person.modalTitle": "Add Family Member",
      "person.title": "Title",
      "person.none": "(None)",
      "person.name": "Full Name",
      "person.namePh": "e.g. Sunita Rao",
      "person.isMe": "This is me",
      "person.cancel": "Cancel",
      "person.save": "Save Person",
      "person.added": "Added profile for {name}",

      "mascot.hiLoading": "Hi {name}! Loading your health records...",
      "mascot.begin": "Hi {name}! Let's begin: tap \"+ Add person\" to add yourself or a family member.",
      "mascot.startSelf": "Let's start your history. Add your latest lab report.",
      "mascot.startOther": "Let's start {name}'s history. Add the latest lab report.",
      "mascot.overdue": "The next test was due on {date}.",
      "mascot.outOne": "1 result is outside the normal range. Worth discussing with a doctor.",
      "mascot.outMany": "{n} results are outside the normal range. Worth discussing with a doctor.",
      "mascot.allNormal": "All results are within the normal range.",
      "mascot.looking": "Let me look at the reports...",
      "mascot.tap1": "I'm here if you need me!",
      "mascot.tap2": "Tap a result card and I'll explain it.",
      "mascot.tap3": "Keeping an eye on the numbers for you."
    },

    kn: {
      "doc.title": "Baseline - ಗಮನಿಸುವ ಆರೋಗ್ಯ ದಾಖಲೆ",
      "doc.titleLogin": "Baseline - ಲಾಗ್ ಇನ್",
      "common.home": "Baseline ಮುಖಪುಟ",
      "common.theme": "ಡಾರ್ಕ್ ಮೋಡ್ ಬದಲಿಸಿ",
      "common.language": "ಭಾಷೆ",
      "common.mascotAlt": "ಕಾರ್ಟೂನ್ ವೈದ್ಯ ಪಾತ್ರ",
      "common.boundary": "Baseline ಲ್ಯಾಬ್ ಫಲಿತಾಂಶಗಳನ್ನು ವಿವರಿಸುತ್ತದೆ ಮತ್ತು ಗಮನಿಸುತ್ತದೆ. ಇದು ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ, ಚಿಕಿತ್ಸೆಯನ್ನೂ ಸೂಚಿಸುವುದಿಲ್ಲ. ಯಾವುದೇ ಫಲಿತಾಂಶದ ಬಗ್ಗೆ ವೈದ್ಯರೊಂದಿಗೆ ಮಾತನಾಡಿ.",
      "common.madeFor": "AWS ವಿದ್ಯಾರ್ಥಿ ಹ್ಯಾಕಥಾನ್‌ಗಾಗಿ ತಯಾರಿಸಲಾಗಿದೆ",
      "error.generic": "ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      "error.photo": "ಈ ಫೋಟೋ ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಬೇರೆ ಫೋಟೋ ಪ್ರಯತ್ನಿಸಿ.",

      "landing.badge": "AWS ಹ್ಯಾಕಥಾನ್",
      "landing.title": "Baseline: ಗಮನಿಸುವ ಆರೋಗ್ಯ ದಾಖಲೆ",
      "landing.lead": "ನಿಮ್ಮ ಕುಟುಂಬದ ಲ್ಯಾಬ್ ವರದಿಗಳ ಫೋಟೋ ತೆಗೆಯಿರಿ. Baseline ಪ್ರತಿಯೊಂದು ಫಲಿತಾಂಶವನ್ನೂ ನೆನಪಿಟ್ಟುಕೊಳ್ಳುತ್ತದೆ, ಮತ್ತು ಯಾವುದಾದರೂ ಸಂಖ್ಯೆ ತಪ್ಪು ದಿಕ್ಕಿನಲ್ಲಿ ಸಾಗುತ್ತಿದ್ದರೆ ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲೇ ತಿಳಿಸುತ್ತದೆ.",
      "landing.cta": "Baseline ತೆರೆಯಿರಿ →",
      "landing.whyAria": "Baseline ಏಕೆ",
      "landing.why1": "ವರದಿಗಳು ಡ್ರಾಯರ್‌ನಲ್ಲೇ ಉಳಿಯುತ್ತವೆ.",
      "landing.why2": "ಪ್ರತಿಯೊಂದನ್ನೂ ಒಮ್ಮೆ ನೋಡಿ ಬಿಡುತ್ತೇವೆ.",
      "landing.why3": "ನಿಜವಾದ ಎಚ್ಚರಿಕೆ ವರದಿಗಳ ನಡುವಿನ ಬದಲಾವಣೆಯಲ್ಲಿದೆ.",
      "landing.howAria": "Baseline ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ",
      "landing.how": "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ",
      "landing.step1": "1. ಫೋಟೋ ತೆಗೆಯಿರಿ",
      "landing.step1Text": "ನಿಮ್ಮ ಮುದ್ರಿತ ಲ್ಯಾಬ್ ವರದಿಯ ಫೋಟೋವನ್ನು ಕ್ಯಾಮೆರಾದಿಂದ ತೆಗೆಯಿರಿ.",
      "landing.step2": "2. ನೆನಪಿಡುತ್ತದೆ",
      "landing.step2Text": "ಪ್ರತಿಯೊಂದು ಸಂಖ್ಯೆಯನ್ನು ಓದಿ, ನಿಮ್ಮ ಹಿಂದಿನ ವರದಿಗಳೊಂದಿಗೆ ಜೋಡಿಸುತ್ತದೆ.",
      "landing.step3": "3. ಗಮನಿಸುತ್ತದೆ",
      "landing.step3Text": "ಪ್ರತಿ ಫಲಿತಾಂಶವನ್ನು ಅದರ ಸಾಮಾನ್ಯ ಮಿತಿಯೊಂದಿಗೆ ಚಿತ್ರಿಸಿ, ಏರುತ್ತಲೇ ಇರುವ ಸಂಖ್ಯೆಗಳನ್ನು ತೋರಿಸುತ್ತದೆ.",
      "landing.featuresAria": "ಮುಖ್ಯ ವೈಶಿಷ್ಟ್ಯಗಳು",
      "landing.features": "ಕುಟುಂಬಗಳು ಮತ್ತು ವೈದ್ಯರಿಗಾಗಿ",
      "landing.f1Text": "ನಿಮ್ಮ ಮಾತೃಭಾಷೆಯಲ್ಲಿ ಸಾರಾಂಶಗಳು",
      "landing.f2": "ವೈದ್ಯರ ನೋಟ",
      "landing.f2Text": "ವೈದ್ಯರ ಭೇಟಿಗೆ ಸಿದ್ಧವಾದ ಕ್ಲಿನಿಕಲ್ ಕೋಷ್ಟಕಗಳು",
      "landing.f3": "ಪ್ರಶ್ನೆ ಕೇಳಿ",
      "landing.f3Text": "ನಿಮ್ಮ ವರದಿಗಳಿಂದಲೇ ಸ್ಪಷ್ಟ ಉತ್ತರಗಳು",
      "landing.f4": "ಮುಂದಿನ ಪರೀಕ್ಷೆಯ ನೆನಪು",
      "landing.f4Text": "ಮುಂದಿನ ಪರೀಕ್ಷೆಯ ಸಮಯ ಬಂದಾಗ ಸೌಮ್ಯ ನೆನಪು",

      "login.welcome": "ಮತ್ತೆ ಸ್ವಾಗತ! ನಿಮ್ಮ ಕುಟುಂಬದ ಲ್ಯಾಬ್ ಇತಿಹಾಸ ನೋಡಲು ಲಾಗ್ ಇನ್ ಮಾಡಿ.",
      "login.welcomeNew": "ನಿಮ್ಮ ಮತ್ತು ನಿಮ್ಮ ಕುಟುಂಬದ ಲ್ಯಾಬ್ ವರದಿಗಳನ್ನು ಇಡಲು ಖಾತೆ ತೆರೆಯಿರಿ.",
      "login.tabsAria": "ಲಾಗ್ ಇನ್ ಮಾಡಿ ಅಥವಾ ಖಾತೆ ತೆರೆಯಿರಿ",
      "login.login": "ಲಾಗ್ ಇನ್",
      "login.register": "ಖಾತೆ ತೆರೆಯಿರಿ",
      "login.username": "ಬಳಕೆದಾರ ಹೆಸರು",
      "login.usernamePh": "ನಿಮ್ಮನ್ನು ಏನೆಂದು ಕರೆಯಲಿ?",
      "login.email": "ಇಮೇಲ್",
      "login.password": "ಪಾಸ್‌ವರ್ಡ್",
      "login.passwordPh": "ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳು",
      "login.confirm": "ಪಾಸ್‌ವರ್ಡ್ ದೃಢೀಕರಿಸಿ",
      "login.confirmPh": "ಮತ್ತೊಮ್ಮೆ ಟೈಪ್ ಮಾಡಿ",
      "login.show": "ಪಾಸ್‌ವರ್ಡ್ ತೋರಿಸಿ",
      "login.hide": "ಪಾಸ್‌ವರ್ಡ್ ಮರೆಮಾಡಿ",
      "login.loggingIn": "ಲಾಗ್ ಇನ್ ಆಗುತ್ತಿದೆ...",
      "login.creating": "ಖಾತೆ ತೆರೆಯಲಾಗುತ್ತಿದೆ...",
      "login.mismatch": "ಎರಡೂ ಪಾಸ್‌ವರ್ಡ್‌ಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ.",
      "login.created": "{name}, ನಿಮ್ಮ ಖಾತೆ ಸಿದ್ಧವಾಗಿದೆ. ಹೊಸ ಪಾಸ್‌ವರ್ಡ್‌ನೊಂದಿಗೆ ಲಾಗ್ ಇನ್ ಮಾಡಿ.",

      "app.demo": "ಡೆಮೊ",
      "app.doctorView": "🩺 ವೈದ್ಯರ ನೋಟ",
      "app.doctorViewAria": "ವೈದ್ಯರ ನೋಟ ತೆರೆಯಿರಿ",
      "app.signedIn": "{name} ಆಗಿ ಲಾಗ್ ಇನ್ ಆಗಿದ್ದೀರಿ",
      "app.logout": "ಲಾಗ್ ಔಟ್",
      "app.peopleAria": "ಕುಟುಂಬ ಸದಸ್ಯ ಮತ್ತು ಭಾಷೆ",
      "app.selectPerson": "ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಆರಿಸಿ",
      "app.loadingProfiles": "ಪ್ರೊಫೈಲ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...",
      "app.noOne": "ಇನ್ನೂ ಯಾರನ್ನೂ ಸೇರಿಸಿಲ್ಲ",
      "app.myself": "ನಾನು ({name})",
      "app.addPerson": "+ ವ್ಯಕ್ತಿಯನ್ನು ಸೇರಿಸಿ",
      "app.addPersonAria": "ಹೊಸ ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ",
      "app.mascotAria": "ವೈದ್ಯ ಸಹಾಯಕ",
      "app.hello": "ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಆರೋಗ್ಯ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...",
      "app.pathAria": "ಇತಿಹಾಸ ಮತ್ತು ಮುಂದಿನ ಪರೀಕ್ಷೆ",
      "path.heading": "ನಿಮ್ಮ ಪಯಣ",
      "path.reportDate": "ವರದಿ ದಿನಾಂಕ",
      "path.next": "ಮುಂದಿನ ಪರೀಕ್ಷೆ",
      "path.nextTitle": "ಮುಂದಿನ ಪರೀಕ್ಷೆಯ ದಿನ",
      "path.overdue": "ಬಾಕಿ ಇದೆ",
      "path.overdueTitle": "ಬಾಕಿ ಇರುವ ಪರೀಕ್ಷೆ",

      "upload.aria": "ಹೊಸ ಲ್ಯಾಬ್ ವರದಿ ಸೇರಿಸಿ",
      "upload.title": "ವರದಿ ಸೇರಿಸಿ",
      "upload.take": "📷 ಫೋಟೋ ತೆಗೆಯಿರಿ",
      "upload.gallery": "🖼️ ಗ್ಯಾಲರಿಯಿಂದ",
      "upload.previewAlt": "ಆಯ್ಕೆ ಮಾಡಿದ ವರದಿಯ ಮುನ್ನೋಟ",
      "upload.dateToggle": "ದಿನಾಂಕ ಸ್ಪಷ್ಟವಾಗಿ ಮುದ್ರಿತವಾಗಿಲ್ಲವೇ?",
      "upload.dateLabel": "ವರದಿ ದಿನಾಂಕ (ಐಚ್ಛಿಕ)",
      "upload.read": "ವರದಿ ಓದಿ",
      "upload.reading": "ಓದಲಾಗುತ್ತಿದೆ...",
      "upload.readingReport": "ವರದಿಯನ್ನು ಓದಲಾಗುತ್ತಿದೆ...",
      "upload.comparing": "ಹಿಂದಿನ {n} ವರದಿಗಳೊಂದಿಗೆ ಹೋಲಿಸಲಾಗುತ್ತಿದೆ...",
      "upload.needPerson": "ಮೊದಲು ಒಬ್ಬ ವ್ಯಕ್ತಿಯನ್ನು ಸೇರಿಸಿ: \"+ ವ್ಯಕ್ತಿಯನ್ನು ಸೇರಿಸಿ\" ಒತ್ತಿ, ನಂತರ ವರದಿ ಓದಿ.",
      "upload.needPhoto": "ಮೊದಲು ವರದಿಯ ಫೋಟೋ ತೆಗೆಯಿರಿ ಅಥವಾ ಆರಿಸಿ.",
      "upload.added": "{date} ರ ವರದಿಯಿಂದ {n} ಫಲಿತಾಂಶಗಳನ್ನು ಸೇರಿಸಲಾಗಿದೆ.",
      "upload.addedNoDate": "{n} ಫಲಿತಾಂಶಗಳನ್ನು ಸೇರಿಸಲಾಗಿದೆ.",
      "upload.inProgress": "ಒಂದು ವರದಿಯನ್ನು ಓದಲಾಗುತ್ತಿದೆ. ದಯವಿಟ್ಟು ಕಾಯಿರಿ.",
      "celebrate.self": "ನಿಮ್ಮ ಇತಿಹಾಸಕ್ಕೆ ವರದಿ ಸೇರಿದೆ!",
      "celebrate.other": "{name} ಅವರ ಇತಿಹಾಸಕ್ಕೆ ವರದಿ ಸೇರಿದೆ!",
      "celebrate.title": "ವರದಿ ಸೇರಿದೆ!",
      "celebrate.text": "Baseline ಫಲಿತಾಂಶಗಳನ್ನು ಇತಿಹಾಸದಲ್ಲಿ ದಾಖಲಿಸಿದೆ.",

      "trends.aria": "ಲ್ಯಾಬ್ ಪರೀಕ್ಷೆಯ ಬದಲಾವಣೆಗಳು",
      "trends.loading": "ಆರೋಗ್ಯ ಇತಿಹಾಸ ಲೋಡ್ ಆಗುತ್ತಿದೆ...",
      "trends.emptyTitle": "ಇನ್ನೂ ಯಾವುದೇ ವರದಿ ಇಲ್ಲ",
      "trends.emptyText": "ಬದಲಾವಣೆಗಳನ್ನು ಗಮನಿಸಲು ಲ್ಯಾಬ್ ವರದಿಯ ಫೋಟೋ ತೆಗೆಯಿರಿ ಅಥವಾ ಆರಿಸಿ.",
      "range.both": "ಸಾಮಾನ್ಯ {low}–{high} {unit}",
      "range.below": "ಸಾಮಾನ್ಯ: {high} {unit} ಕ್ಕಿಂತ ಕಡಿಮೆ",
      "range.above": "ಸಾಮಾನ್ಯ: {low} {unit} ಕ್ಕಿಂತ ಹೆಚ್ಚು",
      "range.none": "ಸಾಮಾನ್ಯ ಮಿತಿ ಮುದ್ರಿತವಾಗಿಲ್ಲ",
      "card.high": "ಹೆಚ್ಚಿನ ಫಲಿತಾಂಶ",
      "card.low": "ಕಡಿಮೆ ಫಲಿತಾಂಶ",
      "card.tap": "{test} ಸಾರಾಂಶ ಕೇಳಲು ಒತ್ತಿ",
      "card.chart": "{test}: {n} ಫಲಿತಾಂಶಗಳು, ಇತ್ತೀಚಿನದು {value}",
      "dir.rising": "ಏರುತ್ತಿದೆ",
      "dir.falling": "ಇಳಿಯುತ್ತಿದೆ",
      "dir.stable": "ಸ್ಥಿರ",

      "chat.aria": "ಲ್ಯಾಬ್ ಫಲಿತಾಂಶಗಳ ಬಗ್ಗೆ ಪ್ರಶ್ನೆ ಕೇಳಿ",
      "chat.title": "ಈ ಫಲಿತಾಂಶಗಳ ಬಗ್ಗೆ ಕೇಳಿ",
      "chat.quickAria": "ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳು",
      "chat.q1": "ಯಾವುದಾದರೂ ಹದಗೆಡುತ್ತಿದೆಯೇ?",
      "chat.q2": "ವೈದ್ಯರನ್ನು ನಾನು ಏನು ಕೇಳಬೇಕು?",
      "chat.q3": "HbA1c ಅನ್ನು ಸರಳವಾಗಿ ವಿವರಿಸಿ.",
      "chat.welcome": "ಈ ಲ್ಯಾಬ್ ಪರೀಕ್ಷೆಗಳ ಬಗ್ಗೆ ಏನು ಬೇಕಾದರೂ ಕೇಳಿ.",
      "chat.label": "ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ",
      "chat.placeholder": "ನಿಮ್ಮ ಸಂಖ್ಯೆಗಳ ಬಗ್ಗೆ ಕೇಳಿ...",
      "chat.inputAria": "ನಿಮ್ಮ ಆರೋಗ್ಯ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ",
      "chat.send": "ಕಳುಹಿಸಿ",
      "chat.note": "ಉತ್ತರಗಳು ಈ ವರದಿಗಳಿಂದ ಮಾತ್ರ. Baseline ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ.",
      "chat.thinking": "ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ...",

      "person.modalTitle": "ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ",
      "person.title": "ಶೀರ್ಷಿಕೆ",
      "person.none": "(ಇಲ್ಲ)",
      "person.name": "ಪೂರ್ಣ ಹೆಸರು",
      "person.namePh": "ಉದಾ. Sunita Rao",
      "person.isMe": "ಇದು ನಾನು",
      "person.cancel": "ರದ್ದುಮಾಡಿ",
      "person.save": "ಉಳಿಸಿ",
      "person.added": "{name} ಅವರ ಪ್ರೊಫೈಲ್ ಸೇರಿಸಲಾಗಿದೆ",

      "mascot.hiLoading": "ನಮಸ್ಕಾರ {name}! ನಿಮ್ಮ ಆರೋಗ್ಯ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...",
      "mascot.begin": "ನಮಸ್ಕಾರ {name}! ಆರಂಭಿಸೋಣ: ನಿಮ್ಮನ್ನು ಅಥವಾ ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಲು \"+ ವ್ಯಕ್ತಿಯನ್ನು ಸೇರಿಸಿ\" ಒತ್ತಿ.",
      "mascot.startSelf": "ನಿಮ್ಮ ಇತಿಹಾಸ ಆರಂಭಿಸೋಣ. ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಲ್ಯಾಬ್ ವರದಿಯನ್ನು ಸೇರಿಸಿ.",
      "mascot.startOther": "{name} ಅವರ ಇತಿಹಾಸ ಆರಂಭಿಸೋಣ. ಇತ್ತೀಚಿನ ಲ್ಯಾಬ್ ವರದಿಯನ್ನು ಸೇರಿಸಿ.",
      "mascot.overdue": "ಮುಂದಿನ ಪರೀಕ್ಷೆ {date} ರಂದು ಆಗಬೇಕಿತ್ತು.",
      "mascot.outOne": "1 ಫಲಿತಾಂಶ ಸಾಮಾನ್ಯ ಮಿತಿಯ ಹೊರಗಿದೆ. ವೈದ್ಯರೊಂದಿಗೆ ಚರ್ಚಿಸುವುದು ಒಳ್ಳೆಯದು.",
      "mascot.outMany": "{n} ಫಲಿತಾಂಶಗಳು ಸಾಮಾನ್ಯ ಮಿತಿಯ ಹೊರಗಿವೆ. ವೈದ್ಯರೊಂದಿಗೆ ಚರ್ಚಿಸುವುದು ಒಳ್ಳೆಯದು.",
      "mascot.allNormal": "ಎಲ್ಲಾ ಫಲಿತಾಂಶಗಳು ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿವೆ.",
      "mascot.looking": "ವರದಿಗಳನ್ನು ನೋಡುತ್ತೇನೆ...",
      "mascot.tap1": "ನಿಮಗೆ ಬೇಕಾದಾಗ ನಾನು ಇಲ್ಲೇ ಇದ್ದೇನೆ!",
      "mascot.tap2": "ಯಾವುದಾದರೂ ಫಲಿತಾಂಶ ಕಾರ್ಡ್ ಒತ್ತಿ, ನಾನು ವಿವರಿಸುತ್ತೇನೆ.",
      "mascot.tap3": "ನಿಮಗಾಗಿ ಸಂಖ್ಯೆಗಳ ಮೇಲೆ ಕಣ್ಣಿಟ್ಟಿದ್ದೇನೆ."
    },

    hi: {
      "doc.title": "Baseline - ध्यान रखने वाला हेल्थ रिकॉर्ड",
      "doc.titleLogin": "Baseline - लॉग इन",
      "common.home": "Baseline होम",
      "common.theme": "डार्क मोड बदलें",
      "common.language": "भाषा",
      "common.mascotAlt": "कार्टून डॉक्टर पात्र",
      "common.boundary": "Baseline लैब नतीजों को समझाता है और उन पर नज़र रखता है। यह न तो रोग का निदान करता है, न इलाज की सलाह देता है। किसी भी नतीजे के बारे में डॉक्टर से बात करें।",
      "common.madeFor": "AWS स्टूडेंट हैकाथॉन के लिए बनाया गया",
      "error.generic": "कुछ गड़बड़ हो गई। फिर से कोशिश करें।",
      "error.photo": "यह फ़ोटो नहीं खुली। कोई दूसरी फ़ोटो आज़माएँ।",

      "landing.badge": "AWS हैकाथॉन",
      "landing.title": "Baseline: एक हेल्थ रिकॉर्ड जो ध्यान रखता है",
      "landing.lead": "अपने परिवार की लैब रिपोर्टों की फ़ोटो लें। Baseline हर नतीजे को याद रखता है, और जब कोई संख्या लगातार गलत दिशा में जाए, तो आपकी भाषा में बताता है।",
      "landing.cta": "Baseline खोलें →",
      "landing.whyAria": "Baseline क्यों",
      "landing.why1": "रिपोर्टें दराज़ में पड़ी रहती हैं।",
      "landing.why2": "हर एक पर बस एक नज़र डाली जाती है।",
      "landing.why3": "असली चेतावनी रिपोर्टों के बीच के बदलाव में होती है।",
      "landing.howAria": "Baseline कैसे काम करता है",
      "landing.how": "यह कैसे काम करता है",
      "landing.step1": "1. फ़ोटो लें",
      "landing.step1Text": "अपनी छपी हुई लैब रिपोर्ट की फ़ोटो कैमरे से लें।",
      "landing.step2": "2. याद रखता है",
      "landing.step2Text": "हर संख्या पढ़ता है और उसे आपकी पिछली रिपोर्टों से जोड़ता है।",
      "landing.step3": "3. ध्यान देता है",
      "landing.step3Text": "हर नतीजे को उसकी सामान्य सीमा के साथ ग्राफ़ पर दिखाता है और लगातार बढ़ती संख्याओं की ओर ध्यान दिलाता है।",
      "landing.featuresAria": "मुख्य सुविधाएँ",
      "landing.features": "परिवारों और डॉक्टरों के लिए",
      "landing.f1Text": "आपकी मातृभाषा में सारांश",
      "landing.f2": "डॉक्टर व्यू",
      "landing.f2Text": "डॉक्टर से मिलने के लिए तैयार क्लिनिकल तालिकाएँ",
      "landing.f3": "सवाल पूछें",
      "landing.f3Text": "सीधे आपकी रिपोर्टों से साफ़ जवाब",
      "landing.f4": "अगली जाँच की याद",
      "landing.f4Text": "अगली जाँच का समय होने पर हल्की-सी याद",

      "login.welcome": "फिर से स्वागत है! अपने परिवार का लैब इतिहास देखने के लिए लॉग इन करें।",
      "login.welcomeNew": "अपनी और अपने परिवार की लैब रिपोर्टें रखने के लिए खाता बनाएँ।",
      "login.tabsAria": "लॉग इन करें या खाता बनाएँ",
      "login.login": "लॉग इन",
      "login.register": "खाता बनाएँ",
      "login.username": "यूज़रनेम",
      "login.usernamePh": "हम आपको क्या कहकर बुलाएँ?",
      "login.email": "ईमेल",
      "login.password": "पासवर्ड",
      "login.passwordPh": "कम से कम 8 अक्षर",
      "login.confirm": "पासवर्ड की पुष्टि करें",
      "login.confirmPh": "फिर से लिखें",
      "login.show": "पासवर्ड दिखाएँ",
      "login.hide": "पासवर्ड छिपाएँ",
      "login.loggingIn": "लॉग इन हो रहा है...",
      "login.creating": "खाता बन रहा है...",
      "login.mismatch": "दोनों पासवर्ड मेल नहीं खाते।",
      "login.created": "{name}, आपका खाता बन गया है। नए पासवर्ड से लॉग इन करें।",

      "app.demo": "डेमो",
      "app.doctorView": "🩺 डॉक्टर व्यू",
      "app.doctorViewAria": "डॉक्टर व्यू खोलें",
      "app.signedIn": "{name} के रूप में लॉग इन",
      "app.logout": "लॉग आउट",
      "app.peopleAria": "परिवार सदस्य और भाषा",
      "app.selectPerson": "परिवार सदस्य चुनें",
      "app.loadingProfiles": "प्रोफ़ाइल लोड हो रही हैं...",
      "app.noOne": "अभी तक कोई नहीं जोड़ा गया",
      "app.myself": "मैं ({name})",
      "app.addPerson": "+ व्यक्ति जोड़ें",
      "app.addPersonAria": "नया परिवार सदस्य जोड़ें",
      "app.mascotAria": "डॉक्टर सहायक",
      "app.hello": "नमस्ते! आपके हेल्थ रिकॉर्ड लोड हो रहे हैं...",
      "app.pathAria": "इतिहास और अगली जाँच",
      "path.heading": "आपका सफ़र",
      "path.reportDate": "रिपोर्ट की तारीख",
      "path.next": "अगली जाँच",
      "path.nextTitle": "अगली जाँच की तारीख",
      "path.overdue": "बकाया",
      "path.overdueTitle": "बकाया जाँच",

      "upload.aria": "नई लैब रिपोर्ट जोड़ें",
      "upload.title": "रिपोर्ट जोड़ें",
      "upload.take": "📷 फ़ोटो लें",
      "upload.gallery": "🖼️ गैलरी से",
      "upload.previewAlt": "चुनी गई रिपोर्ट का प्रीव्यू",
      "upload.dateToggle": "तारीख साफ़ नहीं छपी?",
      "upload.dateLabel": "रिपोर्ट की तारीख (वैकल्पिक)",
      "upload.read": "रिपोर्ट पढ़ें",
      "upload.reading": "पढ़ रहे हैं...",
      "upload.readingReport": "रिपोर्ट पढ़ी जा रही है...",
      "upload.comparing": "पिछली {n} रिपोर्टों से तुलना हो रही है...",
      "upload.needPerson": "पहले एक व्यक्ति जोड़ें: \"+ व्यक्ति जोड़ें\" दबाएँ, फिर रिपोर्ट पढ़ें।",
      "upload.needPhoto": "पहले रिपोर्ट की फ़ोटो लें या चुनें।",
      "upload.added": "{date} की रिपोर्ट से {n} नतीजे जोड़े गए।",
      "upload.addedNoDate": "{n} नतीजे जोड़े गए।",
      "upload.inProgress": "एक रिपोर्ट पढ़ी जा रही है। कृपया रुकें।",
      "celebrate.self": "रिपोर्ट आपके इतिहास में जुड़ गई!",
      "celebrate.other": "रिपोर्ट {name} के इतिहास में जुड़ गई!",
      "celebrate.title": "रिपोर्ट जुड़ गई!",
      "celebrate.text": "Baseline ने नतीजे इतिहास में दर्ज कर लिए।",

      "trends.aria": "लैब जाँच के बदलाव",
      "trends.loading": "हेल्थ इतिहास लोड हो रहा है...",
      "trends.emptyTitle": "अभी तक कोई रिपोर्ट नहीं",
      "trends.emptyText": "बदलाव देखना शुरू करने के लिए लैब रिपोर्ट की फ़ोटो लें या चुनें।",
      "range.both": "सामान्य {low}–{high} {unit}",
      "range.below": "सामान्य: {high} {unit} से कम",
      "range.above": "सामान्य: {low} {unit} से ज़्यादा",
      "range.none": "सामान्य सीमा नहीं छपी",
      "card.high": "सामान्य से ज़्यादा",
      "card.low": "सामान्य से कम",
      "card.tap": "{test} का सारांश सुनने के लिए दबाएँ",
      "card.chart": "{test}: {n} नतीजे, नवीनतम {value}",
      "dir.rising": "बढ़ रहा है",
      "dir.falling": "घट रहा है",
      "dir.stable": "स्थिर",

      "chat.aria": "लैब नतीजों के बारे में सवाल पूछें",
      "chat.title": "इन नतीजों के बारे में पूछें",
      "chat.quickAria": "झटपट सवाल",
      "chat.q1": "क्या कुछ बिगड़ रहा है?",
      "chat.q2": "मुझे डॉक्टर से क्या पूछना चाहिए?",
      "chat.q3": "HbA1c को आसान शब्दों में समझाइए।",
      "chat.welcome": "इन लैब जाँचों के बारे में कुछ भी पूछिए।",
      "chat.label": "सवाल लिखें",
      "chat.placeholder": "अपनी संख्याओं के बारे में पूछें...",
      "chat.inputAria": "अपना हेल्थ सवाल लिखें",
      "chat.send": "भेजें",
      "chat.note": "जवाब सिर्फ़ इन रिपोर्टों से आते हैं। Baseline निदान नहीं करता।",
      "chat.thinking": "सोच रहा हूँ...",

      "person.modalTitle": "परिवार सदस्य जोड़ें",
      "person.title": "संबोधन",
      "person.none": "(कोई नहीं)",
      "person.name": "पूरा नाम",
      "person.namePh": "जैसे Sunita Rao",
      "person.isMe": "यह मैं हूँ",
      "person.cancel": "रद्द करें",
      "person.save": "सहेजें",
      "person.added": "{name} की प्रोफ़ाइल जोड़ी गई",

      "mascot.hiLoading": "नमस्ते {name}! आपके हेल्थ रिकॉर्ड लोड हो रहे हैं...",
      "mascot.begin": "नमस्ते {name}! चलिए शुरू करें: खुद को या परिवार के किसी सदस्य को जोड़ने के लिए \"+ व्यक्ति जोड़ें\" दबाएँ।",
      "mascot.startSelf": "चलिए आपका इतिहास शुरू करें। अपनी सबसे नई लैब रिपोर्ट जोड़ें।",
      "mascot.startOther": "चलिए {name} का इतिहास शुरू करें। सबसे नई लैब रिपोर्ट जोड़ें।",
      "mascot.overdue": "अगली जाँच {date} को होनी थी।",
      "mascot.outOne": "1 नतीजा सामान्य सीमा से बाहर है। डॉक्टर से बात करना अच्छा रहेगा।",
      "mascot.outMany": "{n} नतीजे सामान्य सीमा से बाहर हैं। डॉक्टर से बात करना अच्छा रहेगा।",
      "mascot.allNormal": "सभी नतीजे सामान्य सीमा में हैं।",
      "mascot.looking": "रिपोर्टें देख रहा हूँ...",
      "mascot.tap1": "ज़रूरत हो तो मैं यहीं हूँ!",
      "mascot.tap2": "किसी नतीजे के कार्ड को दबाइए, मैं समझाऊँगा।",
      "mascot.tap3": "आपके लिए संख्याओं पर नज़र रख रहा हूँ।"
    }
  };

  // Sentences the backend sends, translated by exact match. Anything not listed is shown as sent (English).
  const SERVER = {
    "Please log in to continue.": {
      kn: "ಮುಂದುವರಿಯಲು ಲಾಗ್ ಇನ್ ಮಾಡಿ.",
      hi: "जारी रखने के लिए लॉग इन करें।" },
    "Email or password is incorrect.": {
      kn: "ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ.",
      hi: "ईमेल या पासवर्ड गलत है।" },
    "Enter a valid email address.": {
      kn: "ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ.",
      hi: "सही ईमेल पता लिखें।" },
    "Use a password of 8 to 128 characters.": {
      kn: "8 ರಿಂದ 128 ಅಕ್ಷರಗಳ ಪಾಸ್‌ವರ್ಡ್ ಬಳಸಿ.",
      hi: "8 से 128 अक्षरों का पासवर्ड रखें।" },
    "An account with this email already exists. Log in instead.": {
      kn: "ಈ ಇಮೇಲ್‌ನ ಖಾತೆ ಈಗಾಗಲೇ ಇದೆ. ಲಾಗ್ ಇನ್ ಮಾಡಿ.",
      hi: "इस ईमेल से खाता पहले से है। लॉग इन करें।" },
    "Choose a username of 2 to 30 letters or digits.": {
      kn: "2 ರಿಂದ 30 ಅಕ್ಷರ ಅಥವಾ ಅಂಕಿಗಳ ಬಳಕೆದಾರ ಹೆಸರನ್ನು ಆರಿಸಿ.",
      hi: "2 से 30 अक्षरों या अंकों का यूज़रनेम चुनें।" },
    "Baseline can’t reach its storage or reading service right now. Try again in a minute.": {
      kn: "Baseline ಈಗ ತನ್ನ ಸೇವೆಯನ್ನು ತಲುಪಲಾಗುತ್ತಿಲ್ಲ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      hi: "Baseline अभी अपनी सेवा तक नहीं पहुँच पा रहा। एक मिनट बाद फिर कोशिश करें।" },
    "This image couldn’t be read as a lab report. Try a sharper, flatter photo.": {
      kn: "ಈ ಚಿತ್ರವನ್ನು ಲ್ಯಾಬ್ ವರದಿಯಾಗಿ ಓದಲಾಗಲಿಲ್ಲ. ಇನ್ನಷ್ಟು ಸ್ಪಷ್ಟವಾದ, ಸಮತಟ್ಟಾದ ಫೋಟೋ ತೆಗೆಯಿರಿ.",
      hi: "यह फ़ोटो लैब रिपोर्ट की तरह पढ़ी नहीं जा सकी। ज़्यादा साफ़ और सीधी फ़ोटो लें।" },
    "Couldn’t read a date on this report. Enter the report date and upload again.": {
      kn: "ಈ ವರದಿಯಲ್ಲಿ ದಿನಾಂಕ ಓದಲಾಗಲಿಲ್ಲ. ವರದಿ ದಿನಾಂಕ ನಮೂದಿಸಿ ಮತ್ತೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
      hi: "इस रिपोर्ट पर तारीख नहीं पढ़ी जा सकी। रिपोर्ट की तारीख लिखकर फिर से अपलोड करें।" },
    "No test results were found on this report. Try a sharper, flatter photo.": {
      kn: "ಈ ವರದಿಯಲ್ಲಿ ಯಾವುದೇ ಪರೀಕ್ಷಾ ಫಲಿತಾಂಶ ಸಿಗಲಿಲ್ಲ. ಇನ್ನಷ್ಟು ಸ್ಪಷ್ಟವಾದ, ಸಮತಟ್ಟಾದ ಫೋಟೋ ತೆಗೆಯಿರಿ.",
      hi: "इस रिपोर्ट में जाँच का कोई नतीजा नहीं मिला। ज़्यादा साफ़ और सीधी फ़ोटो लें।" },
    "This photo is too large. Try a smaller photo, under 4 MB.": {
      kn: "ಈ ಫೋಟೋ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. 4 MB ಗಿಂತ ಚಿಕ್ಕ ಫೋಟೋ ಬಳಸಿ.",
      hi: "यह फ़ोटो बहुत बड़ी है। 4 MB से छोटी फ़ोटो लें।" },
    "Upload a JPEG or PNG photo of the report.": {
      kn: "ವರದಿಯ JPEG ಅಥವಾ PNG ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
      hi: "रिपोर्ट की JPEG या PNG फ़ोटो अपलोड करें।" },
    "This person isn’t in Baseline yet. Add them first.": {
      kn: "ಈ ವ್ಯಕ್ತಿ ಇನ್ನೂ Baseline ನಲ್ಲಿ ಇಲ್ಲ. ಮೊದಲು ಅವರನ್ನು ಸೇರಿಸಿ.",
      hi: "यह व्यक्ति अभी Baseline में नहीं है। पहले उन्हें जोड़ें।" },
    "Choose a person from the list.": {
      kn: "ಪಟ್ಟಿಯಿಂದ ಒಬ್ಬ ವ್ಯಕ್ತಿಯನ್ನು ಆರಿಸಿ.",
      hi: "सूची से एक व्यक्ति चुनें।" },
    "A profile for yourself already exists.": {
      kn: "ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಈಗಾಗಲೇ ಇದೆ.",
      hi: "आपकी प्रोफ़ाइल पहले से मौजूद है।" },
    "Enter a name of up to 40 letters.": {
      kn: "40 ಅಕ್ಷರಗಳವರೆಗಿನ ಹೆಸರು ನಮೂದಿಸಿ.",
      hi: "40 अक्षरों तक का नाम लिखें।" },
    "Type a question of up to 500 characters.": {
      kn: "500 ಅಕ್ಷರಗಳವರೆಗಿನ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ.",
      hi: "500 अक्षरों तक का सवाल लिखें।" },
    "There are no reports for this person yet. Add a lab report first, then ask again.": {
      kn: "ಈ ವ್ಯಕ್ತಿಗೆ ಇನ್ನೂ ಯಾವುದೇ ವರದಿ ಇಲ್ಲ. ಮೊದಲು ಲ್ಯಾಬ್ ವರದಿ ಸೇರಿಸಿ, ನಂತರ ಕೇಳಿ.",
      hi: "इस व्यक्ति की अभी कोई रिपोर्ट नहीं है। पहले लैब रिपोर्ट जोड़ें, फिर पूछें।" },
    "I couldn’t answer that reliably from the reports. Please look at the result cards, or ask your doctor.": {
      kn: "ವರದಿಗಳಿಂದ ಇದಕ್ಕೆ ಖಚಿತವಾಗಿ ಉತ್ತರಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಫಲಿತಾಂಶ ಕಾರ್ಡ್‌ಗಳನ್ನು ನೋಡಿ, ಅಥವಾ ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಕೇಳಿ.",
      hi: "रिपोर्टों से इसका भरोसेमंद जवाब नहीं दे पाया। कृपया नतीजों के कार्ड देखें, या अपने डॉक्टर से पूछें।" }
  };

  let current = "en";
  try {
    const saved = localStorage.getItem("baseline_lang");
    if (LANGS.includes(saved)) current = saved;
  } catch {}

  function lang() {
    return current;
  }

  /** Text for a key in the current language (English if missing), with {placeholders} filled in. */
  function t(key, params = {}) {
    const text = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  }

  /** A sentence from the backend, translated if we know it. */
  function server(message) {
    const known = SERVER[message];
    return (known && known[current]) || message;
  }

  /** "12 Sep 2026" in the current language's month names, always with ordinary digits. */
  function formatDate(isoDate, forLang = current) {
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-").map(Number);
    if (!y || !m || !d) return isoDate;
    return new Intl.DateTimeFormat(LOCALES[forLang] || "en-IN", {
      day: "numeric", month: "short", year: "numeric", numberingSystem: "latn", timeZone: "UTC"
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  /** Fill every element that carries a data-i18n* attribute. */
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    root.querySelectorAll("[data-i18n-alt]").forEach((el) => { el.alt = t(el.dataset.i18nAlt); });
    const titleKey = document.documentElement.dataset.i18nTitle;
    if (titleKey) document.title = t(titleKey);
    document.documentElement.lang = current;
    document.querySelectorAll("[data-lang-switch]").forEach((select) => { select.value = current; });
  }

  /** Switch language everywhere and remember it; pages listen for "baseline:lang" to redraw their own text. */
  function setLang(next) {
    if (!LANGS.includes(next) || next === current) return;
    current = next;
    try { localStorage.setItem("baseline_lang", next); } catch {}
    apply();
    document.dispatchEvent(new CustomEvent("baseline:lang", { detail: next }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelectorAll("[data-lang-switch]").forEach((select) => {
      select.addEventListener("change", (e) => setLang(e.target.value));
    });
  });

  return { lang, t, server, formatDate, apply, setLang };
})();

const t = I18n.t;

if (typeof window !== "undefined") {
  window.I18n = I18n;
  window.t = t;
}
