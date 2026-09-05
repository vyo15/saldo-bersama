import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";

const AllocationSetupContinuation = ({ onDismiss, onContinue }) => <div>
  <CompactNotice tone="success" title="Alokasi Dana sudah siap." role="status">Tambahkan Kebutuhan dari detail Alokasi jika ingin merinci rencana. Target tetap opsional untuk dana yang masih dikumpulkan.</CompactNotice>
  <div className="form-actions">
    <Button type="button" onClick={onDismiss}>Selesai</Button>
    {onContinue ? <Button type="button" variant="primary" onClick={onContinue}>Buka detail Alokasi</Button> : null}
  </div>
</div>;

export default AllocationSetupContinuation;
