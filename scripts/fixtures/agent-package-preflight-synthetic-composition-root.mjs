const serverOwnedResolver = Object.freeze({
  resourceId: "synthetic-resource-1",
  tenantId: "synthetic-tenant-1",
});

function composeServerOwnedSyntheticHandler() {
  return (input) => ({
    accepted: input?.source === "server" &&
      input.resourceId === serverOwnedResolver.resourceId,
  });
}

void composeServerOwnedSyntheticHandler;
