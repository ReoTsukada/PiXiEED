(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectSheetTransactionUtils({ collectionUtils = null } = {}) {
    function createTransactionSnapshot({ openProjectTabs = [], activeOpenProjectTabId = '' } = {}) {
      return {
        tabs: Array.isArray(openProjectTabs) ? openProjectTabs.slice() : [],
        activeOpenProjectTabId: activeOpenProjectTabId || '',
      };
    }

    function validateCandidates(candidates, { existingSheetIds = [] } = {}) {
      if (!Array.isArray(candidates) || !candidates.length) {
        return { valid: false, code: 'ERR_SHEET_CANDIDATES_EMPTY' };
      }
      const ids = new Set(existingSheetIds.filter(Boolean));
      for (const candidate of candidates) {
        const result = collectionUtils?.validateSheetCandidate?.(candidate);
        if (!result?.valid) return result || { valid: false, code: 'ERR_SHEET_CANDIDATE_INVALID' };
        if (ids.has(candidate.id)) return { valid: false, code: 'ERR_SHEET_ID_DUPLICATE', id: candidate.id };
        ids.add(candidate.id);
      }
      return { valid: true, count: candidates.length };
    }

    function rollbackSheetCandidate(transaction, { openProjectTabs = [], setActiveOpenProjectTabId = null } = {}) {
      if (!transaction || !Array.isArray(transaction.tabs) || !Array.isArray(openProjectTabs)) return false;
      openProjectTabs.splice(0, openProjectTabs.length, ...transaction.tabs);
      setActiveOpenProjectTabId?.(transaction.activeOpenProjectTabId);
      return true;
    }

    return Object.freeze({ createTransactionSnapshot, validateCandidates, rollbackSheetCandidate });
  }

  root.projectSheetTransactionUtils = Object.freeze({ createProjectSheetTransactionUtils });
})();
