import { NavLink, useNavigate } from "react-router-dom";

function Sidebar() {
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

        alert("로그아웃되었습니다.");
        navigate("/login");
    };

    return (
        <header className="header">
            <div className="logo">LARO</div>

            <nav className="navigation">
                <ul>
                    <li>
                        <NavLink to="/simulation">
                            시뮬레이션
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/scenarios">
                            설정
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/robot">
                            로봇
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/warehouse">
                            창고
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/operation">
                            운영/대시보드
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/board">
                            게시판
                        </NavLink>
                    </li>

                </ul>
            </nav>

            <div className="sidebar-logout">
                <button
                    type="button"
                    className="logout-button"
                    onClick={handleLogout}
                >
                    로그아웃
                </button>
            </div>
        </header>
    );
}

export default Sidebar;
