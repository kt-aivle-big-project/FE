import { NavLink, useNavigate } from "react-router-dom";

function Header() {
<<<<<<< HEAD
=======
    const navigate = useNavigate();

    const handleLogout = () => {
        const isLogout = window.confirm("로그아웃 하시겠습니까?");

        if (!isLogout) {
            return;
        }

        // 로그인 관련 저장 정보 삭제
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        localStorage.removeItem("testUser");

        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("refreshToken");
        sessionStorage.removeItem("user");
        localStorage.removeItem("simulationRunId");
        sessionStorage.removeItem("simulationRunId");

        alert("로그아웃되었습니다.");
        navigate("/login");
    };
>>>>>>> fix/logout-simulation-state

    return (
        <header className="header">
           
        </header>
    );
}

export default Header;
