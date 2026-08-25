import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";

const equalPercentageRows = (members) => {
  const base = Math.floor(100 / members.length);
  let remainder = 100 - (base * members.length);
  return members.map((item) => ({ user_id: item.user_id, percentage: base + (remainder-- > 0 ? 1 : 0) }));
};

const CostShareField = ({ visible, form, members, setForm, onChange, errors = {} }) => {
  if (!visible || members.length < 2) return null;
  const options = [
    { value: "unspecified", label: "Belum ditentukan", description: "Tidak masuk laporan pembagian" },
    { value: "equal", label: members.length === 2 ? "50 : 50" : "Bagi rata", description: "Beban dibagi merata" },
    { value: "percentage", label: "Persentase", description: "Atur porsi masing-masing" },
  ];
  const selectMode = (mode) => {
    onChange?.();
    setForm((current) => ({
    ...current,
    cost_share_mode: mode,
    cost_share_percentages: mode === "percentage"
      ? (current.cost_share_percentages?.length === members.length ? current.cost_share_percentages : equalPercentageRows(members))
      : [],
    }));
  };
  const updatePercentage = (userId, value) => {
    onChange?.();
    setForm((current) => ({
    ...current,
    cost_share_percentages: members.map((member) => ({
      user_id: member.user_id,
      percentage: member.user_id === userId ? Number(value) : Number(current.cost_share_percentages?.find((item) => item.user_id === member.user_id)?.percentage || 0),
    })),
    }));
  };
  const total = (form.cost_share_percentages || []).reduce((sum, item) => sum + Number(item.percentage || 0), 0);
  return <div className="form-grid__full">
    <VisualChoiceGroup legend="Pembagian beban biaya" name="cost-share-mode" value={form.cost_share_mode} onChange={selectMode} options={options} columns={3} compact wrapLabels />
    {form.cost_share_mode === "percentage" ? <div className="form-grid">{members.map((member) => <label className="field" key={member.user_id}><span>{member.is_current ? "Saya" : member.name || "Pengguna"} (%)</span><input type="number" min="0" max="100" step="1" value={form.cost_share_percentages?.find((item) => item.user_id === member.user_id)?.percentage ?? ""} onChange={(event) => updatePercentage(member.user_id, event.target.value)} aria-invalid={Boolean(errors.cost_share_percentages)} /></label>)}<small className={errors.cost_share_percentages ? "field__error form-grid__full" : "form-grid__full"}>Total {total}% · pembagian ini hanya untuk analitik dan tidak mengubah saldo.</small></div> : <small>Pembagian beban hanya untuk analitik. Pencatat transaksi tetap tercatat terpisah.</small>}
  </div>;
};

export default CostShareField;
