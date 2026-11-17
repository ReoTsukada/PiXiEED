import { getVisiblePixelArtCases } from './pixel-art-cases.mjs';

export const PIXEL_ART_CASE_INDEX = Object.freeze(getVisiblePixelArtCases().map((item) => Object.freeze({
  id: item.id,
  family: item.family,
  width: item.width,
  height: item.height,
  style: item.style,
  decision: item.internalDecision,
  internalDecision: item.internalDecision,
  userAcceptance: item.userAcceptance,
  techniqueIds: Object.freeze([...(item.techniqueIds ?? [])])
})));
