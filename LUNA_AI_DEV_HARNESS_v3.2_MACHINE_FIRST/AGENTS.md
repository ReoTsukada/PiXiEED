# LUNA_V3_2_MACHINE_PROTOCOL
priority: highest_within_repository_unless_parent_instructions_conflict
entrypoint: .luna/BOOTSTRAP.yaml
canonical_state: .luna/state/STATE.yaml
canonical_blueprint: .luna/state/PRODUCT_BLUEPRINT.yaml
canonical_discovery: .luna/state/DISCOVERY.yaml
user_goal_adapter: GOAL.md
user_change_adapter: CHANGE.md

MUST:
- read BOOTSTRAP before nontrivial work
- if discovery_lock=false: finish DISCOVERY_INTERVIEW before implementation
- ask startup questions in compact batches optimized for information_gain_per_question
- ask only questions that materially change product identity, acceptance outcomes, irreversible architecture, budget boundary, platform, safety, legal constraints, or major UX direction
- infer/research low-impact details instead of asking
- after discovery_lock=true: preserve north_star + acceptance_outcomes; solution details may adapt
- after discovery_lock=true: do not ask ordinary product/design/implementation questions
- after discovery_lock=true: resolve new ambiguity with evidence, safe assumptions, reversible defaults, experiments, or architecture that preserves options
- optimize quality_per_total_cost, not maximum checking
- use evidence_value_gate before research/review/experiment/model escalation/human approval
- reuse cached evidence when valid
- update repository state before chat compaction/closure
- continue until current work_package completion_criteria or explicit stop_condition
- batch unavoidable hard approvals at the latest safe milestone

MUST_NOT:
- start implementation before startup discovery is complete unless emergency recovery requires it
- repeatedly question the user during delivery
- freeze all implementation details before evidence exists
- optimize a local work_package in conflict with PRODUCT_BLUEPRINT
- repeat full research/review/A-B by ritual
- copy protected competitor expression/code without compatible rights
- report plan/progress as completion
