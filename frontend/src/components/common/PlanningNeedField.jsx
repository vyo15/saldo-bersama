import CompactNotice from "./CompactNotice.jsx";
import InlineSelectionPicker from "./InlineSelectionPicker.jsx";
import { allocationOptionVisual } from "./selectionOptionVisuals.js";
import { formatRupiah } from "../../domain/money.js";
import { planningNeedLinkState } from "../../shared/workflows/planningBudgetLinks.js";

const STANDALONE_VALUE = "__standalone__";
const needMeta = (budget) => `${budget.envelope_name || "Alokasi Dana"} · ${formatRupiah(budget.amount || 0)} disiapkan`;

const PlanningNeedField = ({
  budgets = [], categoryId = "", accountId = "", budgetId = "", onSelect,
  standaloneLabel = "Pembayaran mandiri", resolved = true, onResolve,
}) => {
  if (!categoryId) return null;
  const { categoryCandidates, candidates, selected } = planningNeedLinkState({ budgets, categoryId, accountId, budgetId });
  if (!categoryCandidates.length) {
    return <CompactNotice className="form-grid__full" tone="info">Belum ada Kebutuhan yang cocok. Pembayaran ini akan disimpan sebagai pembayaran mandiri.</CompactNotice>;
  }
  if (selected && candidates.length <= 1) {
    return <CompactNotice className="form-grid__full" tone="success" title={`${selected.name} · ${selected.envelope_name || "Alokasi Dana"}`}>Pembayaran ini memakai dana yang sudah disiapkan pada Kebutuhan tersebut.</CompactNotice>;
  }
  if (candidates.length === 1) {
    const candidate = candidates[0];
    return <CompactNotice className="form-grid__full" tone="success" title={`${candidate.name} · ${candidate.envelope_name || "Alokasi Dana"}`}>Kebutuhan yang cocok dipilih otomatis dari rekening dan kategori ini.</CompactNotice>;
  }
  if (!candidates.length) {
    return <CompactNotice className="form-grid__full" tone="info">Tidak ada Kebutuhan yang cocok pada rekening ini. Pembayaran akan disimpan sebagai pembayaran mandiri.</CompactNotice>;
  }
  return <InlineSelectionPicker
    className="form-grid__full"
    label="Gunakan dana dari"
    required
    value={budgetId || (resolved ? STANDALONE_VALUE : "")}
    onChange={(nextValue) => {
      if (nextValue === STANDALONE_VALUE) {
        onResolve?.(true);
        onSelect?.(null);
        return;
      }
      const next = candidates.find((budget) => budget.budget_id === nextValue) || null;
      onResolve?.(Boolean(next));
      onSelect?.(next);
    }}
    placeholder="Pilih Kebutuhan atau pembayaran mandiri"
    placeholderMeta="Ada beberapa Kebutuhan yang cocok. Pilih agar sumber dana tidak ambigu."
    placeholderOption={allocationOptionVisual()}
    options={[
      { value: STANDALONE_VALUE, label: standaloneLabel, meta: "Tidak memakai dana Kebutuhan yang sudah disiapkan", ...allocationOptionVisual() },
      ...candidates.map((budget) => ({ value: budget.budget_id, label: budget.name, meta: needMeta(budget), ...allocationOptionVisual() })),
    ]}
    searchable={candidates.length > 8}
    searchPlaceholder="Cari Kebutuhan…"
    error={!resolved ? "Pilih Kebutuhan yang digunakan atau pilih Pembayaran mandiri." : ""}
  />;
};

export default PlanningNeedField;
