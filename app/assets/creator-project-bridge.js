(function () {
  "use strict";

  var store = window.PiXiEEDCreatorProjectStore;
  if (!store) return;

  function modeKind() {
    var mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "AUDIO" ? "audio" : mode === "GAME" ? "game" : "draw";
  }

  // This is a thin Creator App identity/manifest handoff. It is not the
  // PiXYNC content-sync authority and it does not connect to the external
  // PiXiEED Bridge product.
  window.addEventListener("pixiedraw2:project-changed", function (event) {
    var detail = event.detail;
    if (!detail || typeof detail !== "object") return;
    // OPEN is a read/recovery handoff. It must not resurrect an unknown
    // deep-link in the Creator App store; only an explicit Draw2 NEW event
    // may create the shared Project record.
    if (detail.kind !== "NEW") return;
    if (typeof store.ensure === "function") {
      store.ensure({
        projectId: detail.projectId,
        name: detail.name,
        kind: modeKind()
      });
    }
  });

  window.addEventListener("pixiedraw2:workspace-manifest-changed", function (event) {
    if (typeof store.syncWorkspaceManifest !== "function") return;
    store.syncWorkspaceManifest(event.detail);
  });
}());
