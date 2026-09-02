import ManualReminderModal from "../../reminders/ManualReminderModal.jsx";
import { GoalConfirmations, GoalCreateModal, GoalEditModal, GoalMovementModal } from "./GoalDialogs.jsx";

const GoalDialogLayer = ({ reminderTarget, onReminderClose, creation, creationAccounts, movement, lifecycle }) => <>
  <ManualReminderModal target={reminderTarget} onClose={onReminderClose} />
  <GoalCreateModal open={creation.open} close={creation.closeCreate} form={creation.form} setForm={creation.setForm} accounts={creationAccounts} createGoal={creation.createGoal} createMutation={creation.createMutation} message={creation.message} />
  <GoalEditModal editGoal={lifecycle.editGoal} setEditGoal={lifecycle.setEditGoal} editState={lifecycle.editState} saveGoal={lifecycle.saveGoal} />
  <GoalMovementModal movement={movement.movement} setMovement={movement.setMovement} movementState={movement.movementState} movementMutation={movement.movementMutation} accounts={movement.compatibleMovementAccounts} submitMovement={movement.submitMovement} />
  <GoalConfirmations reverseTarget={lifecycle.reverseTarget} reverseState={lifecycle.reverseState} setReverseTarget={lifecycle.setReverseTarget} reverseLastMovement={lifecycle.reverseLastMovement} archiveTarget={lifecycle.archiveTarget} archiveState={lifecycle.archiveState} setArchiveTarget={lifecycle.setArchiveTarget} applyGoalLifecycle={lifecycle.applyGoalLifecycle} statusTarget={lifecycle.statusTarget} statusState={lifecycle.statusState} setStatusTarget={lifecycle.setStatusTarget} applyGoalStatus={lifecycle.applyGoalStatus} />
</>;

export default GoalDialogLayer;
