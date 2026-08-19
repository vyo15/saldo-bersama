import "./FinancialAlertList.css";
import { FiAlertTriangle, FiChevronRight, FiInfo } from "react-icons/fi";
import { Link } from "react-router";
import { dashboardAlertGuidance } from "../dashboardPresentation.js";

const SeverityIcon = ({ severity }) => severity === "info" ? <FiInfo aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />;

const AlertInstruction = ({ mobile, instruction }) => mobile
  ? <p className="mobile-attention-guidance">{instruction}</p>
  : <div className="financial-alert-instruction"><span>Yang perlu dilakukan</span><p>{instruction}</p></div>;

const FinancialAlertList = ({ alerts = [], variant = "default" }) => {
  if (!alerts.length) return null;
  const mobile = variant === "mobile";
  return (
    <ul className={`financial-alert-list financial-alert-list--${variant}${mobile ? " mobile-attention-list" : ""}`}>
      {alerts.map((alert) => {
        const guidance = dashboardAlertGuidance(alert);
        return (
          <li className={`financial-alert-item${mobile ? " mobile-attention-item" : ""}`} data-severity={alert.severity} key={alert.id}>
            <span className={`financial-alert-item__icon${mobile ? " mobile-attention-item__icon" : ""}`}><SeverityIcon severity={alert.severity} /></span>
            <div className={`financial-alert-item__content${mobile ? " mobile-attention-item__content" : ""}`}>
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
              <AlertInstruction mobile={mobile} instruction={guidance.instruction} />
              <Link className={`financial-alert-action${mobile ? " mobile-attention-action" : ""}`} to={guidance.to} state={guidance.state}>{guidance.actionLabel}<FiChevronRight aria-hidden="true" /></Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default FinancialAlertList;
