---
spec_id: ROADMAP-TEST-001
title: Cross-System Test Matrix
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
normative_language: MUST_SHOULD_MAY
depends_on:
  - ROADMAP-GATE-001
tags:
version: 0.1.0
updated: 2026-08-06
---

# Cross-System Test Matrix

| Domain | Required test classes |
|---|---|
| Command | unit, property, malformed intent, atomic rollback |
| Raster | dense/sparse equivalence, copy-on-write, memory pressure |
| Storage | crash, partial write, checksum, migration, quota |
| PiXiSYNC | convergence, conflict, duplicate, reorder, reconnect, permissions |
| Build | cache correctness, deterministic output, adapter validation |
| Extension | capability denial, timeout, memory limit, crash isolation |
| Ads | consent, layout, interaction block, test inventory, desktop exclusion |
| Market | fee snapshot, webhook replay, refund, dispute, royalty sum |
| Privacy | private default, publish confirmation, dependency disclosure |
| UGC | policy classification, ad eligibility separation, appeal |
| UI | keyboard, touch, stylus, screen reader, reduced motion |
| Performance | cold/warm, sustained session, low-memory device |


---
