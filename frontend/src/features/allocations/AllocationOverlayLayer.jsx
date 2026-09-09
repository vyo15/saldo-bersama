import { lazy, Suspense } from "react";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";

const AllocationDialogLayer = lazy(() => import("./AllocationDialogLayer.jsx"));
const AllocationFundingFlow = lazy(() => import("./AllocationFundingFlow.jsx"));
const AllocationSecondaryLayer = lazy(() => import("./AllocationSecondaryLayer.jsx"));
const ManualReminderModal = lazy(() => import("../reminders/ManualReminderModal.jsx"));

const AllocationOverlayLayer = ({
  dialogsOpen,
  dialogProps,
  showSecondaryLayer,
  secondaryProps,
  fundingIntent,
  fundingProps,
  reminderTarget,
  onCloseReminder,
}) => (
  <>
    {dialogsOpen ? (
      <Suspense fallback={<LazyActionFallback label="Menyiapkan form Alokasi Dana..." />}>
        <AllocationDialogLayer {...dialogProps} />
      </Suspense>
    ) : null}
    {showSecondaryLayer ? (
      <Suspense fallback={<LazyActionFallback label="Menyiapkan aktivitas Alokasi Dana..." />}>
        <AllocationSecondaryLayer {...secondaryProps} />
      </Suspense>
    ) : null}
    {fundingIntent ? (
      <Suspense fallback={<LazyActionFallback label="Menyiapkan pembagian dana..." />}>
        <AllocationFundingFlow open {...fundingProps} />
      </Suspense>
    ) : null}
    {reminderTarget ? (
      <Suspense fallback={<LazyActionFallback label="Menyiapkan pengingat..." />}>
        <ManualReminderModal target={reminderTarget} onClose={onCloseReminder} />
      </Suspense>
    ) : null}
  </>
);

export default AllocationOverlayLayer;
