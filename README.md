# PlaceFlow – Automated Campus Placement Engine
## Run (Windows, VS Code terminal)
    npm install
    copy .env.example .env
    npm start
Open http://localhost:3000 . Reset data: `npm run reset`.
Emails: with empty SMTP_* a free Ethereal test inbox is created; each sent email shows a "preview" link (no real mail leaves your PC).
## Demo script
1. Login admin@campus.test / admin123 -> see stats, audit log (seed jobs are labelled sample).
2. Click "Run job discovery": new jobs arrive; duplicate skipped, expired stored but not mailed; student + recruiter emails fire automatically (watch log/emails).
3. Login recruiter@acme.test / recruit123, publish a vacancy -> shortlist email auto-sent (only consent=true students).
4. Login meena@example.test / student123: see matches, explanations, missing skills; untick "share" or "alerts" -> save; publish another job and note she is excluded.
5. Admin: Pause -> add job -> nothing sent (logged). Resume.
6. Duplicate prevention: re-run discovery; no repeat emails (key = student+job). Unsubscribe link in each email.
## Matching
Hard eligibility (CGPA, branch, batch) first; then score = 60% skill coverage + 20% interest + 10% location + 10% CGPA margin. Name, gender, college are never used. Threshold 50%.
## Triggers
job added -> `job.created` event; profile saved -> `student.updated` event; node-cron every 5 min re-runs discovery + retries failed emails.
