import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./lib/i18n";
import "./index.css";
import { Layout } from "./app/Layout";
import { navItems } from "./app/nav";
import { AssistantPage } from "./features/assistant/AssistantPage";
import { AuthGate } from "./features/auth/AuthGate";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PathDetailPage } from "./features/paths/PathDetailPage";
import { PathsPage } from "./features/paths/PathsPage";
import { JournalPage } from "./features/sessions/JournalPage";
import { PlaceholderPage } from "./features/system/PlaceholderPage";
import { SettingsPage } from "./features/system/SettingsPage";
import { TodayPage } from "./features/today/TodayPage";

const BUILT_PAGES = new Set(["/", "/today", "/paths", "/journal", "/assistant", "/settings"]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "today", element: <TodayPage /> },
      { path: "paths", element: <PathsPage /> },
      { path: "paths/:pathId", element: <PathDetailPage /> },
      { path: "journal", element: <JournalPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "assistant/:conversationId", element: <AssistantPage /> },
      { path: "settings", element: <SettingsPage /> },
      // الصفحات التي لم تُبنَ بعد تعرض عنواناً مؤقتاً، وتُستبدل مرحلة بعد مرحلة
      ...navItems
        .filter((item) => !BUILT_PAGES.has(item.path))
        .map((item) => ({
          path: item.path.slice(1),
          element: <PlaceholderPage titleKey={item.labelKey} />,
        })),
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);

// Service Worker في النسخة المبنية فقط: يجعل التطبيق قابلاً للتثبيت ويسرّع الفتح.
// (في التطوير يتعارض مع إعادة التحميل التلقائي لـ Vite)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // التطبيق يعمل بدونه؛ فقط لا يكون قابلاً للتثبيت
    });
  });
}
