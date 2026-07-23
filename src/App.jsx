import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MainLayout from "./pages/MainLayout";
import Simulation from "./pages/Simulation";
import SimulationSetting from "./pages/SimulationSetting";
import RobotManagement from "./pages/RobotManagement";
import WarehouseManagement from "./pages/WarehouseManagement";
import OperationManagement from "./pages/OperationManagement";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />

                <Route element={<MainLayout />}>
                    <Route path="/simulation" element={<Simulation />} />
                    <Route path="/robot" element={<RobotManagement />} />
                    <Route path="/setting" element={<SimulationSetting />} />
                    <Route path="/warehouse" element={<WarehouseManagement />} />
                    <Route path="/operation" element={<OperationManagement />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;