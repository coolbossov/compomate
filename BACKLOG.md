# CompoMate Product Backlog

Last updated: 2026-03-06

## Current baseline (already shipped)
- [x] Single-image compositor with subject drag placement
- [x] Reflection, fog, leg fade, and directional shadow controls
- [x] Shadow on/off, light direction/elevation, stance-aware shadow behavior
- [x] Auto light-direction estimation from backdrop
- [x] Export profiles (`Original`, `8x10`, `5x7`, `4x5`, `1x1`)
- [x] Batch queue workflow with ZIP export
- [x] fal.ai backdrop generation
- [x] Supabase project save/load endpoints

## P0: Highest-impact next work
- [ ] Composite template engine for memory mates, team composites, class composites, and yearbook layouts
- [ ] Multi-mode extraction pipeline (AI extraction + green/blue screen + manual cleanup tools)
- [ ] Auto face-crop and yearbook head-size normalization
- [ ] Batch multi-backdrop swap per subject in one run
- [ ] Advanced shadow realism controls (anchor points, retain/add shadow, spill cleanup)
- [ ] Hot-folder automation for unattended batch processing
- [ ] Batch retouch sync per subject/character profile
- [ ] Export QA checks (halo/clipping/mask quality gate before final export)

## P1: Business workflow and school/sports ops
- [ ] Job hierarchy model (district/school/class/team/athlete)
- [ ] CSV roster import and validation
- [ ] Capture tagging options (QR, barcode, facial, manual)
- [ ] Retake and missing-subject workflow with statuses
- [ ] Yearbook pose selection flow with deadlines and override rules
- [ ] Yearbook/PSPA/service-item export formats
- [ ] ID card and directory output pipeline
- [ ] School portal for approvals, corrections, and staff permissions

## P2: Commerce and fulfillment
- [ ] Parent gallery modes (private, group, public)
- [ ] Package builder with dynamic pricing and discount rules
- [ ] Live product previews (buttons/cards/memory mates)
- [ ] AdvancePay/prepay credits workflow
- [ ] Email/SMS automation (publish, reminder, deadline, abandoned cart)
- [ ] Multi-lab routing with mixed self-fulfillment
- [ ] Order hold/review checkpoint before lab submission
- [ ] Shipping matrix (drop, bulk, pickup, expedited)

## P3: Studio platform expansion
- [ ] Role-based multi-user workspace with audit log
- [ ] Contracts, quotes, invoices, questionnaires
- [ ] Booking and mini-session scheduler
- [ ] CRM segmentation and lifecycle automation
- [ ] Mobile shoot-day companion app
- [ ] Public API and webhooks for partner integrations
- [ ] Compliance/trust center (privacy/security controls)

## Technical enablers
- [ ] Introduce database schema for jobs, subjects, galleries, orders, and workflows
- [ ] Add RLS + auth model for photographer/admin/school roles
- [ ] Build job queue for large async rendering tasks
- [ ] Add observability stack (error tracking, performance metrics, tracing)
- [ ] Add comprehensive end-to-end tests for upload, compose, export, and generation flows
- [ ] Create migration strategy for future data model changes

