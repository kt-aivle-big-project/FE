import { BrowserRouter, Routes, Route } from "react-router-dom";

import LoginSelect from "./pages/login/LoginSelect";
import Login from "./pages/login/Login";
import ForgotPassword from "./pages/login/ForgotPassword";
import Signup from "./pages/login/Signup";
import MainLayout from "./pages/MainLayout";
import Simulation from "./pages/simulation/Simulation";
import SimulationSetting from "./pages/SimulationSetting";
import Scenario from "./pages/scenario/Scenario";
import RobotManagement from "./pages/RobotManagement";
import WarehouseManagement from "./pages/WarehouseManagement";
import WarehouseCreate from "./pages/WarehouseCreate";
import OperationManagement from "./pages/OperationManagement";
import Board from "./pages/Board";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginSelect />} />
                <Route path="/login" element={<Login />} />
                <Route path="/password" element={<ForgotPassword />} />
                <Route path="/signup" element={<Signup />} />

                <Route element={<MainLayout />}>
                    <Route path="/simulation" element={<Simulation />} />
                    <Route path="/scenario" element={<Scenario />}/>
                    <Route path="/robot" element={<RobotManagement />} />
                    <Route path="/setting" element={<SimulationSetting />} />
                    <Route path="/warehouse" element={<WarehouseManagement />} />
                    <Route path="/warehouse/new" element={<WarehouseCreate />} />
                    <Route path="/warehouse/:warehouseId/edit" element={<WarehouseCreate />} />
                    <Route path="/operation" element={<OperationManagement />} />
                    <Route path="/board" element={<Board />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
