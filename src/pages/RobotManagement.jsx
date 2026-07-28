import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/RobotManagement.css";
import {
    robotApi,
    robotSpecApi,
    simulationRunApi,
    taskApi,
    warehouseApi,
} from "../api/client";
import { TOPICS } from "../api/config";
import useStompSubscriptions from "../hooks/useStompSubscriptions";

const SUMMARY_GROUPS = [
    { key: "AVAILABLE", label: "사용 가능", statuses: ["AVAILABLE"] },
    { key: "UNAVAILABLE", label: "사용 불가", statuses: ["UNAVAILABLE"] },
    { key: "IDLE", label: "대기", statuses: ["IDLE"] },
    { key: "MOVING", label: "이동 중", statuses: ["MOVING"] },
    {
        key: "WORKING",
        label: "작업 중",
        statuses: [
            "ASSIGNED",
            "WORKING",
            "BUSY",
            "PICKING",
            "PUTAWAY",
            "REPLENISH",
            "RELOCATION",
        ],
    },
    { key: "CHARGING", label: "충전 중", statuses: ["CHARGING"] },
    { key: "ERROR", label: "오류", statuses: ["ERROR", "FAULT"] },
    { key: "OFFLINE", label: "오프라인", statuses: ["OFFLINE"] },
];

const mergeRobotState = (robot, runtimeStates, nodeCodes) => {
    const runtime = runtimeStates[robot.id];
    const nodeId = runtime?.currentNodeId ?? robot.nodeId;

    return {
        ...robot,
        nodeId,
        nodeCode:
            runtime?.currentNodeCode
            ?? nodeCodes[nodeId]
            ?? null,
        battery: runtime?.batteryLevel ?? robot.battery,
        status: runtime?.status ?? robot.status,
        currentTaskId: runtime?.currentTaskId ?? null,
        hasRuntimeState: Boolean(runtime),
    };
};

const findCurrentTask = (robot, taskList) => {
    if (!robot) {
        return null;
    }

    if (robot.hasRuntimeState) {
        return taskList.find(
            (task) => task.id === robot.currentTaskId
        ) ?? null;
    }

    const robotTasks = taskList.filter((task) => task.robotId === robot.id);
    return robotTasks.find((task) => task.status === "IN_PROGRESS")
        ?? robotTasks.find((task) => task.status === "ASSIGNED")
        ?? null;
};

