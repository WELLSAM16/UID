import Sidebar from "@/components/Sidebar";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="layout-wrapper">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
