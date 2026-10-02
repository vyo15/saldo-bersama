import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiCopy, FiRefreshCw, FiRepeat, FiSearch } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import { APP_MEDIA } from "../../../config/layout.js";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { useMediaQuery } from "../../../hooks/useMediaQuery.js";
import { diagnoseReconciliation } from "../reconciliations.api.js";
import styles from "./ReconciliationResolution.module.css";

const TRANSACTION_CHOICES = Object.freeze([
  { type: TRANSACTION_TYPES.EXPENSE, label: "Pengeluaran", help: "Uang keluar yang belum dicatat" },
  { type: TRANSACTION_TYPES.INCOME, label: "Pemasukan", help: "Uang masuk yang belum dicatat" },
  { type: TRANSACTION_TYPES.TRANSFER, label: "Transfer", help: "Perpindahan antar rekening" },
  { type: TRANSACTION_TYPES.REFUND, label: "Refund", help: "Pengembalian dana" },
]);

const confidenceLabel = (value) => value === "strong" ? "Kecocokan kuat" : value === "possible" ? "Perlu diperiksa" : "Kemungkinan";
const CandidateIcon = ({ kind }) => kind === "recurring" ? <FiRepeat aria-hidden="true" /> : kind === "duplicate" ? <FiCopy aria-hidden="true" /> : <FiSearch aria-hidden="true" />;

const BalanceSummary = ({ result, currentSystemBalance }) => {
  const currentDifference = Number(result.actualBalance || 0) - Number(currentSystemBalance ?? result.systemBalance ?? 0);
  return <dl className={styles.summary}>
    <div><dt>Saldo aplikasi</dt><dd><Money value={currentSystemBalance ?? result.systemBalance} /></dd></div>
    <div><dt>Saldo yang Anda lihat</dt><dd><Money value={result.actualBalance} /></dd></div>
    <div><dt>Selisih tersisa</dt><dd data-state={currentDifference === 0 ? "matched" : "difference"}><Money value={currentDifference} /></dd></div>
  </dl>;
};

const TransactionTypeChooser = ({ onRecordTransaction, onCancel, suggestedAmount }) => <div className={styles.typeChooser}>
  <div className={styles.sectionHeading}><strong>Apa yang belum tercatat?</strong><small>Pilih jenisnya sendiri. Sistem tidak menebak dari tanda selisih.</small></div>
  <div className={styles.typeGrid}>
    {TRANSACTION_CHOICES.map((choice) => <button key={choice.type} type="button" className={styles.typeButton} onClick={() => onRecordTransaction(choice.type, suggestedAmount)}>
      <strong>{choice.label}</strong><small>{choice.help}</small><FiArrowRight aria-hidden="true" />
    </button>)}
  </div>
  <button type="button" className={styles.textAction} onClick={onCancel}>Kembali</button>
</div>;

const DifferenceStart = ({ result, currentSystemBalance, onDiagnose, loading, onClose }) => {
  const currentDifference = Number(result.actualBalance || 0) - Number(currentSystemBalance ?? result.systemBalance ?? 0);
  return <div className={styles.flow}>
  <div className={styles.hero}>
    <span className={styles.heroIcon} data-tone="warning"><FiAlertTriangle aria-hidden="true" /></span>
    <span className={styles.eyebrow}>Perlu diperiksa</span>
    <strong className={styles.heroAmount}><Money value={Math.abs(currentDifference)} /></strong>
    <p>Ada perbedaan antara saldo aplikasi dan saldo yang Anda lihat. Cari penyebabnya dulu sebelum mencatat apa pun.</p>
  </div>
  <BalanceSummary result={result} currentSystemBalance={currentSystemBalance} />
  <div className={styles.actions}>
    <Button variant="primary" icon={FiSearch} loading={loading} onClick={onDiagnose}>Cari penyebab</Button>
    <button type="button" className={styles.textAction} onClick={onClose}>Selesaikan nanti</button>
  </div>
</div>;
};

