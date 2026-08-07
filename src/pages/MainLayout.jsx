import { Outlet } from "react-router-dom";
import Sidebar from "../components/common/Sidebar";
import Footer from "../components/common/Footer";
import "../styles/MainLayout.css";

function MainLayout() {
    return (
        <div className="main-layout">
            <Sidebar />

            <div className="main-content">
                <main className="page-content">
                    <Outlet />
                </main>

                <Footer />
            </div>
        </div>
    );
}

export default MainLayout;
