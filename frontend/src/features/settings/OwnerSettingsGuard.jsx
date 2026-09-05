import { FiLock } from "react-icons/fi";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import Card from "../../components/common/Card.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const OwnerSettingsGuard = ({ children, returnTo = "/pengaturan", returnLabel = "Kembali ke ringkasan" }) => {
  const { user } = useAuth();
  if (user?.role === "owner") return children;
  return (
    <Card className="panel">
      <div className="panel__header">
        <div><h2>Hanya Administrator yang dapat membuka bagian ini</h2></div>
        <FiLock aria-hidden="true" />
      </div>
      <ButtonLink to={returnTo}>{returnLabel}</ButtonLink>
    </Card>
  );
};

export default OwnerSettingsGuard;
