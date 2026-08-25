---
spec_id: IMPL-STACK-001
title: Recommended Technical Stack
status: BASELINE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
normative_language: MUST_SHOULD_MAY
depends_on:
  - ARCH-PLATFORM-001
tags:
version: 0.1.0
updated: 2026-08-06
---

# Recommended Technical Stack

## FRONTEND

- TypeScript strict mode
- Web Components or a lightweight component framework selected by benchmark
- CSS layers, design tokens, container queries
- Dedicated workers
- AudioWorklet
- Canvas 2D/WebGL fallback and optional WebGPU
- OPFS and IndexedDB

## CORE

- TypeScript reference implementation first
- Rust/Wasm modules for deterministic heavy operations after profiling
- schema-first canonical operations
- content-addressed immutable blobs
- no runtime dependence on DOM for core logic

## BACKEND

- PostgreSQL
- object storage
- Realtime/WebSocket delivery
- stateless validation/RPC services
- queue workers for build, moderation, and package scanning
- Stripe Connect adapter
- ad network adapters separated from application core

## OBSERVABILITY

- structured logs;
- trace IDs from command through sync/build;
- performance marks;
- crash reports without creative content by default;
- ad and marketplace metrics in separate datasets.

