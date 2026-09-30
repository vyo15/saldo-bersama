import { FiArrowRight, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";

export const AllocationCreateFooter = ({ step, busy, retryOnly, guard, canContinue, submitLabel, setStep }) => {
  if (step === 1) {
    return <>
      <Button type="button" disabled={busy || retryOnly} onClick={guard.discardAndClose}>Batal</Button>
      <Button variant="primary" icon={FiArrowRight} type="submit" form="create-envelope-basics-form" disabled={!canContinue || busy || retryOnly}>Lanjutkan</Button>
    </>;
  }
  return <>
    <Button type="button" disabled={busy || retryOnly} onClick={() => setStep(1)}>Kembali</Button>
    <Button variant="primary" icon={FiPlus} type="submit" form="create-envelope-form" loading={busy}>{retryOnly ? "Coba lagi data yang sama" : submitLabel}</Button>
  </>;
};
