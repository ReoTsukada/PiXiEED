---
spec_id: PERF-MEMORY-RASTER-001
title: Draw2 Memory and Canonical Raster Model
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Memory and Raster Model

## Canonical raster

Indexed Palette is authoritative: transparent is palette index `0`, palette entries are
`1..255`, and canonical pixels are a `Uint8Array` at one byte per pixel. RGBA expansion is
allowed for display/GPU upload only and is not the normal stored Project format.

## Tiles and Copy-on-Write

Sparse or large projects may use immutable 32×32 or 64×64 Tiles. Both sizes must be measured
on the same Fixture, Device, Browser, warm/cold condition, and build before selection. Frame or
Cel duplication shares immutable raster/Tiles; an edit splits only affected Tiles. Full raster
copy is not the default.

## Measured memory components

Results record canonical raster bytes, decoded Tile bytes, composite/preview cache bytes, Undo
bytes, Worker transfer bytes, COW shared bytes, COW split count, active-frame bytes,
inactive/cold Tile bytes, and measurable OPFS cache bytes. Safe eviction is ordered from
disposable preview cache, thumbnails, inactive composites, then decoded persisted cold Tiles.
Unjournaled mutation is never evicted.

## Storage and durability

Memory is transient active state; IndexedDB stores Journal/index/queue metadata; OPFS stores
large local Tiles/checkpoints/cache; Database stores confirmed authority; Object Storage stores
immutable Blobs/packages. Autosave uses Command Journal plus dirty regions/Tiles and periodic
verified Checkpoints. It never serializes a full PXD on every stroke, stores Base64 as a routine
autosave, or writes an unchanged frame.
