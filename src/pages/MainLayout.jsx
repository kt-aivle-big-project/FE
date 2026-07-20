import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import "../styles/layout.css";
import Simulation from "./Simulation";

function MainLayout() {
    return (
        <div className="main-layout">
            <Sidebar />
            <Simulation />
        </div>
    );
}

export default MainLayout;