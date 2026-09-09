import { lazy, Suspense } from "react";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";

const AllocationsWorkspace = lazy(() => import("./AllocationsWorkspace.jsx"));

const AllocationsPage = ({ embedded = false }) => (
  <Suspense fallback={<NativePageSkeleton kind="planning" label="Memuat Alokasi Dana…" />}>
    <AllocationsWorkspace embedded={embedded} />
  </Suspense>
);

export default AllocationsPage;
