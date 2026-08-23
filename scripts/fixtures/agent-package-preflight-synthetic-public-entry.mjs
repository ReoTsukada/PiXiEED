export function handleSyntheticBoundary(input) {
  return {
    accepted: input?.canonical === true,
    source: "public-entrypoint",
  };
}
