import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Dashboard from "../pages/dashboard/page";
import CalculatorPage from "../pages/calculator/page";
import Sourcing from "../pages/sourcing/page";
import Modules from "../pages/modules/page";
import Tarifs from "../pages/tarifs/page";
import SuppliersPage from "../pages/suppliers/page";
import AccountPage from "../pages/account/page";
import AdminPage from "../pages/account/admin";

const routes: RouteObject[] = [
  {
    path: "/compte",
    element: <AccountPage />,
  },
  {
    path: "/administration",
    element: <AdminPage />,
  },
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/calculateur",
    element: <CalculatorPage />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
  {
    path: "/sourcing",
    element: <Sourcing />,
  },
  {
    path: "/modules",
    element: <Modules />,
  },
  {
    path: "/tarifs",
    element: <Tarifs />,
  },
  {
    path: "/fournisseurs",
    element: <SuppliersPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;