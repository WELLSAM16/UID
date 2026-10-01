import Sidebar from "@/components/Sidebar";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function BerandaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="layout-wrapper">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
