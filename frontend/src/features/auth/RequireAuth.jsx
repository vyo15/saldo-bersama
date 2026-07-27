import { Navigate, Outlet, useLocation } from "react-router-dom";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useAuth } from "./AuthContext.jsx";

const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <LoadingScreen label="Memeriksa sesi aman..." />;
  if (status !== "authenticated") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
};

export default RequireAuth;
