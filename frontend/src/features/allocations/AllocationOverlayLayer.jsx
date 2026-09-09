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
      <Suspense fallback={<LazyActionFallback surface="modal" title="Alokasi Dana" label="Menyiapkan form Alokasi Dana..." />}>
        <AllocationDialogLayer {...dialogProps} />
      </Suspense>
    ) : null}
    {showSecondaryLayer ? (
      <Suspense fallback={<LazyActionFallback surface="modal" title="Alokasi Dana" label="Menyiapkan aktivitas Alokasi Dana..." />}>
        <AllocationSecondaryLayer {...secondaryProps} />
      </Suspense>
    ) : null}
    {fundingIntent ? (
      <Suspense fallback={<LazyActionFallback surface="modal" title="Bagi dana tersedia" label="Menyiapkan pembagian dana..." />}>
        <AllocationFundingFlow open {...fundingProps} />
      </Suspense>
    ) : null}
    {reminderTarget ? (
      <Suspense fallback={<LazyActionFallback surface="modal" title="Pengingat manual" label="Menyiapkan pengingat..." />}>
        <ManualReminderModal target={reminderTarget} onClose={onCloseReminder} />
      </Suspense>
    ) : null}
  </>
);

export default AllocationOverlayLayer;
