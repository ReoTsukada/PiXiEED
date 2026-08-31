import type {
  CreationGuideStep,
  IconAction,
  ShortcutContext,
} from "./contracts.ts";

export function validateIconAction(action: IconAction): readonly string[] {
  const issues: string[] = [];
  if (!action.id || !action.icon) issues.push("ICON_ACTION_ID_OR_ICON_MISSING");
  if (!action.accessibleName.trim()) issues.push("ACCESSIBLE_NAME_MISSING");
  if (!action.tooltip.trim()) issues.push("TOOLTIP_MISSING");
  if (!action.helpId.trim()) issues.push("HELP_ID_MISSING");
  if (action.highRisk && !action.visibleLabel?.trim()) {
    issues.push("HIGH_RISK_ICON_ONLY");
  }
  if (action.disabled && !action.disabledReason?.trim()) {
    issues.push("DISABLED_REASON_MISSING");
  }
  return issues;
}

export function validateCreationGuide(
  steps: readonly CreationGuideStep[],
  actions: ReadonlyMap<string, IconAction>,
): readonly string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) issues.push(`DUPLICATE_GUIDE_STEP:${step.id}`);
    seen.add(step.id);
    if (!actions.has(step.actionId)) {
      issues.push(`GUIDE_ACTION_MISSING:${step.actionId}`);
    }
    if (!step.title.trim() || !step.hint.trim()) {
      issues.push(`GUIDE_COPY_MISSING:${step.id}`);
    }
  }
  return issues;
}

export function resolveShortcutAction(
  action: IconAction,
  context: ShortcutContext,
): { readonly commandId: string; readonly prevented: true } | undefined {
  if (
    !action.shortcut || context.inputEditing || context.modalOpen ||
    context.sheetOpen || context.imeComposing || context.disabled
  ) return undefined;
  return { commandId: action.id, prevented: true };
}