const CandidateCard = ({ candidate, onOpenCandidate }) => <article className={styles.candidate} data-confidence={candidate.confidence}>
  <div className={styles.candidateIcon}><CandidateIcon kind={candidate.kind} /></div>
  <div className={styles.candidateCopy}>
    <span className={styles.confidence}>{confidenceLabel(candidate.confidence)}</span>
    <strong>{candidate.title}</strong>
    <small>{candidate.detail}</small>
    <span className={styles.candidateAmount}><Money value={candidate.amount} /></span>
    <ul>{(candidate.reasons || []).slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}</ul>
  </div>
  <Button className={styles.candidateAction} variant="secondary" onClick={() => onOpenCandidate(candidate)}>
    {candidate.kind === "recurring" ? "Buka pembayaran" : "Periksa transaksi"}
  </Button>
</article>;

const DiagnosisResult = ({ diagnosis, result, currentSystemBalance, onOpenCandidate, onReviewTransactions, onRecordTransaction, onRecheck, onDiagnose, loading }) => {
  const [manualOpen, setManualOpen] = useState(false);
  const resolved = diagnosis?.resolved || Number(result.actualBalance || 0) === Number(currentSystemBalance ?? result.systemBalance ?? 0);
  if (resolved) return <ResolvedReady result={result} currentSystemBalance={currentSystemBalance} onRecheck={onRecheck} />;
  if (manualOpen) return <TransactionTypeChooser onRecordTransaction={onRecordTransaction} suggestedAmount={Math.abs(Number(diagnosis?.difference ?? (Number(result.actualBalance || 0) - Number(currentSystemBalance ?? result.systemBalance ?? 0))))} onCancel={() => setManualOpen(false)} />;
  const candidates = diagnosis?.candidates || [];
  return <div className={styles.flow}>
    <div className={styles.sectionHeading}>
      <strong>{candidates.length ? "Kemungkinan penyebab" : "Belum ada penyebab yang cukup kuat"}</strong>
      <small>{candidates.length ? "Urutan ini berdasarkan data aplikasi, bukan tebakan jenis transaksi dari plus/minus selisih." : "Anda tetap bisa meninjau transaksi atau memilih sendiri jenis aktivitas yang belum tercatat."}</small>
    </div>
    <BalanceSummary result={result} currentSystemBalance={diagnosis?.system_balance ?? currentSystemBalance} />
    {candidates.length ? <div className={styles.candidateList}>{candidates.map((candidate) => <CandidateCard key={candidate.candidate_id} candidate={candidate} onOpenCandidate={onOpenCandidate} />)}</div> : null}
    <div className={styles.secondaryActions}>
      <Button variant="secondary" onClick={() => setManualOpen(true)}>Catat transaksi lain</Button>
      <Button variant="secondary" onClick={onReviewTransactions}>Periksa transaksi terbaru</Button>
      <button type="button" className={styles.retry} onClick={onDiagnose} disabled={loading}><FiRefreshCw aria-hidden="true" /> Analisis ulang</button>
    </div>
    <p className={styles.safetyNote}>Saldo tidak dikoreksi otomatis. Jika data aplikasi memang perlu koreksi khusus, tinjau histori lebih dulu agar laporan pemasukan/pengeluaran tidak tercampur transaksi palsu.</p>
  </div>;
};

const ResolvedReady = ({ result, currentSystemBalance, onRecheck }) => <div className={styles.flow}>
  <div className={styles.hero}>
    <span className={styles.heroIcon} data-tone="success"><FiCheckCircle aria-hidden="true" /></span>
    <span className={styles.eyebrow}>Sudah cocok</span>
    <strong className={styles.resolvedTitle}>Saldo sekarang sesuai</strong>
    <p>Perubahan yang Anda buat sudah menutup selisih. Simpan pemeriksaan baru agar histori tetap append-only.</p>
  </div>
  <BalanceSummary result={result} currentSystemBalance={currentSystemBalance} />
  <Button variant="primary" icon={FiCheckCircle} onClick={onRecheck}>Simpan hasil pemeriksaan</Button>
</div>;

