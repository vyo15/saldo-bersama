import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiInfo, FiLoader } from "react-icons/fi";
import styles from "./CompactNotice.module.css";

const DEFAULT_ICONS = Object.freeze({
  info: FiInfo,
  success: FiCheckCircle,
  warning: FiAlertTriangle,
  danger: FiAlertCircle,
  loading: FiLoader,
});

const CompactNotice = ({ tone = "info", title, children, icon: Icon, className = "", role, ariaLive }) => {
  const NoticeIcon = Icon || DEFAULT_ICONS[tone] || FiInfo;
  const toneClass = styles[tone] || styles.info;
  const classes = [styles.notice, toneClass, className].filter(Boolean).join(" ");

  return (
    <div className={classes} role={role} aria-live={ariaLive} data-ui="compact-notice" data-tone={tone}>
      <span className={styles.icon} aria-hidden="true"><NoticeIcon /></span>
      <span className={styles.copy}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        {children ? <span className={styles.body}>{children}</span> : null}
      </span>
    </div>
  );
};

export default CompactNotice;
