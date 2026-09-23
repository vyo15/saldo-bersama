import { Link } from "react-router";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";

const AllocationGoalSuggestion = ({ releasedFunds, hasActiveGoal, onDismiss }) => Number(releasedFunds?.amount || 0) > 0 && hasActiveGoal ? (
  <CompactNotice tone="success" title="Dana kembali tersedia." role="status">
    <span>
      Rp {Number(releasedFunds.amount).toLocaleString("id-ID")} sudah tidak terikat ke Alokasi Dana.{" "}
      <Link to="/target" state={{ workflowSource: "allocation-release", workflowAction: "choose-goal-funding", sourceAccountId: releasedFunds.sourceAccountId || "", suggestedAmount: Number(releasedFunds.amount || 0) }} onClick={onDismiss}>Tambah ke Target</Link> bila dana itu ingin langsung diarahkan ke tujuan tabungan atau investasi.
    </span>
  </CompactNotice>
) : null;

const AllocationNoticesLayer = ({
  resource,
  budgetResource,
  recurringResource,
  commitmentResource,
  administratorMode,
  usersResource,
  legacyBudgetAttention,
  unlinkedBudgets,
  hasUnboundAllocation,
  releasedFunds,
  hasActiveGoal,
  onDismissReleasedFunds,
}) => <>
  <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
  <RefreshWarning error={budgetResource.refreshError || budgetResource.error} onRetry={budgetResource.reload} />
  <RefreshWarning error={recurringResource.refreshError || recurringResource.error} onRetry={recurringResource.reload} />
  <RefreshWarning error={commitmentResource.refreshError || commitmentResource.error} onRetry={commitmentResource.reload} />
  {administratorMode ? <RefreshWarning error={usersResource.refreshError || usersResource.error} onRetry={usersResource.reload} /> : null}
  <AllocationGoalSuggestion releasedFunds={releasedFunds} hasActiveGoal={hasActiveGoal} onDismiss={onDismissReleasedFunds} />
  {legacyBudgetAttention ? (
    <CompactNotice tone="warning" title="Kebutuhan lama belum terhubung ke Alokasi Dana." role="status">
      Buka Alokasi Dana yang sesuai, pilih Tambah kebutuhan, lalu pilih kategori yang sama untuk menghubungkannya tanpa membuat kebutuhan ganda.
    </CompactNotice>
  ) : null}
  {unlinkedBudgets.length ? (
    <CompactNotice tone="info" title={`${unlinkedBudgets.length} kebutuhan lama belum terhubung ke Alokasi Dana.`} role="status">
      Data tetap aman dan tetap dihitung seperti sebelumnya. Hubungkan bertahap dari detail Alokasi Dana dengan memilih kategori kebutuhan yang sudah ada.
    </CompactNotice>
  ) : null}
  {hasUnboundAllocation ? (
    <CompactNotice tone="warning" title="Ada Alokasi Dana lama tanpa rekening sumber." role="alert">
      Alokasi Dana tersebut tidak dapat dipakai untuk transaksi atau realokasi. Arsipkan lalu buat ulang dengan rekening sumber agar pembagian dana tetap konsisten.
    </CompactNotice>
  ) : null}
</>;

export default AllocationNoticesLayer;
