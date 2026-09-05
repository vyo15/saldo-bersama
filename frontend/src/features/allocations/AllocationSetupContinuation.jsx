import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";

const AllocationSetupContinuation = ({ onDismiss, onContinue }) => <div>
  <CompactNotice tone="success" title="Alokasi Dana pertama sudah siap." role="status">
    Lanjutkan ke Target atau selesai jika belum membutuhkannya.
  </CompactNotice>
  <div className="form-actions">
    <Button type="button" onClick={onDismiss}>Selesai</Button>
    <Button type="button" variant="primary" onClick={onContinue}>Lanjut buat Target</Button>
  </div>
</div>;

export default AllocationSetupContinuation;
