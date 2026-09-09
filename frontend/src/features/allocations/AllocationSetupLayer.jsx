import AllocationSetupContinuation from "./AllocationSetupContinuation.jsx";

const AllocationSetupLayer = ({ setupCreated, activeItems, onOpenDetail, onDismiss }) => {
  const continueSetup = () => {
    const createdItem = activeItems.find((item) => item.envelope_rule_id === setupCreated);
    if (createdItem) onOpenDetail(createdItem);
    onDismiss();
  };
  return <AllocationSetupContinuation onDismiss={onDismiss} onContinue={continueSetup} />;
};

export default AllocationSetupLayer;
