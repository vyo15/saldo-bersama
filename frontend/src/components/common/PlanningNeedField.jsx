import CompactNotice from "./CompactNotice.jsx";
import InlineSelectionPicker from "./InlineSelectionPicker.jsx";
import { allocationOptionVisual } from "./selectionOptionVisuals.js";
import { formatRupiah } from "../../domain/money.js";
import { planningNeedLinkState } from "../../shared/workflows/planningBudgetLinks.js";

const needMeta = (budget) => `${budget.envelope_name || "Alokasi Dana"} · ${formatRupiah(budget.amount || 0)} disiapkan`;

const PlanningNeedField = ({ budgets = [], categoryId = "", accountId = "", budgetId = "", onSelect, standaloneLabel = "Pembayaran mandiri" }) => {
  if (!categoryId) return null;
  const { categoryCandidates, candidates, selected } = planningNeedLinkState({ budgets, categoryId, accountId, budgetId });
  if (!categoryCandidates.length) {
    return <CompactNotice className="form-grid__full" tone="info">Belum ada Kebutuhan yang cocok. Tetap dapat disimpan sebagai pembayaran mandiri.</CompactNotice>;
  }
  if (selected && candidates.length <= 1) {
    return <CompactNotice className="form-grid__full" tone="success" title={`${selected.name} · ${selected.envelope_name || "Alokasi Dana"}`}>Pembayaran ini memakai dana yang sudah disiapkan pada Kebutuhan tersebut.</CompactNotice>;
  }
  if (candidates.length === 1) {
    const candidate = candidates[0];
    return <CompactNotice className="form-grid__full" tone="success" title={`${candidate.name} · ${candidate.envelope_name || "Alokasi Dana"}`}>Kebutuhan yang cocok dipilih otomatis dari rekening dan kategori ini.</CompactNotice>;
  }
  if (!candidates.length) {
    return <CompactNotice className="form-grid__full" tone="info">Tidak ada Kebutuhan yang cocok pada rekening ini. Pilih rekening lain atau simpan sebagai pembayaran mandiri.</CompactNotice>;
  }
  return <InlineSelectionPicker
    className="form-grid__full"
    label="Gunakan dana dari"
    value={budgetId}
    onChange={(nextBudgetId) => {
      const next = candidates.find((budget) => budget.budget_id === nextBudgetId) || null;
      onSelect?.(next);
    }}
    placeholder="Pilih Kebutuhan"
    placeholderMeta="Pilih bila beberapa Kebutuhan memakai kategori yang sama"
    placeholderOption={allocationOptionVisual()}
    options={[
      { value: "", label: standaloneLabel, meta: "Tidak memakai dana Kebutuhan yang sudah disiapkan", ...allocationOptionVisual() },
      ...candidates.map((budget) => ({ value: budget.budget_id, label: budget.name, meta: needMeta(budget), ...allocationOptionVisual() })),
    ]}
    searchable={candidates.length > 8}
    searchPlaceholder="Cari Kebutuhan…"
  />;
};

export default PlanningNeedField;
