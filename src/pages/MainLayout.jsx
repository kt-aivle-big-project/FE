import { Outlet } from "react-router-dom";
import Header from "../components/Header";
import "../styles/Layout.css";

function MainLayout() {
    return (
        <div className="main-layout">
            <Header />

            <main className="page-content">
                <Outlet />
            </main>
        </div>
    );
}

export default MainLayout;