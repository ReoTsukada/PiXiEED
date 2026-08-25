---
spec_id: ROADMAP-P0-001
title: Phase 0 Agent Instructions
status: EXECUTABLE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
normative_language: MUST_SHOULD_MAY
depends_on:
  - ROADMAP-001
tags:
version: 0.1.0
updated: 2026-08-06
---

# Phase 0 Agent Instructions

## OBJECTIVE

Produce evidence before implementation.

## TASKS

1. Enumerate current PiXiEEDraw features and map each to keep, migrate, replace, or retire.
2. Extract project-file fixtures from old versions without exposing private user content.
3. Build performance fixtures:
   - 64×64 small sprite;
   - 256×256 mobile project;
   - 512×512 desktop project;
   - 1,000-frame timeline;
   - sparse tile map;
   - collaborative conflict corpus.
4. Create canonical command schemas for the minimum editing loop.
5. Implement reference hash and convergence tests.
6. Inventory every current ad placement and classify:
   - retain;
   - move;
   - remove;
   - replace with house ad.
7. Model marketplace fee and royalty examples.
8. Produce ADRs for all open decisions.

## EXIT CRITERIA

Phase 1 MUST NOT start until acceptance gate G0 is satisfied.


---
