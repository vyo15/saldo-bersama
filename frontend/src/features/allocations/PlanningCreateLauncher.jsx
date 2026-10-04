import { useEffect, useState } from "react";
import { FiChevronRight, FiHome, FiMoreHorizontal, FiPieChart, FiRepeat, FiUsers } from "react-icons/fi";
import Modal from "../../components/common/Modal.jsx";
import { BalanceIcon, MoneyOutIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { allocationClass } from "./allocationStyles.js";

const COMMITMENT_TYPES = Object.freeze([
  { value: "mortgage", label: "KPR", description: "Kredit rumah", icon: FiHome },
  { value: "installment", label: "Cicilan", description: "Kendaraan atau barang", icon: BalanceIcon },
  { value: "loan", label: "Pinjaman", description: "Bank, koperasi, atau pribadi", icon: MoneyOutIcon },
  { value: "arisan", label: "Arisan", description: "Setoran berkala sampai selesai", icon: FiUsers },
  { value: "other", label: "Lainnya", description: "Kewajiban berkala lainnya", icon: FiMoreHorizontal },
]);

const LauncherOption = ({ icon: Icon, title, description, onClick }) => (
  <button type="button" className={allocationClass("planning-create-option")} onClick={onClick}>
    <span className={allocationClass("planning-create-option__icon")}><Icon aria-hidden="true" /></span>
    <span className={allocationClass("planning-create-option__copy")}><strong>{title}</strong><small>{description}</small></span>
    <FiChevronRight className={allocationClass("planning-create-option__arrow")} aria-hidden="true" />
  </button>
);

const PlanningCreateLauncher = ({ open, onClose, onCreateAllocation, onCreateRecurring, onCreateCommitment }) => {
  const [view, setView] = useState("root");
  useEffect(() => { if (open) setView("root"); }, [open]);
  const launch = (callback, value) => { onClose?.(); callback?.(value); };
  const choosingCommitment = view === "commitment";
  return <Modal open={open} onClose={onClose} size="sm" title={choosingCommitment ? "Pilih kewajiban" : "Tambah di Atur Dana"} description={choosingCommitment ? "Pilih jenis yang ingin dicatat." : "Pilih tujuan. Sistem akan membuka flow yang tepat."} headerBackAction={choosingCommitment ? { label: "Kembali", onClick: () => setView("root") } : null}>
    <div className={allocationClass("planning-create-list")}>
      {choosingCommitment ? COMMITMENT_TYPES.map((item) => <LauncherOption key={item.value} icon={item.icon} title={item.label} description={item.description} onClick={() => launch(onCreateCommitment, item.value)} />) : <>
        <LauncherOption icon={FiPieChart} title="Buat Alokasi" description="Pisahkan uang untuk tujuan baru" onClick={() => launch(onCreateAllocation)} />
        <LauncherOption icon={FiHome} title="Kewajiban" description="KPR, cicilan, pinjaman, atau Arisan" onClick={() => setView("commitment")} />
        <LauncherOption icon={FiRepeat} title="Jadwal rutin" description="Pembayaran pengeluaran yang berulang" onClick={() => launch(onCreateRecurring)} />
      </>}
    </div>
  </Modal>;
};

export default PlanningCreateLauncher;
