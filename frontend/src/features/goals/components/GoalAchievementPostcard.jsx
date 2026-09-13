import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Money from "../../../components/common/Money.jsx";
import { goalAchievementPresentation } from "../goalAchievement.js";
import styles from "./GoalAchievementPostcard.module.css";

const CONFETTI = Object.freeze(["one", "two", "three", "four", "five", "six"]);

const GoalAchievementPostcard = ({ goalBefore, goalAfter, amount, onClose }) => {
  const presentation = useMemo(() => goalAchievementPresentation({ goalBefore, goalAfter, amount }), [amount, goalAfter, goalBefore]);

  useEffect(() => {
    if (!presentation) return undefined;
    const duration = presentation.kind === "reached" ? 4_400 : 3_400;
    const timer = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(timer);
  }, [onClose, presentation]);

  if (!presentation || typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.layer}>
      <div className={styles.backdrop} aria-hidden="true" />
      <section className={`${styles.postcard} ${presentation.kind === "reached" ? styles.reached : ""}`} role="status" aria-live="polite" aria-atomic="true">
        {presentation.kind === "reached" ? <div className={styles.confetti} aria-hidden="true">{CONFETTI.map((item) => <span key={item} data-piece={item} />)}</div> : null}
        <div className={styles.visual}>
          <span className={`${styles.spark} ${styles.sparkOne}`} aria-hidden="true">✨</span>
          <span className={`${styles.spark} ${styles.sparkTwo}`} aria-hidden="true">✦</span>
          <span className={`${styles.spark} ${styles.sparkThree}`} aria-hidden="true">✨</span>
          <img className={styles.art} src={presentation.art} width="1024" height="683" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <div className={styles.visualFade} aria-hidden="true" />
        </div>
        <div className={styles.copy}>
          <span className={styles.kicker}>{presentation.kicker}</span>
          <h2>{presentation.title}</h2>
          <strong className={styles.amount}><span aria-hidden="true">+</span><Money value={presentation.amount} /></strong>
          <p className={styles.meta}>{presentation.goalName} · sekarang {presentation.progressPercent}%</p>
          <p className={styles.message}>{presentation.message}</p>
          <progress className={styles.progress} aria-label={`Progress ${presentation.goalName}`} max="100" value={presentation.progressPercent}>{presentation.progressPercent}%</progress>
          <div className={styles.progressMeta}>
            <span><Money value={presentation.currentAmount} /> terkumpul</span>
            <span>{presentation.remainingAmount > 0 ? <>Sisa <Money value={presentation.remainingAmount} /></> : "Target nominal tercapai"}</span>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default GoalAchievementPostcard;
