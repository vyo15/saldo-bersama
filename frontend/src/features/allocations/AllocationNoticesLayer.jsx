import { Link } from "react-router";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";

const AllocationAttentionNotice = ({ envelopeId }) => envelopeId ? (
  <CompactNotice tone="info" title="Periksa kantong yang disorot." role="status">
    Tinjau sisa jatah dan transaksi terkait sebelum menambah pengeluaran atau memindahkan dana.
  </CompactNotice>
) : null;

const AllocationGoalSuggestion = ({ releasedFunds, hasActiveGoal, onDismiss }) => releasedFunds > 0 && hasActiveGoal ? (
  <CompactNotice tone="success" title="Dana kembali tersedia." role="status">
    <span>
      Rp {releasedFunds.toLocaleString("id-ID")} sudah tidak terikat ke Kantong.{" "}
      <Link to="/target" onClick={onDismiss}>Setor ke Target</Link> bila dana itu ingin langsung diarahkan ke tujuan tabungan.
    </span>
  </CompactNotice>
) : null;

const AllocationNoticesLayer = ({
  resource,
  budgetResource,
  recurringResource,
  administratorMode,
  usersResource,
  attentionEnvelopeId,
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
  {administratorMode ? <RefreshWarning error={usersResource.refreshError || usersResource.error} onRetry={usersResource.reload} /> : null}
  <AllocationAttentionNotice envelopeId={attentionEnvelopeId} />
  <AllocationGoalSuggestion releasedFunds={releasedFunds} hasActiveGoal={hasActiveGoal} onDismiss={onDismissReleasedFunds} />
  {legacyBudgetAttention ? (
    <CompactNotice tone="warning" title="Batas lama belum terhubung ke Kantong Dana." role="status">
      Buka Kantong Dana yang sesuai, pilih Tambah batas, lalu pilih kategori yang sama untuk menghubungkannya tanpa membuat batas ganda.
    </CompactNotice>
  ) : null}
  {unlinkedBudgets.length ? (
    <CompactNotice tone="info" title={`${unlinkedBudgets.length} batas pengeluaran lama belum terhubung ke Kantong Dana.`} role="status">
      Data tetap aman dan tetap dihitung seperti sebelumnya. Hubungkan bertahap dari detail Kantong Dana dengan memilih kategori batas yang sudah ada.
    </CompactNotice>
  ) : null}
  {hasUnboundAllocation ? (
    <CompactNotice tone="warning" title="Ada Kantong lama tanpa rekening sumber." role="alert">
      Kantong tersebut tidak dapat dipakai untuk transaksi atau realokasi. Arsipkan lalu buat ulang dengan rekening sumber agar pembagian dana tetap konsisten.
    </CompactNotice>
  ) : null}
</>;

export default AllocationNoticesLayer;
