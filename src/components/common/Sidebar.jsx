import { NavLink, useNavigate } from "react-router-dom";
import "../../styles/common/Sidebar.css";

function Sidebar() {
    const navigate = useNavigate();

    const handleLogout = () => {
        const isLogout = window.confirm("로그아웃 하시겠습니까?");

        if (!isLogout) {
            return;
        }

        // 로그인 관련 저장 정보를 삭제한다.
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
        <aside className="sidebar">
            <div className="sidebar-logo">
                <strong>LARO</strong>
                <span>WAREHOUSE CONTROL</span>
            </div>

            <nav className="sidebar-navigation" aria-label="주요 메뉴">
                <ul>
                    <li>
                        <NavLink
                            to="/simulation"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            시뮬레이션
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/scenario"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            시나리오 관리
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/robot"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            로봇
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/warehouse"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            창고
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/operation"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            운영/대시보드
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/board"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            게시판
                        </NavLink>
                    </li>
                </ul>
            </nav>

            <div className="sidebar-logout">
                <button
                    type="button"
                    className="sidebar-logout-button"
                    onClick={handleLogout}
                >
                    로그아웃
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
