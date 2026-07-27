import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import "../styles/Layout.css";

function MainLayout() {
    return (
        <div className="main-layout">
            <Sidebar />

            <main className="simulation-wrapper">
                <Outlet />
            </main>
        </div>
    );
}

export default MainLayout;