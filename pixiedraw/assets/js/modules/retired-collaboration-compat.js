(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const falsePrefixes = /^(is|has|can|should|matches|needs|allows|supports)/;
  const emptyArrayNames = /(Entries|List|Members|Participants|Projects|Operations|Ops|Comments|Occupants)/;

  function createDisabledApi() {
    return new Proxy(Object.create(null), {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }
        // Collaboration is retired in the production editor, but ordinary
        // single-user timeline selection must remain available. Returning the
        // generic `can* => false` fallback here made every frame/layer cell
        // appear forbidden even when no shared project existed.
        if (property === 'canSelectSharedProjectTimelineCell') {
          return () => true;
        }
        if (
          property === 'beginGlobalLoading'
          || property === 'beginBlockingGlobalLoading'
          || property === 'beginStartupProgress'
        ) {
          return () => () => {};
        }
        return () => {
          if (falsePrefixes.test(property)) {
            return false;
          }
          if (emptyArrayNames.test(property)) {
            return [];
          }
          return undefined;
        };
      },
    });
  }

  const retiredFactories = Object.freeze({
    multiInviteUtils: 'createMultiInviteUtils',
    multiHistoryUtils: 'createMultiHistoryUtils',
    sharedProjectRecentStateUtils: 'createSharedProjectRecentStateUtils',
    sharedProjectParticipantUtils: 'createSharedProjectParticipantUtils',
    sharedProjectCommentUtils: 'createSharedProjectCommentUtils',
    sharedProjectSessionStateUtils: 'createSharedProjectSessionStateUtils',
    sharedProjectOpUtils: 'createSharedProjectOpUtils',
    sharedProjectDrawApplyUtils: 'createSharedProjectDrawApplyUtils',
    sharedProjectRecoveryReplayUtils: 'createSharedProjectRecoveryReplayUtils',
    sharedProjectLocalJournalUtils: 'createSharedProjectLocalJournalUtils',
    sharedProjectLocalOpUtils: 'createSharedProjectLocalOpUtils',
    sharedProjectRecoveryLifecycleUtils: 'createSharedProjectRecoveryLifecycleUtils',
    sharedProjectRealtimeUtils: 'createSharedProjectRealtimeUtils',
    sharedProjectWorkflowUtils: 'createSharedProjectWorkflowUtils',
    sharedProjectCreateProgressUtils: 'createSharedProjectCreateProgressUtils',
  });

  Object.entries(retiredFactories).forEach(([moduleName, factoryName]) => {
    root[moduleName] = Object.freeze({
      [factoryName]: () => createDisabledApi(),
    });
  });
})();
