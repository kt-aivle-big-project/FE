import { BrowserRouter, Routes, Route } from "react-router-dom";

import LoginSelect from "./pages/login/LoginSelect";
import Login from "./pages/login/Login";
import ForgotPassword from "./pages/login/ForgotPassword";
import Signup from "./pages/login/Signup";
import MainLayout from "./pages/MainLayout";
import Simulation from "./pages/simulation/Simulation";
// TODO: pages/scenario/Scenario.jsx 가 아직 저장소에 없어 화면이 뜨지 않는다.
// 파일이 올라오면 아래 import 와 /scenarios 라우트 주석을 풀 것.
// import Scenario from "./pages/scenario/Scenario";
import SimulationSetting from "./pages/SimulationSetting";
import RobotManagement from "./pages/RobotManagement";
import WarehouseManagement from "./pages/WarehouseManagement";
import OperationManagement from "./pages/OperationManagement";

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
                    <Route path="/robot" element={<RobotManagement />} />
                    {/* <Route path="/scenarios" element={<Scenario />} /> */}
                    <Route path="/warehouse" element={<WarehouseManagement />} />
                    <Route path="/operation" element={<OperationManagement />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;