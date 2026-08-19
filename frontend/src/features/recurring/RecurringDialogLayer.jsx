import { CreateRuleModal, EditRuleModal, PaymentModal, RecurringConfirmations } from "./RecurringDialogs.jsx";

const RecurringDialogLayer = ({ rules, payments, recovery, categories, editCategories, accounts, paymentAccounts, paymentEnvelopes, envelopeStatus, budgetSuggestions, members }) => {
  const confirmations = {
    archiveRuleTarget: rules.archiveRuleTarget,
    setArchiveRuleTarget: rules.setArchiveRuleTarget,
    editState: rules.editState,
    applyRuleLifecycle: rules.applyRuleLifecycle,
    skipTarget: recovery.skipTarget,
    setSkipTarget: recovery.setSkipTarget,
    skipMutation: recovery.skipMutation,
    skipError: recovery.skipError,
    skipOccurrence: recovery.skipOccurrence,
    restoreOccurrenceTarget: recovery.restoreOccurrenceTarget,
    setRestoreOccurrenceTarget: recovery.setRestoreOccurrenceTarget,
    restoreOccurrenceMutation: recovery.restoreOccurrenceMutation,
    restoreOccurrenceError: recovery.restoreOccurrenceError,
    restoreSkippedOccurrence: recovery.restoreSkippedOccurrence,
    reverseTarget: payments.reverseTarget,
    setReverseTarget: payments.setReverseTarget,
    reverseState: payments.reverseState,
    reversePayment: payments.reversePayment,
  };

  return (
    <>
      <CreateRuleModal open={rules.createOpen} close={rules.closeCreate} form={rules.form} setForm={rules.setForm} categories={categories} accounts={accounts} createRule={rules.createRule} createMutation={rules.createMutation} message={rules.message} budgetSuggestions={budgetSuggestions} />
      <PaymentModal payment={payments.payment} setPayment={payments.setPayment} paymentState={payments.paymentState} paymentMutation={payments.paymentMutation} paymentAccounts={paymentAccounts} paymentEnvelopes={paymentEnvelopes} envelopeStatus={envelopeStatus} members={members} completeOccurrence={payments.completeOccurrence} />
      <EditRuleModal editRule={rules.editRule} setEditRule={rules.setEditRule} editState={rules.editState} saveRule={rules.saveRule} editCategories={editCategories} accounts={accounts} budgetSuggestions={budgetSuggestions} />
      <RecurringConfirmations {...confirmations} />
    </>
  );
};

export default RecurringDialogLayer;
