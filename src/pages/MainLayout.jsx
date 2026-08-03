import { Outlet } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import "../styles/layout.css";

function MainLayout() {
    return (
        <div className="main-layout">
            <Header />

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