import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

import Login from "./pages/login/Login";
import ForgotPassword from "./pages/login/ForgotPassword";
import Signup from "./pages/login/Signup";

import MainLayout from "./layouts/MainLayout";
import Simulation from "./pages/simulation/Simulation";
import Scenario from "./pages/scenario/Scenario";
import ScenarioReplanHistory from "./pages/scenario/ScenarioReplanHistory";
import RobotManagement from "./pages/robot/RobotManagement";
import WarehouseManagement from "./pages/warehouse/WarehouseManagement";
import WarehouseCreate from "./pages/warehouse/WarehouseCreate";
import OperationManagement from "./pages/operation/OperationManagement";
import Board from "./pages/board/Board";
import Profile from "./pages/profile/Profile";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* 로그인 */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/password" element={<ForgotPassword />} />
                <Route path="/signup" element={<Signup />} />

                {/* 메인 서비스 */}
                <Route element={<MainLayout />}>
                    <Route path="/simulation" element={<Simulation />} />
                    <Route path="/scenario" element={<Scenario />} />
                    <Route path="/replan-history" element={<ScenarioReplanHistory />} />
                    <Route path="/robot" element={<RobotManagement />} />
                    <Route path="/warehouse" element={<WarehouseManagement />} />
                    <Route path="/warehouse/new" element={<WarehouseCreate />} />
                    <Route path="/warehouse/:warehouseId/edit" element={<WarehouseCreate />} />
                    <Route path="/operation" element={<OperationManagement />} />
                    <Route path="/board" element={<Board />} />
                    <Route path="/profile" element={<Profile />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;