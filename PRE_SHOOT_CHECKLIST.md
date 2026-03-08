# CompoMate Pre-Shoot Checklist

> Run this checklist before every live volume session.
> Production URL: `https://composite.sapicture.day`

## 0) Infrastructure

- [ ] `npm run test:diag` returns diagnostics JSON (status should be `ok` in production)
- [ ] Latest `main` deployment is live on Vercel
- [ ] Supabase project `dlaaibvipvevtwolpdua` is active
- [ ] R2 bucket `compomate-uploads` is accessible

## 1) Happy Path (20+ subjects)

- [ ] Import 20+ subject files
- [ ] Set/attach backdrop
- [ ] Set job name
- [ ] Enter names for at least 5 subjects
- [ ] Export batch and verify all succeed
- [ ] Verify filename format: `[Job]-[First]-[Last]-[0001].png`
- [ ] Open sample output and verify 4000x5000 @ 300 DPI
- [ ] Confirm green done checkmarks after export

## 2) CSV Roster Workflow

- [ ] Import CSV with `first_name,last_name`
- [ ] Verify sequential matching row-to-file order
- [ ] Verify accented names are handled correctly
- [ ] Verify empty rows do not crash import
- [ ] Verify trailing commas do not crash import
- [ ] Verify mismatch counts (extra rows/files) are handled gracefully

## 3) Persistence

- [ ] Configure session, close tab, reopen app
- [ ] Verify local state restores (backdrop, names, job name, composition settings)
- [ ] Save a project and reload it successfully

## 4) Volume and Reliability

- [ ] Run 100-subject stress export
- [ ] Confirm no timeouts in UI/logs
- [ ] Confirm output count matches expected count
- [ ] Confirm no memory-related failures in runtime logs

## 5) Workflow Edge Cases

- [ ] Absent-subject flow works (remove subset, export remaining only)
- [ ] Lock Settings prevents auto-placement when enabled
- [ ] Export counter behavior is correct when job name changes

## 6) AI Backdrop (if enabled)

- [ ] `FAL_KEY` is set in environment
- [ ] AI backdrop generation completes within expected time
- [ ] Generated backdrop exports correctly in at least one sample

## 7) Recovery

- [ ] Simulate temporary network interruption during export
- [ ] Verify app recovers without crash and can retry successfully

## Sign-off

| Check Area | Pass | Notes |
| --- | --- | --- |
| Infrastructure | [ ] | |
| Happy Path | [ ] | |
| CSV Workflow | [ ] | |
| Persistence | [ ] | |
| Volume / Reliability | [ ] | |
| Edge Cases | [ ] | |
| AI Backdrop | [ ] | |
| Recovery | [ ] | |

Validated by: ____________________

Date: ____________________
