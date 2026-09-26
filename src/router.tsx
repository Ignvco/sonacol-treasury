import { lazy } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
const Assistant = lazy(() => import("./pages/Assistant"));
const Today = lazy(() => import("./pages/Today"));
const Changes = lazy(() => import("./pages/Changes"));
const Scenarios = lazy(() => import("./pages/Scenarios"));
const Accuracy = lazy(() => import("./pages/Accuracy"));
const Security = lazy(() => import("./pages/Security"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const Banks = lazy(() => import("./pages/Banks"));
const Reconciliation = lazy(() => import("./pages/Reconciliation"));
const Receivables = lazy(() => import("./pages/Receivables"));
const Investments = lazy(() => import("./pages/Investments"));
const Projections = lazy(() => import("./pages/Projections"));
const Planning = lazy(() => import("./pages/planning"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Importations = lazy(() => import("./pages/Importations"));
const Integrations = lazy(() => import("./pages/Integrations"));
const NotFound = lazy(() => import("./pages/NotFound"));

export const routers = [
  {
    path: "/login",
    name: "Login",
    element: <Login />,
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: "today", element: <Today /> },
      { path: "changes", element: <Changes /> },
      { path: "scenarios", element: <Scenarios /> },
      { path: "accuracy", element: <Accuracy /> },
      { path: "assistant", element: <Assistant /> },
      { path: "security", element: <Security /> },
      { path: "dashboard", name: "Resumen", element: <Dashboard /> },
      { path: "cashflow", name: "Flujo de caja", element: <CashFlow /> },
      { path: "banks", name: "Bancos", element: <Banks /> },
      {
        path: "reconciliation",
        name: "Conciliación",
        element: <Reconciliation />,
      },
      {
        path: "receivables",
        name: "Cobranzas",
        element: <Receivables />,
      },
      { path: "investments", name: "Inversiones", element: <Investments /> },
      { path: "projections", name: "Proyecciones", element: <Projections /> },
      { path: "planning", name: "Planificación y reglas", element: <Planning /> },
      { path: "reports", name: "Reportes", element: <Reports /> },
      {
        path: "importations",
        name: "Importaciones",
        element: <Importations />,
      },
      {
        path: "integrations",
        name: "Integraciones",
        element: <Integrations />,
      },
      { path: "settings", name: "Configuración", element: <Settings /> },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
