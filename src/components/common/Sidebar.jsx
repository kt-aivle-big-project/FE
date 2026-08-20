import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import useStompSubscriptions from "../../hooks/useStompSubscriptions";
import { TOPICS } from "../../api/config";
import { simulationRunApi } from "../../api/client";
import "../../styles/common/Sidebar.css";

const RUN_ID_KEY = "simulationRunId";

const RUNNING_SIMULATION_STATUSES = [
    "RUNNING",
    "QUIESCING",
    "REPLANNING",
    "PENDING_ACTIVATION",
];

function Sidebar() {
    const navigate = useNavigate();
    const [simulationRunId, setSimulationRunId] = useState(() => {
        const savedRunId = localStorage.getItem(RUN_ID_KEY);

        return savedRunId ? Number(savedRunId) : null;
    });

    const [simulationStatus, setSimulationStatus] = useState("IDLE");

    useEffect(() => {
        const handleSimulationRunChange = (event) => {
            const runId = event.detail?.runId ?? null;

            setSimulationRunId(runId);

            if (!runId) {
                setSimulationStatus("IDLE");
            }
        };

        window.addEventListener(
            "simulation-run-change",
            handleSimulationRunChange
        );

        return () => {
            window.removeEventListener(
                "simulation-run-change",
                handleSimulationRunChange
            );
        };
    }, []);

    useEffect(() => {
        if (!simulationRunId) {
            setSimulationStatus("IDLE");
            return;
        }

        const loadSimulationStatus = async () => {
            try {
                const current = await simulationRunApi.getStatus(
                    simulationRunId
                );

                setSimulationStatus(current?.status ?? "IDLE");
            } catch (error) {
                console.warn(
                    "사이드바 시뮬레이션 상태 조회 실패:",
                    error.message
                );

                setSimulationStatus("IDLE");
            }
        };

        loadSimulationStatus();
    }, [simulationRunId]);

    const simulationSubscriptions = simulationRunId
        ? {
            [TOPICS.SIMULATION_RUNS]: (run) => {
                if (run.simulationRunId !== simulationRunId) {
                    return;
                }

                setSimulationStatus(run.status ?? "IDLE");
            },
        }
        : {};

    useStompSubscriptions(
        simulationSubscriptions,
        Boolean(simulationRunId)
    );

    const isSimulationRunning =
        RUNNING_SIMULATION_STATUSES.includes(simulationStatus);

    const handleLogout = () => {
        const isLogout = window.confirm("로그아웃 하시겠습니까?");

        if (!isLogout) {
            return;
        }

        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        localStorage.removeItem("testUser");
        localStorage.removeItem("simulationRunId");
        localStorage.removeItem("loginType");

        sessionStorage.removeItem("simulationRunId");
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
                            로봇 관리
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/warehouse"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            창고 관리
                        </NavLink>
                    </li>

                    <li>
                        <NavLink
                            to="/operation"
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? " active" : ""}`
                            }
                        >
                            대시보드
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

            <div className="sidebar-bottom">
                <section
                    className={`sidebar-simulation-status ${isSimulationRunning ? "is-running" : "is-idle"
                        }`}
                >
                    <span className="sidebar-simulation-status__label">
                        SIMULATION STATUS
                    </span>

                    <div className="sidebar-simulation-status__state">
                        <span className="sidebar-simulation-status__indicator" />

                        <span className="sidebar-simulation-status__text">
                            {isSimulationRunning ? "RUNNING" : "IDLE"}
                        </span>
                    </div>
                </section>

                <div className="sidebar-logout">
                    <button
                        type="button"
                        className="sidebar-logout-button"
                        onClick={handleLogout}
                    >
                        로그아웃
                    </button>
                </div>
            </div>
        </aside>
    );
}

export default Sidebar;
