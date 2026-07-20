import { NavLink } from "react-router-dom";

function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="logo">LARO</div>

            <nav className="navigation">
                <ul>
                    <li>
                        <NavLink to="/simulation">
                            시뮬레이션
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/setting">
                            시뮬레이션 설정
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/robot">
                            로봇 관리
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/warehouse">
                            창고 관리
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/operation">
                            운영 관리
                        </NavLink>
                    </li>

                    <li>
                        <NavLink to="/dashboard">
                            대시보드
                        </NavLink>
                    </li>
                </ul>
            </nav>

            <div className="system-status">
                <h3>시스템 상태</h3>
                <p>연결 로봇</p>
                <p>시뮬레이션 시간</p>
            </div>
        </aside>
    );
}

export default Sidebar;