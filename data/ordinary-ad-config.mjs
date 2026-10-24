/** Operator-confirmed Display units. Context/geometry gates still fail closed. */
const client = 'ca-pub-9801602250480253';
export const ordinaryAdConfig = Object.freeze({
  feed: Object.freeze({
    enabled: true,
    // Public-feed eligibility is separate from approval of this Display unit.
    trustedContentEligible: true,
    unit: Object.freeze({ client, slot: '4842737836', format: 'display',
      placement: 'inline', size: 'responsive', verifiedActive: true }),
  }),
  informationGutter: Object.freeze({
    enabled: true,
    unit: Object.freeze({ client, slot: '8825932060', format: 'display',
      placement: 'gutter', size: Object.freeze({ width: 300, height: 600 }), verifiedActive: true }),
  }),
});
