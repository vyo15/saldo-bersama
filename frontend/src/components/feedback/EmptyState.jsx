import { FiInbox } from "react-icons/fi";

const EmptyState = ({ title = "Belum ada data", description = "Data akan muncul setelah Anda menambah pencatatan.", action, icon: Icon = FiInbox }) => (
  <div className="empty-state" role="status">
    <Icon aria-hidden="true" />
    <h2>{title}</h2>
    <p>{description}</p>
    {action}
  </div>
);

export default EmptyState;
