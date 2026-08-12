import { FiLock } from "react-icons/fi";
import { Link } from "react-router";
import Card from "../../components/common/Card.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const OwnerSettingsGuard = ({ children }) => {
  const { user } = useAuth();
  if (user?.role === "owner") return children;
  return (
    <Card className="panel">
      <div className="panel__header">
        <div><h2>Hanya Administrator yang dapat membuka bagian ini</h2></div>
        <FiLock aria-hidden="true" />
      </div>
      <Link className="button button--secondary" to="/pengaturan">Kembali ke ringkasan</Link>
    </Card>
  );
};

export default OwnerSettingsGuard;