const FinalSuccess = ({ result, onClose }) => <div className={styles.flow}>
  <div className={styles.hero}>
    <span className={styles.heroIcon} data-tone="success"><FiCheckCircle aria-hidden="true" /></span>
    <span className={styles.eyebrow}>Selesai</span>
    <strong className={styles.resolvedTitle}>Saldo sudah sesuai</strong>
    <p>Selisih sebelumnya tetap tersimpan sebagai histori. Pemeriksaan terbaru mencatat kondisi yang sudah cocok.</p>
  </div>
  <dl className={styles.summary}>
    <div><dt>Selisih sebelumnya</dt><dd><Money value={Math.abs(Number(result.resolvedFromDifference || 0))} /></dd></div>
    <div><dt>Saldo terbaru</dt><dd><Money value={result.actualBalance} /></dd></div>
    <div><dt>Selisih sekarang</dt><dd data-state="matched"><Money value={0} /></dd></div>
  </dl>
  <Button variant="primary" onClick={onClose}>Selesai</Button>
</div>;

const ResolutionBody = (props) => {
  const { result, currentSystemBalance, onClose, onOpenCandidate, onReviewTransactions, onRecordTransaction, onRecheck } = props;
  const [diagnosis, setDiagnosis] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => { setDiagnosis(null); setStatus("idle"); setError(""); }, [result?.reconciliationId]);
  useEffect(() => {
    if (!diagnosis || Number(diagnosis.system_balance) === Number(currentSystemBalance ?? result?.systemBalance ?? 0)) return;
    setDiagnosis(null);
    setStatus("idle");
    setError("");
  }, [currentSystemBalance, diagnosis, result?.systemBalance]);
  const currentDifference = useMemo(() => Number(result?.actualBalance || 0) - Number(currentSystemBalance ?? result?.systemBalance ?? 0), [currentSystemBalance, result]);
  const diagnose = async () => {
    if (!result?.reconciliationId || status === "loading") return;
    setStatus("loading"); setError("");
    try {
      const next = await diagnoseReconciliation(result.reconciliationId);
      setDiagnosis(next); setStatus("ready");
    } catch (diagnosisError) {
      setError(diagnosisError?.message || "Penyebab belum dapat dianalisis. Coba lagi.");
      setStatus("error");
    }
  };

  if (result?.matched && result.resolvedFromDifference) return <FinalSuccess result={result} onClose={onClose} />;
  if (currentDifference === 0 && result && !result.matched) return <ResolvedReady result={result} currentSystemBalance={currentSystemBalance} onRecheck={onRecheck} />;
  return <>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {diagnosis ? <DiagnosisResult diagnosis={diagnosis} result={result} currentSystemBalance={currentSystemBalance} onOpenCandidate={onOpenCandidate} onReviewTransactions={onReviewTransactions} onRecordTransaction={onRecordTransaction} onRecheck={onRecheck} onDiagnose={diagnose} loading={status === "loading"} />
      : <DifferenceStart result={result} currentSystemBalance={currentSystemBalance} onDiagnose={diagnose} loading={status === "loading"} onClose={onClose} />}
  </>;
};

const ReconciliationResolution = (props) => {
  const mobile = useMediaQuery(APP_MEDIA.mobile, { fallback: true });
  if (!props.result || (props.result.matched && !props.result.resolvedFromDifference)) return null;
  if (mobile) return <Modal open onClose={props.onClose} title={props.result.matched ? "Saldo sudah sesuai" : "Ada selisih saldo"} description="Selesaikan satu langkah pada satu waktu." size="sm" mobileSwipeToClose closeLabel="Tutup pemeriksaan"><div className={styles.mobileBody}><ResolutionBody {...props} /></div></Modal>;
  return <Card className={styles.desktopPanel} aria-label="Bantu cari penyebab selisih"><div className={styles.desktopHeader}><span>Bantu cari penyebab</span><small>Sistem menganalisis data; keputusan tetap di tangan Anda.</small></div><ResolutionBody {...props} /></Card>;
};

export default ReconciliationResolution;
