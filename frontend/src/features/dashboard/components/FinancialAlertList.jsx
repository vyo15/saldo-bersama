import { FiAlertTriangle, FiChevronRight, FiInfo } from "react-icons/fi";
import { Link } from "react-router";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import styles from "./FinancialAlertList.module.css";

const SeverityIcon = ({ severity }) => severity === "info" ? <FiInfo aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />;

const AlertInstruction = ({ mobile, instruction }) => mobile
  ? <p className={styles.mobileGuidance}>{instruction}</p>
  : <div className={styles.instruction}><span>Yang perlu dilakukan</span><p>{instruction}</p></div>;

const FinancialAlertList = ({ alerts = [], variant = "default" }) => {
  if (!alerts.length) return null;
  const mobile = variant === "mobile";
  return (
    <ul className={styles.list} data-variant={variant}>
      {alerts.map((alert) => {
        const guidance = financialAlertGuidance(alert);
        return (
          <li className={styles.item} data-severity={alert.severity} key={alert.id}>
            <span className={styles.icon}><SeverityIcon severity={alert.severity} /></span>
            <div className={styles.content}>
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
              <AlertInstruction mobile={mobile} instruction={guidance.instruction} />
              <Link className={styles.action} to={guidance.to} state={guidance.state}>{guidance.actionLabel}<FiChevronRight aria-hidden="true" /></Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default FinancialAlertList;
