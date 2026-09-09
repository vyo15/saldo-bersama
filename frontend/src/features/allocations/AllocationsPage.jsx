import { lazy, Suspense } from "react";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";

const AllocationsWorkspace = lazy(() => import("./AllocationsWorkspace.jsx"));

const AllocationsPage = ({ embedded = false }) => (
  <Suspense fallback={<LoadingScreen label="Memuat Alokasi Dana..." />}>
    <AllocationsWorkspace embedded={embedded} />
  </Suspense>
);

export default AllocationsPage;