function RobotManagement() {

    // 로봇 / 작업
    const [robots, setRobots] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [robotSpecs, setRobotSpecs] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [warehouseNodes, setWarehouseNodes] = useState([]);
    const [nodeCodes, setNodeCodes] = useState({});
    const [runtimeStates, setRuntimeStates] = useState({});
    const simulationRunId = Number(
        localStorage.getItem("simulationRunId")
    ) || null;

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
        robotSpecId: "",
        warehouseId: "",
        nodeId: "",
        battery: 100,
        status: "AVAILABLE",
    });

    const robotSpecCodes = useMemo(
        () => Object.fromEntries(
            robotSpecs.map((spec) => [spec.id, spec.robotCode])
        ),
        [robotSpecs]
    );

    const applyRuntimeState = useCallback((state) => {
        setRuntimeStates((prev) => ({
            ...prev,
            [state.robotId]: state,
        }));
    }, []);

    const applyTask = useCallback((task) => {
        if (task.simulationRunId !== simulationRunId) {
            return;
        }

        setTasks((prev) => {
            const exists = prev.some((item) => item.id === task.id);

            return exists
                ? prev.map((item) => item.id === task.id ? task : item)
                : [task, ...prev];
        });
    }, [simulationRunId]);

    const robotViews = useMemo(
        () => robots.map((robot) =>
            mergeRobotState(robot, runtimeStates, nodeCodes)
        ),
        [robots, runtimeStates, nodeCodes]
    );

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

            case "ASSIGNED":
                return {
                    label: "작업 배정",
                    className: "status-working",
                };

            case "WORKING":
            case "BUSY":
            case "PICKING":
            case "PUTAWAY":
            case "REPLENISH":
            case "RELOCATION":
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
            case "CHARGE":
                return "충전";

            case "MOVE":
                return "이동";

            case "RELOCATION":
                return "재배치";

            case "REPLENISHMENT":
                return "보충";

            default:
                return taskType || "-";
        }
    };

    // 전체 로봇 조회 (/api/robots 붙여야 함)
    const fetchRobots = async () => {
        return robotApi.getAll();
    };

    // 전체 작업 조회 (/api/tasks 붙여야 함)
    const fetchTasks = async () => {
        return taskApi.getAll();
    };

    // 로봇 상세 조회 (/api/robots/{robotId} 붙여야 함)
    const fetchRobotDetail = async (robotId) => {
        return robotApi.get(robotId);
    };

    // 작업 상세 조회 (/api/tasks/{taskId} 붙여야 됨)
    const fetchTaskDetail = async (taskId) => {
        return taskApi.get(taskId);
    };

    // 선택한 로봇 상세 조회
    const loadRobotDetail = async (robotId, taskList = tasks) => {
        try {
            setIsDetailLoading(true);

            const robotData = await fetchRobotDetail(robotId);
            setSelectedRobot(robotData);

            const robotView = mergeRobotState(
                robotData,
                runtimeStates,
                nodeCodes
            );
            const currentTask = findCurrentTask(robotView, taskList);

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

            const [robotList, taskList, specList, warehouseList] = await Promise.all([
                fetchRobots(),
                fetchTasks(),
                robotSpecApi.getAll(),
                warehouseApi.getAll(),
            ]);

            setRobots(robotList);
            setTasks(taskList);
            setRobotSpecs(specList);
            setWarehouses(warehouseList);

            const layoutResults = await Promise.allSettled(
                warehouseList.map((warehouse) =>
                    warehouseApi.getLayout(warehouse.id)
                )
            );
            const allNodes = layoutResults.flatMap((result) =>
                result.status === "fulfilled"
                    ? result.value.nodes ?? []
                    : []
            );
            setNodeCodes(
                Object.fromEntries(
                    allNodes.map((node) => [node.id, node.nodeCode])
                )
            );

            if (robotList.length === 0) {
                setSelectedRobot(null);
                setSelectedTask(null);

                return;
            }

            let targetRobotId = preferredRobotId;

            const preferredExists = targetRobotId && robotList.some(
                (robot) => robot.id === Number(targetRobotId)
            );

            if (!preferredExists) {
                const currentSelectedExists = selectedRobot && robotList.some(
                    (robot) => robot.id === selectedRobot.id
                );

                targetRobotId = currentSelectedExists
                    ? selectedRobot.id
                    : robotList[0].id;
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
        // 최초 마운트에서만 전체 데이터를 조회한다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!simulationRunId) {
            setRuntimeStates({});
            return;
        }

        const fetchRuntimeStates = async () => {
            try {
                const snapshot =
                    await simulationRunApi.getRobotStates(simulationRunId);

                setRuntimeStates(
                    Object.fromEntries(
                        (snapshot.robots ?? []).map((state) => [
                            state.robotId,
                            state,
                        ])
                    )
                );
            } catch (error) {
                console.error("로봇 실시간 상태 조회 실패:", error);
            }
        };

        fetchRuntimeStates();
    }, [simulationRunId]);

    const runtimeSubscriptions = simulationRunId
        ? {
            [TOPICS.runRobots(simulationRunId)]: applyRuntimeState,
            [TOPICS.TASKS]: applyTask,
        }
        : {};

    useStompSubscriptions(
        runtimeSubscriptions,
        Boolean(simulationRunId)
    );

    // 로봇 선택
    const handleSelectRobot = (robotId) => {
        loadRobotDetail(robotId, tasks);
    };


    // 로봇 필터링
    const filteredRobots = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();

        return robotViews.filter((robot) => {
            const matchesSearch =
                !keyword ||
                (robotSpecCodes[robot.robotSpecId]
                    ?? `Spec #${robot.robotSpecId}`)
                    ?.toLowerCase()
                    .includes(keyword) ||
                String(robot.id).includes(keyword);

            const selectedStatusGroup = SUMMARY_GROUPS.find(
                (group) => group.key === statusFilter
            );
            const matchesStatus =
                statusFilter === "ALL" ||
                selectedStatusGroup?.statuses.includes(robot.status);

            return (matchesSearch && matchesStatus);
        });
    }, [robotViews, robotSpecCodes, searchText, statusFilter]);

    // 상태별 요약
    const statusSummary = useMemo(() => {
        return SUMMARY_GROUPS.map((group) => ({
            ...group,
            count: robotViews.filter((robot) =>
                group.statuses.includes(robot.status)
            ).length,
        }));
    }, [robotViews]);

    const selectedRobotView = useMemo(
        () => selectedRobot
            ? mergeRobotState(selectedRobot, runtimeStates, nodeCodes)
            : null,
        [selectedRobot, runtimeStates, nodeCodes]
    );

    useEffect(() => {
        const currentTask = findCurrentTask(selectedRobotView, tasks);

        if (currentTask || !selectedRobotView?.currentTaskId) {
            setSelectedTask(currentTask);
            return;
        }

        let cancelled = false;

        taskApi.get(selectedRobotView.currentTaskId)
            .then((task) => {
                if (!cancelled) {
                    setSelectedTask(task);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error("현재 작업 조회 실패:", error);
                    setSelectedTask(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [selectedRobotView, tasks]);

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
            robotSpecId: "",
            warehouseId: "",
            nodeId: "",
            battery: 100,
            status: "AVAILABLE",
        });
        setWarehouseNodes([]);
    };

    const handleWarehouseChange = async (warehouseId) => {
        handleNewRobotChange("warehouseId", warehouseId);
        handleNewRobotChange("nodeId", "");

        if (!warehouseId) {
            setWarehouseNodes([]);
            return;
        }

        try {
            const layout = await warehouseApi.getLayout(Number(warehouseId));
            setWarehouseNodes(layout.nodes ?? []);
        } catch (error) {
            console.error("창고 노드 조회 실패:", error);
            setWarehouseNodes([]);
            alert(error.message || "창고 노드를 불러오지 못했습니다.");
        }
    };

    // 로봇 등록 (POST /api/robots)
    const handleAddRobot = async () => {

        if (!newRobot.robotSpecId) {
            alert("로봇 스펙을 선택해주세요.");
            return;
        }

        if (!newRobot.warehouseId) {
            alert("창고를 선택해주세요.");
            return;
        }

        if (!newRobot.nodeId) {
            alert("초기 노드를 선택해주세요.");
            return;
        }

        if (Number(newRobot.battery) < 0 || Number(newRobot.battery) > 100) {
            alert("배터리는 0~100 사이로 입력해주세요.");
            return;
        }

        const robotData = {
            robotSpecId: Number(newRobot.robotSpecId),
            warehouseId: Number(newRobot.warehouseId),
            nodeId: Number(newRobot.nodeId),
            battery: Number(newRobot.battery),
            status: newRobot.status,
        };

        try {
            setIsLoading(true);

            const createdRobot = await robotApi.create(robotData);
            await fetchPageData(createdRobot.id);
            handleCloseModal();
        } catch (error) {
            console.error("로봇 등록 실패:", error);
            alert(error.message || "로봇을 등록하지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
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

                {statusSummary.map(({ key, label, count }) => (
                    <div
                        key={key}
                        className="robot-summary-card"
                    >
                        <span className="robot-summary-label">
                            {label}
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
                        {SUMMARY_GROUPS.map(({ key, label }) => (
                            <option
                                key={key}
                                value={key}
                            >
                                {label}
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
                                        colSpan="7"
                                        className="robot-table-message"
                                    >
                                        로봇 정보를 불러오는 중입니다.
                                    </td>
                                </tr>

                            ) : filteredRobots.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="7"
                                        className="robot-table-message"
                                    >
                                        조건에 맞는 로봇이 없습니다.
                                    </td>
                                </tr>

                            ) : (
                                filteredRobots.map((robot) => {
                                    const currentTask = findCurrentTask(robot, tasks);

                                    return (
                                        <tr
                                            key={robot.id}
                                            className={selectedRobot
                                                ?.id === robot.id
                                                ? "selected"
                                                : ""
                                            }
                                            onClick={() => handleSelectRobot(robot.id)}
                                        >
                                            <td>{robot.id}</td>

                                            <td className="robot-name">
                                                {robotSpecCodes[robot.robotSpecId]
                                                    ?? `Spec #${robot.robotSpecId}`}
                                            </td>

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

                                            <td>
                                                {robot.nodeCode
                                                    ?? `Node #${robot.nodeId}`}
                                            </td>

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
                                    Robot ID {selectedRobotView.id}
                                </span>

                                <div className="robot-detail-name">
                                    {robotSpecCodes[selectedRobotView.robotSpecId]
                                        ?? `Spec #${selectedRobotView.robotSpecId}`}
                                </div>
                            </div>

                            <span
                                className={`robot-status ${getRobotStatus(selectedRobotView.status).className}`}
                            >
                                {getRobotStatus(selectedRobotView.status).label}
                            </span>
                        </div>

                        {/* 현재 상태 */}
                        <div className="robot-detail-section">
                            <h3>현재 상태</h3>

                            <div className="robot-detail-item">
                                <span>상태</span>
                                <strong>{getRobotStatus(selectedRobotView.status).label}</strong>
                            </div>

                            <div className="robot-detail-item">
                                <span>배터리</span>
                                <strong>{selectedRobotView.battery}%</strong>
                            </div>

                            <div className="robot-detail-battery-track">
                                <div
                                    className="robot-detail-battery-fill"
                                    style={{
                                        width: `${Math.max(0,
                                            Math.min(100,
                                                Number(selectedRobotView.battery ?? 0)
                                            ))}%`,
                                    }}
                                />
                            </div>

                            <div className="robot-detail-item">
                                <span>현재 노드</span>
                                <strong>
                                    {selectedRobotView.nodeCode
                                        ?? `Node #${selectedRobotView.nodeId}`}
                                </strong>
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
                                <strong>{selectedRobotView.id}</strong>
                            </div>

                            <div className="robot-detail-item">
                                <span>로봇 이름</span>
                                <strong>
                                    {robotSpecCodes[selectedRobotView.robotSpecId]
                                        ?? `Spec #${selectedRobotView.robotSpecId}`}
                                </strong>
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
                                <span>로봇 스펙</span>

                                <select
                                    value={newRobot.robotSpecId}
                                    onChange={(e) => handleNewRobotChange(
                                        "robotSpecId",
                                        e.target.value
                                    )}
                                >
                                    <option value="">로봇 스펙 선택</option>
                                    {robotSpecs.map((spec) => (
                                        <option key={spec.id} value={spec.id}>
                                            {spec.robotCode}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="robot-modal-field">
                                <span>창고</span>

                                <select
                                    value={newRobot.warehouseId}
                                    onChange={(e) => handleWarehouseChange(e.target.value)}
                                >
                                    <option value="">창고 선택</option>
                                    {warehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.name}
                                        </option>
                                    ))}
                                </select>
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

                            <label className="robot-modal-field">
                                <span>초기 노드</span>

                                <select
                                    value={newRobot.nodeId}
                                    disabled={!newRobot.warehouseId}
                                    onChange={(e) => handleNewRobotChange(
                                        "nodeId",
                                        e.target.value
                                    )}
                                >
                                    <option value="">노드 선택</option>
                                    {warehouseNodes.map((node) => (
                                        <option key={node.id} value={node.id}>
                                            {node.nodeCode} (ID: {node.id})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="robot-modal-field">
                                <span>초기 상태</span>

                                <select
                                    value={newRobot.status}
                                    onChange={(e) => handleNewRobotChange(
                                        "status",
                                        e.target.value
                                    )}
                                >
                                    <option value="AVAILABLE">사용 가능</option>
                                    <option value="UNAVAILABLE">사용 불가</option>
                                </select>
                            </label>
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
