(() => {
  const runtime = typeof window !== 'undefined' ? window : self;
  const buildInfo = Object.freeze({
    edition: 'dev',
    version: '0.9.0-dev.1',
    buildId: '20260715-093',
    releasedAt: '2026-07-15T00:00:00+09:00',
  });

  runtime.__PIXIEEDRAW_BUILD_INFO__ = buildInfo;
  // Legacy consumers still use these aliases. The immutable object above is
  // the only source of the running build identity.
  runtime.__PIXIEEDRAW_BUILD_ID__ = buildInfo.buildId;
  runtime.__PIXIEEDRAW_BUILD_REVISION__ = 20260715093;
})();
