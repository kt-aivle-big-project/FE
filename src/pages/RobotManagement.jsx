import { useEffect, useMemo, useState } from "react";
import "../styles/RobotManagement.css";

import robotsData from "../data/robots.json";
import tasksData from "../data/tasks.json";

const API_URL = "http://localhost:8080/api";

function RobotManagement() {

    // 로봇 / 작업
    const [robots, setRobots] = useState([]);
    const [tasks, setTasks] = useState([]);

    const [selectedRobot, setSelectedRobot] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isDetailLoading, setIsDetailLoading] = useState(false);


    // 검색 / 필터
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");


    // 로봇 등록 
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newRobot, setNewRobot] = useState({
        robotId: "",
        name: "",
        battery: 100,
        x: 0,
        y: 0,
    });

    // 로봇 상태
    const getRobotStatus = (status) => {
        switch (status) {
            case "IDLE":
                return {
                    label: "대기",
                    className: "status-idle",
                };

            case "AVAILABLE":
                return {
                    label: "사용 가능",
                    className: "status-idle",
                };

            case "MOVING":
                return {
                    label: "이동 중",
                    className: "status-working",
                };

            case "WORKING":
            case "BUSY":
                return {
                    label: "작업 중",
                    className: "status-working",
                };

            case "CHARGING":
                return {
                    label: "충전 중",
                    className: "status-charging",
                };

            case "ERROR":
            case "FAULT":
                return {
                    label: "오류",
                    className: "status-error",
                };

            case "OFFLINE":
                return {
                    label: "오프라인",
                    className: "status-offline",
                };

            default:
                return {
                    label: status || "-",
                    className: "status-default",
                };
        }
    };

    // 작업 상태
    const getTaskStatusLabel = (status) => {
        switch (status) {
            case "PENDING":
                return "대기";

            case "ASSIGNED":
                return "배정";

            case "IN_PROGRESS":
                return "진행 중";

            case "COMPLETED":
                return "완료";

            case "FAILED":
                return "실패";

            default:
                return status || "-";
        }
    };


    // 작업 유형
    const getTaskTypeLabel = (taskType) => {
        switch (taskType) {
            case "INBOUND":
                return "입고";

            case "OUTBOUND":
                return "출고";

            case "CHARGING":
                return "충전";

            case "RELOCATION":
                return "재배치";

            case "REPLENISHMENT":
                return "보충";

            default:
                return taskType || "-";
        }
    };

    // 로봇의 현재 작업 찾기
    // 진행 중 작업 우선 없으면 배정된 작업
    const getCurrentTask = (robotId, taskList = tasks) => {
        const robotTasks = taskList.filter((task) => task.robotId === robotId);
        const inProgressTask = robotTasks.find((task) => task.status === "IN_PROGRESS");

        if (inProgressTask) {
            return inProgressTask;
        }

        const assignedTask = robotTasks.find((task) => task.status === "ASSIGNED");

        return assignedTask || null;
    };

    // 전체 로봇 조회 (/api/robots 붙여야 함)
    const fetchRobots = async () => {
        return robotsData;
    };

    // 전체 작업 조회 (/api/tasks 붙여야 함)
    const fetchTasks = async () => {
        return tasksData;
    };

    // 로봇 상세 조회 (/api/robots/{robotId} 붙여야 함)
    const fetchRobotDetail = async (robotId) => {
        const robot = robotsData.find((robot) => robot.robotId === robotId);

        if (!robot) {
            throw new Error("로봇을 찾을 수 없습니다.");
        }

        return robot;
    };

    // 작업 상세 조회 (/api/tasks/{taskId} 붙여야 됨)
    const fetchTaskDetail = async (taskId) => {
        const task = tasksData.find((task) => task.id === taskId);

        if (!task) {
            throw new Error("작업을 찾을 수 없습니다.");
        }

        return task;
    };

    // 선택한 로봇 상세 조회
    const loadRobotDetail = async (robotId, taskList = tasks) => {
        try {
            setIsDetailLoading(true);

            const robotData = await fetchRobotDetail(robotId);
            setSelectedRobot(robotData);

            const currentTask = getCurrentTask(robotId, taskList);

            if (!currentTask) {
                setSelectedTask(null);
                return;
            }

            // 로봇 상세 조회 API 사용
            try {
                const taskData = await fetchTaskDetail(currentTask.id);
                setSelectedTask(taskData);
            } catch (taskError) {

                console.error("작업 상세 조회 실패:", taskError);

                // 상세 조회 실패 시 전체 작업 조회 API로 표시
                //
                setSelectedTask(currentTask);
            }
        } catch (error) {
            console.error("로봇 상세 조회 실패:", error);
            alert(error.message || "로봇 정보를 불러오지 못했습니다.");

        } finally {
            setIsDetailLoading(false);
        }
    };

    // 페이지 전체 데이터 조회
    const fetchPageData = async (preferredRobotId = null) => {
        try {
            setIsLoading(true);

            const [robotList, taskList,] = await Promise.all([
                fetchRobots(),
                fetchTasks(),
            ]);

            setRobots(robotList);
            setTasks(taskList);

            if (robotList.length === 0) {
                setSelectedRobot(null);
                setSelectedTask(null);

                return;
            }

            let targetRobotId = preferredRobotId;

            const preferredExists = targetRobotId && robotList.some(
                (robot) => robot.robotId === Number(targetRobotId)
            );

            if (!preferredExists) {
                const currentSelectedExists = selectedRobot && robotList.some(
                    (robot) => robot.robotId === selectedRobot.robotId
                );

                targetRobotId = currentSelectedExists
                    ? selectedRobot.robotId
                    : robotList[0].robotId;
            }

            await loadRobotDetail(Number(targetRobotId), taskList);

        } catch (error) {
            console.error("로봇 관리 데이터 조회 실패:", error);
            alert(error.message || "데이터를 불러오지 못했습니다.");

        } finally {
            setIsLoading(false);
        }
    };

    // 최초 조회
    useEffect(() => {
        fetchPageData();
    }, []);

    // 로봇 선택
    const handleSelectRobot = (robotId) => {
        loadRobotDetail(robotId, tasks);
    };


    // 로봇 상태 필터 목록
    const statusOptions = useMemo(() => {
        return [
            ...new Set(
                robots.map((robot) => robot.status).filter(Boolean)
            ),
        ];
    }, [robots]);

    // 로봇 필터링
    const filteredRobots = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();

        return robots.filter((robot) => {
            const matchesSearch =
                !keyword ||
                robot.name
                    ?.toLowerCase()
                    .includes(keyword) ||
                String(robot.robotId).includes(keyword);

            const matchesStatus =
                statusFilter === "ALL" ||
                robot.status === statusFilter;

            return (matchesSearch && matchesStatus);
        });
    }, [robots, searchText, statusFilter,]);

    // 상태별 요약
    const statusSummary = useMemo(() => {
        const counts = {};

        robots.forEach((robot) => {
            const status = robot.status || "UNKNOWN";
            counts[status] = (counts[status] || 0) + 1;
        }
        );

        return counts;
    }, [robots]);

    // 필터 초기화
    const handleResetFilter = () => {
        setSearchText("");
        setStatusFilter("ALL");
    };

    // 로봇 등록 폼 입력값 변경 공통 함수
    const handleNewRobotChange = (field, value) => {
        setNewRobot((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);

        setNewRobot({
            robotId: "",
            name: "",
            battery: 100,
            x: 0,
            y: 0,
        });
    };

    // 로봇 등록 (/api/robots/{robotId} 붙여야 함)
    const handleAddRobot = () => {

        if (!newRobot.robotId) {
            alert("로봇 ID를 입력해주세요.");
            return;
        }

        if (!newRobot.name.trim()) {
            alert("로봇 이름을 입력해주세요.");
            return;
        }

        if (Number(newRobot.battery) < 0 || Number(newRobot.battery) > 100) {
            alert("배터리는 0~100 사이로 입력해주세요.");
            return;
        }

        const robotId = Number(newRobot.robotId);
        const duplicatedRobot = robots.some((robot) => robot.robotId === robotId);

        if (duplicatedRobot) {
            alert("이미 존재하는 로봇 ID입니다.");
            return;
        }

        const robotData = {
            robotId,
            name: newRobot.name.trim(),
            status: "IDLE",
            battery: Number(newRobot.battery),
            x: Number(newRobot.x),
            y: Number(newRobot.y),
        };

        setRobots((prev) => [
            ...prev,
            robotData,
        ]);

        setSelectedRobot(robotData);
        setSelectedTask(null);

        setNewRobot({
            robotId: "",
            name: "",
            battery: 100,
            x: 0,
            y: 0,
        });

        setIsAddModalOpen(false);
    };

    return (
        <div className="robot-management-wrapper">

            {/* Header */}
            <header className="robot-management-header">
                <div>
                    <h1 className="robot-management-title">
                        로봇 관리
                    </h1>

                    <p className="robot-management-description">
                        창고에 등록된 로봇 상태, 현재 위치, 작업 확인
                    </p>
                </div>

                <div className="robot-management-header-buttons">
                    <button
                        type="button"
                        className="robot-management-button"
                        disabled={isLoading}
                        onClick={() => fetchPageData()}
                    >
                        {isLoading ? "조회 중..." : "새로고침"}
                    </button>

                    <button
                        type="button"
                        className="robot-management-button primary"
                        onClick={() => setIsAddModalOpen(true)}
                    >
                        + 로봇 등록
                    </button>
                </div>
            </header>

            {/* 로봇 요약 */}
            <section className="robot-summary">
                <div className="robot-summary-card">

                    <span className="robot-summary-label">
                        전체 로봇
                    </span>

                    <strong className="robot-summary-value">
                        {robots.length}
                    </strong>

                </div>

                {Object.entries(statusSummary).map(([status, count]) => (
                    <div
                        key={status}
                        className="robot-summary-card"
                    >
                        <span className="robot-summary-label">
                            {getRobotStatus(status).label}
                        </span>

                        <strong className="robot-summary-value">
                            {count}
                        </strong>
                    </div>
                ))}
            </section>

            <div className="robot-filter-row">
                {/* 검색 */}
                <section className="robot-filter">
                    <input
                        type="text"
                        className="robot-filter-search"
                        placeholder="로봇 이름 또는 ID 검색"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)
                        }
                    />

                    <select
                        className="robot-filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >

                        <option value="ALL">전체 상태</option>
                        {statusOptions.map((status) => (
                            <option
                                key={status}
                                value={status}
                            >
                                {getRobotStatus(status).label}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        className="robot-filter-reset"
                        onClick={handleResetFilter}
                    >
                        초기화
                    </button>
                </section>

                <section className="robot-info">
                    내용 추가
                </section>
            </div>


            {/* 로봇 목록 */}
            <section className="robot-list">
                <div className="robot-section-header">
                    <h2>로봇 목록</h2>

                    <span>총 {filteredRobots.length}대</span>
                </div>

                <div className="robot-table-wrapper">
                    <table className="robot-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>이름</th>
                                <th>상태</th>
                                <th>배터리</th>
                                <th>현재 위치</th>
                                <th>현재 작업</th>
                                <th>내용 추가</th>
                            </tr>
                        </thead>

                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td
                                        colSpan="6"
                                        className="robot-table-message"
                                    >
                                        로봇 정보를 불러오는 중입니다.
                                    </td>
                                </tr>

                            ) : filteredRobots.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="6"
                                        className="robot-table-message"
                                    >
                                        조건에 맞는 로봇이 없습니다.
                                    </td>
                                </tr>

                            ) : (
                                filteredRobots.map((robot) => {
                                    const currentTask = getCurrentTask(robot.robotId);

                                    return (
                                        <tr
                                            key={robot.robotId}
                                            className={selectedRobot
                                                ?.robotId === robot.robotId
                                                ? "selected"
                                                : ""
                                            }
                                            onClick={() => handleSelectRobot(robot.robotId)}
                                        >
                                            <td>{robot.robotId}</td>

                                            <td className="robot-name">{robot.name}</td>

                                            <td>
                                                <span
                                                    className={`robot-status ${getRobotStatus(robot.status).className}`}
                                                >
                                                    {getRobotStatus(robot.status).label}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="robot-battery">
                                                    <span>{robot.battery}%</span>
                                                    <div className="robot-battery-track">
                                                        <div
                                                            className="robot-battery-fill"
                                                            style={{
                                                                width: `${Math.max(0,
                                                                    Math.min(100,
                                                                        Number(robot.battery ?? 0)
                                                                    ))}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            <td>({robot.x}, {robot.y})</td>

                                            <td>
                                                {currentTask ? (
                                                    <div className="robot-current-task">
                                                        <strong>
                                                            Task #{currentTask.id}
                                                        </strong>

                                                        <span>
                                                            {getTaskTypeLabel(
                                                                currentTask.taskType
                                                            )}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    "-"
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </section>


            {/* 로봇 상세 정보 조회 */}
            <aside className="robot-detail">
                <div className="robot-section-header">
                    <h2>로봇 상세</h2>
                </div>

                {isDetailLoading ? (
                    <div className="robot-detail-empty">
                        로봇 정보를 불러오는 중입니다.
                    </div>

                ) : !selectedRobot ? (
                    <div className="robot-detail-empty">
                        로봇을 선택해주세요.
                    </div>

                ) : (
                    <div className="robot-detail-content">

                        {/* 로봇 이름 / 상태 */}
                        <div className="robot-detail-main">
                            <div>
                                <span className="robot-detail-id">
                                    Robot ID {selectedRobot.robotId}
                                </span>

                                <div className="robot-detail-name">
                                    {selectedRobot.name}
                                </div>
                            </div>

                            <span
                                className={`robot-status ${getRobotStatus(selectedRobot.status).className}`}
                            >
                                {getRobotStatus(selectedRobot.status).label}
                            </span>
                        </div>

                        {/* 현재 상태 */}
                        <div className="robot-detail-section">
                            <h3>현재 상태</h3>

                            <div className="robot-detail-item">
                                <span>상태</span>
                                <strong>{getRobotStatus(selectedRobot.status).label}</strong>
                            </div>

                            <div className="robot-detail-item">
                                <span>배터리</span>
                                <strong>{selectedRobot.battery}%</strong>
                            </div>

                            <div className="robot-detail-battery-track">
                                <div
                                    className="robot-detail-battery-fill"
                                    style={{
                                        width: `${Math.max(0,
                                            Math.min(100,
                                                Number(selectedRobot.battery ?? 0)
                                            ))}%`,
                                    }}
                                />
                            </div>

                            <div className="robot-detail-item">
                                <span>현재 위치</span>
                                <strong>({selectedRobot.x}, {selectedRobot.y})</strong>
                            </div>
                        </div>

                        {/* 현재 작업 */}
                        <div className="robot-detail-section">
                            <h3>현재 작업</h3>

                            {!selectedTask ? (
                                <div className="robot-detail-no-task">
                                    현재 수행 중인 작업이 없습니다.
                                </div>
                            ) : (
                                <>
                                    <div className="robot-task-title">
                                        <strong>Task #{selectedTask.id}</strong>

                                        <span
                                            className={`task-status task-${selectedTask.status
                                                ?.toLowerCase()
                                                .replaceAll("_", "-")
                                                }`}
                                        >
                                            {getTaskStatusLabel(selectedTask.status)}
                                        </span>
                                    </div>

                                    <div className="robot-detail-item">
                                        <span>작업 유형</span>
                                        <strong>{getTaskTypeLabel(selectedTask.taskType)}</strong>
                                    </div>

                                    <div className="robot-detail-item">
                                        <span>출발 노드</span>
                                        <strong>{selectedTask.startNodeId ?? "-"}</strong>
                                    </div>

                                    <div className="robot-detail-item">
                                        <span>도착 노드</span>
                                        <strong>{selectedTask.endNodeId ?? "-"}</strong>
                                    </div>

                                    <div className="robot-detail-item">
                                        <span>작업 상태</span>
                                        <strong>{getTaskStatusLabel(selectedTask.status)}</strong>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 기본 정보 */}
                        <div className="robot-detail-section">
                            <h3>기본 정보</h3>

                            <div className="robot-detail-item">
                                <span>로봇 ID</span>
                                <strong>{selectedRobot.robotId}</strong>
                            </div>

                            <div className="robot-detail-item">
                                <span>로봇 이름</span>
                                <strong>{selectedRobot.name}</strong>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* 로봇 등록 팝업창 */}
            {isAddModalOpen && (
                <div className="robot-modal-overlay">
                    <div className="robot-modal">
                        <div className="robot-modal-header">
                            <h2>로봇 등록</h2>

                            <button
                                type="button"
                                className="robot-modal-close"
                                onClick={handleCloseModal}
                            >
                                ×
                            </button>

                        </div>
                        <div className="robot-modal-content">
                            <label className="robot-modal-field">
                                <span>로봇 ID</span>

                                <input
                                    type="number"
                                    min="1"
                                    placeholder="예: 1"
                                    value={newRobot.robotId}
                                    onChange={(e) => handleNewRobotChange(
                                        "robotId",
                                        e.target.value
                                    )}
                                />
                            </label>

                            <label className="robot-modal-field">
                                <span>로봇 이름</span>

                                <input
                                    type="text"
                                    placeholder="예: R1"
                                    value={newRobot.name}
                                    onChange={(e) => handleNewRobotChange(
                                        "name",
                                        e.target.value
                                    )}
                                />
                            </label>

                            <label className="robot-modal-field">
                                <span>초기 배터리</span>

                                <div className="robot-modal-input-unit">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={newRobot.battery}
                                        onChange={(e) => handleNewRobotChange(
                                            "battery",
                                            e.target.value
                                        )}
                                    />
                                    <span>%</span>
                                </div>
                            </label>

                            <div className="robot-modal-position">
                                <label className="robot-modal-field">
                                    <span>초기 X 좌표</span>

                                    <input
                                        type="number"
                                        value={newRobot.x}
                                        onChange={(e) => handleNewRobotChange(
                                            "x",
                                            e.target.value
                                        )}
                                    />
                                </label>

                                <label className="robot-modal-field">
                                    <span>초기 Y 좌표</span>
                                    <input
                                        type="number"
                                        value={newRobot.y}
                                        onChange={(e) => handleNewRobotChange(
                                            "y",
                                            e.target.value
                                        )}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="robot-modal-actions">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                className="primary"
                                onClick={handleAddRobot}
                            >
                                등록
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RobotManagement;