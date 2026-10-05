import { useEffect, useMemo, useState } from "react";
import { FiChevronRight, FiLayers, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { accountOptionVisual, allocationOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { allocationAssigneeLabel } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";
import { allocationAvailableBalance, allocationFundingImpact, allocationTargetsForAccount, fundingAccountsForItems, initialAllocationFundingForm } from "./allocationFundingModel.js";

const initialForm = () => ({ sourceAccountId: "", envelopePeriodId: "", amount: "", reason: "" });

const FundingLockedContext = ({ selectedAccount, target }) => <>
  <div className={allocationClass("allocation-funding-lock form-grid__full")}>
    <span>Dari rekening</span>
    <strong>{accountDisplayLabel(selectedAccount)}</strong>
    <small>{accountOwnershipLabel(selectedAccount)} · Dana tersedia {formatRupiah(allocationAvailableBalance(selectedAccount))}</small>
  </div>
  <div className={allocationClass("allocation-funding-lock form-grid__full")}>
    <span>Ke Alokasi</span>
    <strong>{target?.name || "Alokasi tidak tersedia"}</strong>
    <small>{target ? `${allocationAssigneeLabel(target)} · sisa ${formatRupiah(target.remaining_amount || 0)}` : "Konteks Alokasi tidak ditemukan"}</small>
  </div>
</>;

const FundingCreateAction = ({ sourceAccountId = "", onCreateNew, label = "Buat Alokasi baru" }) => onCreateNew
  ? <Button type="button" variant="secondary" icon={FiPlus} onClick={() => onCreateNew({ sourceAccountId })}>{label}</Button>
  : null;

const FundingNoTargetNotice = ({ sourceAccountId = "", onCreateNew, generic = false }) => <div className={allocationClass("allocation-funding-empty form-grid__full")}>
  <div role="status">
    <strong>{generic ? "Belum ada Alokasi yang dapat ditambah" : "Belum ada Alokasi dari rekening ini"}</strong>
    <p>{generic ? "Buat Alokasi baru untuk mulai memisahkan dana sesuai kebutuhan." : "Buat Alokasi baru agar dana rekening ini dapat dipisahkan tanpa memindahkan rekening."}</p>
  </div>
  <FundingCreateAction sourceAccountId={sourceAccountId} onCreateNew={onCreateNew} label={generic ? "Buat Alokasi baru" : "Buat Alokasi dari rekening ini"} />
</div>;

const FundingFields = ({ accounts, envelopes, selectedAccount, target, form, setForm, changeSource, available, invalidAmount, amountNumber, lockSelection, onCreateNew }) => {
  if (!accounts.length) return lockSelection
    ? <div className="notice notice--info form-grid__full" role="status">Rekening atau Alokasi pada konteks ini tidak lagi tersedia. Tutup flow ini lalu muat ulang data sebelum mencoba lagi.</div>
    : <FundingNoTargetNotice onCreateNew={onCreateNew} generic />;
  const selectedWithoutTarget = Boolean(!lockSelection && selectedAccount && envelopes.length === 0);
  const lockedWithoutTarget = Boolean(lockSelection && !target);
  return <>
    {lockSelection
      ? <>
        <FundingLockedContext selectedAccount={selectedAccount} target={target} />
        {lockedWithoutTarget ? <div className="notice notice--info form-grid__full" role="status">Alokasi pada konteks ini tidak lagi tersedia. Tutup flow ini lalu muat ulang data sebelum mencoba lagi.</div> : null}
      </>
      : <>
        <InlineSelectionPicker className="form-grid__full" label="Dari rekening mana?" required value={form.sourceAccountId} onChange={changeSource} placeholder="Pilih rekening" placeholderOption={{ icon: AccountIcon }} searchable={accounts.length > 8} searchPlaceholder="Cari rekening…" options={accounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `${accountOwnershipLabel(account)} · tersedia ${formatRupiah(allocationAvailableBalance(account))}`, ...accountOptionVisual(account) }))} />
        <InlineSelectionPicker className="form-grid__full" label="Ke Alokasi" required value={form.envelopePeriodId} onChange={(envelopePeriodId) => setForm((current) => ({ ...current, envelopePeriodId }))} placeholder={form.sourceAccountId ? "Pilih Alokasi" : "Pilih rekening terlebih dahulu"} placeholderOption={allocationOptionVisual()} searchable={envelopes.length > 8} searchPlaceholder="Cari Alokasi Dana…" options={envelopes.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${allocationAssigneeLabel(item)} · sisa ${formatRupiah(item.remaining_amount || 0)}`, ...allocationOptionVisual() }))} />
        {selectedWithoutTarget ? <FundingNoTargetNotice sourceAccountId={selectedAccount.account_id} onCreateNew={onCreateNew} /> : null}
      </>}
    {!selectedWithoutTarget && !lockedWithoutTarget ? <>
      <MoneyInput id="funding-flow-amount" label="Nominal" required value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
      {selectedAccount && invalidAmount && amountNumber > available ? <div className="notice notice--warning form-grid__full" role="status">Dana tersedia kurang {formatRupiah(amountNumber - available)}. Pilih nominal yang tidak melebihi dana bebas rekening ini.</div> : null}
      <label className="field form-grid__full"><span>Catatan</span><input maxLength="180" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: alokasi pemasukan bulan ini" /></label>
    </> : null}
  </>;
};

const FundingImpact = ({ selectedAccount, target, amountNumber }) => {
  if (!selectedAccount || !target || amountNumber <= 0) return null;
  const impact = allocationFundingImpact({ account: selectedAccount, target, amount: amountNumber });
  if (!impact.valid) return null;
  const { beforeAvailable, afterAvailable, beforeAllocation, afterAllocation } = impact;
  return <section className={allocationClass("allocation-funding-impact form-grid__full")} aria-label="Dampak setelah disimpan">
    <span className={allocationClass("allocation-funding-impact__title")}>Setelah disimpan</span>
    <div><span>Dana bebas {accountDisplayLabel(selectedAccount, { includeOwner: false })}</span><strong>{formatRupiah(beforeAvailable)} → {formatRupiah(afterAvailable)}</strong></div>
    <div><span>{target.name}</span><strong>{formatRupiah(beforeAllocation)} → {formatRupiah(afterAllocation)}</strong></div>
    <div><span>Saldo rekening</span><strong>tidak berubah</strong></div>
  </section>;
};

const FundingDestinationChoice = ({ canFundExisting, canCreateNew, busy, retryOnly, onExisting, onCreateNew }) => <div className={allocationClass("allocation-funding-choice-list")}>
  <button type="button" className={allocationClass("allocation-funding-choice")} disabled={!canFundExisting || busy || retryOnly} onClick={onExisting}>
    <span className={allocationClass("allocation-funding-choice__icon")}><FiLayers aria-hidden="true" /></span>
    <span className={allocationClass("allocation-funding-choice__copy")}>
      <strong>Alokasi yang sudah ada</strong>
      <small>{canFundExisting ? "Tambahkan dana ke Alokasi aktif dari rekening sumber yang sama." : "Belum ada Alokasi aktif dengan dana bebas yang dapat ditambah."}</small>
    </span>
    <FiChevronRight className={allocationClass("allocation-funding-choice__arrow")} aria-hidden="true" />
  </button>
  <button type="button" className={allocationClass("allocation-funding-choice")} disabled={!canCreateNew || busy || retryOnly} onClick={() => onCreateNew?.({})}>
    <span className={allocationClass("allocation-funding-choice__icon")}><FiPlus aria-hidden="true" /></span>
    <span className={allocationClass("allocation-funding-choice__copy")}><strong>Buat Alokasi baru</strong><small>Pisahkan dana untuk tujuan baru dengan rekening sumber yang dipilih di langkah berikutnya.</small></span>
    <FiChevronRight className={allocationClass("allocation-funding-choice__arrow")} aria-hidden="true" />
  </button>
</div>;

const fundingModalCopy = ({ lockSelection, target, amountNumber, invalidAmount }) => ({
  title: lockSelection && target ? `Tambah dana ke ${target.name}` : "Alokasikan dana",
  description: lockSelection
    ? "Sumber rekening mengikuti Alokasi ini dan tidak dapat diganti dari flow ini."
    : "Pilih rekening sumber terlebih dahulu. Saldo rekening tidak berubah saat dana dialokasikan.",
  submitLabel: amountNumber > 0 && !invalidAmount
    ? `${lockSelection ? "Tambah" : "Alokasikan"} ${formatRupiah(amountNumber)}`
    : lockSelection ? "Tambah dana" : "Alokasikan dana",
});

const submitAllocationFunding = ({ event, target, invalidAmount, busy, onSubmit, form }) => {
  event.preventDefault();
  if (!target || invalidAmount || busy) return;
  onSubmit?.({ target, amount: form.amount, reason: form.reason });
};

const AllocationFundingFooter = ({ busy, retryOnly, guard, target, invalidAmount, submitLabel }) => <>
  <Button type="button" disabled={busy || retryOnly} onClick={guard.discardAndClose}>Batal</Button>
  <Button type="submit" form="allocation-funding-form" variant="primary" loading={busy} disabled={!target || invalidAmount || busy}>{retryOnly ? "Coba lagi data yang sama" : submitLabel}</Button>
</>;

const useAllocationFundingForm = ({ open, accounts, items, initialSourceAccountId, initialEnvelopePeriodId, suggestedAmount, lockSelection }) => {
  const [form, setForm] = useState(initialForm);
  const [ready, setReady] = useState(false);
  const eligibleAccounts = useMemo(() => fundingAccountsForItems(accounts, items, { requestedAccountId: initialSourceAccountId, locked: lockSelection }), [accounts, initialSourceAccountId, items, lockSelection]);
  const envelopes = useMemo(() => allocationTargetsForAccount(items, form.sourceAccountId), [form.sourceAccountId, items]);

  useEffect(() => {
    if (!open) { setReady(false); return; }
    setForm(initialAllocationFundingForm({ accounts: eligibleAccounts, items, requestedAccountId: initialSourceAccountId, requestedEnvelopePeriodId: initialEnvelopePeriodId, suggestedAmount, locked: lockSelection }));
    setReady(true);
  }, [eligibleAccounts, initialEnvelopePeriodId, initialSourceAccountId, items, lockSelection, open, suggestedAmount]);

  const changeSource = (sourceAccountId) => {
    const matching = allocationTargetsForAccount(items, sourceAccountId);
    setForm((current) => ({ ...current, sourceAccountId, envelopePeriodId: matching.length === 1 ? matching[0].envelope_period_id : "" }));
  };
  return { form, setForm, ready, eligibleAccounts, envelopes, changeSource };
};

const fundingViewFor = ({ chooseDestination, lockSelection }) => chooseDestination && !lockSelection ? "destination" : "funding";

const useAllocationFundingController = ({ open, accounts, items, initialSourceAccountId, initialEnvelopePeriodId, suggestedAmount, lockSelection, chooseDestination, busy, retryOnly, onClose, onSubmit }) => {
  const [view, setView] = useState(() => fundingViewFor({ chooseDestination, lockSelection }));
  useEffect(() => {
    if (open) setView(fundingViewFor({ chooseDestination, lockSelection }));
  }, [chooseDestination, lockSelection, open]);
  const fundingForm = useAllocationFundingForm({ open, accounts, items, initialSourceAccountId, initialEnvelopePeriodId, suggestedAmount, lockSelection });
  const { form, setForm, ready, eligibleAccounts, envelopes, changeSource } = fundingForm;
  const selectedAccount = eligibleAccounts.find((item) => item.account_id === form.sourceAccountId) || null;
  const target = envelopes.find((item) => item.envelope_period_id === form.envelopePeriodId) || null;
  const available = allocationAvailableBalance(selectedAccount);
  const amountNumber = Number(String(form.amount || "").replace(/\D/g, "")) || 0;
  const invalidAmount = amountNumber <= 0 || amountNumber > available;
  const submit = (event) => submitAllocationFunding({ event, target, invalidAmount, busy, onSubmit, form });
  const guard = useUnsavedChangesGuard({ open: open && ready, value: form, onClose, blocked: busy || retryOnly });
  const copy = fundingModalCopy({ lockSelection, target, amountNumber, invalidAmount });
  return { form, setForm, eligibleAccounts, envelopes, changeSource, selectedAccount, target, available, amountNumber, invalidAmount, submit, guard, copy, view, setView };
};

const FundingFlowBody = ({ choosingDestination, controller, accounts, lockSelection, busy, retryOnly, error, onCreateNew }) => {
  const { form, setForm, eligibleAccounts, envelopes, changeSource, selectedAccount, target, available, amountNumber, invalidAmount, submit, setView } = controller;
  if (choosingDestination) return <FundingDestinationChoice canFundExisting={eligibleAccounts.length > 0} canCreateNew={Boolean(onCreateNew) && accounts.length > 0} busy={busy} retryOnly={retryOnly} onExisting={() => setView("funding")} onCreateNew={onCreateNew} />;
  return <form id="allocation-funding-form" className="form-grid" onSubmit={submit}>
    <fieldset className="mutation-retry-lock" disabled={retryOnly}>
      <FundingFields accounts={eligibleAccounts} envelopes={envelopes} selectedAccount={selectedAccount} target={target} form={form} setForm={setForm} changeSource={changeSource} available={available} invalidAmount={invalidAmount} amountNumber={amountNumber} lockSelection={lockSelection} onCreateNew={onCreateNew} />
      <FundingImpact selectedAccount={selectedAccount} target={target} amountNumber={amountNumber} />
    </fieldset>
    {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
  </form>;
};

const AllocationFundingFlow = ({ open, accounts, items, initialSourceAccountId = "", initialEnvelopePeriodId = "", suggestedAmount = 0, lockSelection = false, chooseDestination = false, busy = false, retryOnly = false, error = null, onClose, onSubmit, onCreateNew }) => {
  const controller = useAllocationFundingController({ open, accounts, items, initialSourceAccountId, initialEnvelopePeriodId, suggestedAmount, lockSelection, chooseDestination, busy, retryOnly, onClose, onSubmit });
  const { target, invalidAmount, guard, copy, view, setView } = controller;
  const choosingDestination = view === "destination";
  const footer = choosingDestination ? null : <AllocationFundingFooter busy={busy} retryOnly={retryOnly} guard={guard} target={target} invalidAmount={invalidAmount} submitLabel={copy.submitLabel} />;
  const headerBackAction = chooseDestination && !lockSelection && !choosingDestination
    ? { label: "Kembali ke pilihan tujuan", onClick: () => setView("destination"), disabled: busy || retryOnly }
    : null;

  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="alokasi dana" dismissible={!busy && !retryOnly} title={copy.title} description={choosingDestination ? "Dana mau diarahkan ke mana?" : copy.description} size="sm" headerBackAction={headerBackAction} footer={footer}>
    <FundingFlowBody choosingDestination={choosingDestination} controller={controller} accounts={accounts} lockSelection={lockSelection} busy={busy} retryOnly={retryOnly} error={error} onCreateNew={onCreateNew} />
  </Modal>;
};

export default AllocationFundingFlow;
