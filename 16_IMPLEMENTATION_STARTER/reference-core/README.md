# PiXiEED Reference Core

This directory contains executable **reference code**, not a claim that the production repository has
already been implemented.

It provides a small, dependency-free TypeScript baseline for:

- command envelope validation;
- atomic copy-on-write command execution;
- deterministic canonical operation IDs;
- a raster `setPixel` command;
- inverse operation creation;
- checksummed journal chaining;
- checkpoint hashing and validation;
- failure-path tests.

## Run

```bash
cd 16_IMPLEMENTATION_STARTER/reference-core
npm test
npm run benchmark:tiles
```

A TypeScript compiler must be available. The pack intentionally does not install or modify the main
repository's dependencies.

## Integration rule

Codex must first inspect the real PiXiEED repository.

Then it may:

1. reuse these contracts where compatible;
2. adapt names and package boundaries to existing conventions;
3. add migrations and compatibility adapters;
4. preserve the tests as conformance cases;
5. reject a reference choice through an ADR when repository evidence or benchmarks justify it.

Do not copy this implementation over a more complete existing implementation without comparison.

## Deliberate limitations

- memory journal only;
- no IndexedDB/OPFS implementation;
- one raster command;
- no PiXiSYNC transport;
- no structural commands;
- no database schema;
- no UI;
- no production security review.

These limits make the reference small enough to understand and test before production integration.
