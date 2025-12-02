import { createBrowserRouter } from "react-router-dom";
import Layout from './../layout/Layout';
import LoginPage from "../pages/LoginPage";
import CallPage from './../components/callPage';

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <LoginPage />,
      },
      {
        path: "/call",
        element: <CallPage />,
      },
    ],
  },
]);