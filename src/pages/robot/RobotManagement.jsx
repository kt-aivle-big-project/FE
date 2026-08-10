import { useCallback, useEffect, useMemo, useState } from "react";
import "../../styles/robot/robotManagement.css";
import {
    robotApi,
    robotSpecApi,
    simulationRunApi,
    taskApi,
    warehouseApi,
} from "../../api/client";
import { TOPICS } from "../../api/config";
import useStompSubscriptions from "../../hooks/useStompSubscriptions";

const SUMMARY_GROUPS = [
    {
        key: "AVAILABLE",
        label: "사용 가능",
        statuses: ["AVAILABLE", "IDLE"],
        tone: "available",
    },
    {
        key: "WORKING",
        label: "작업 중",
        statuses: [
            "ASSIGNED",
            "WORKING",
            "BUSY",
            "MOVING",
            "PICKING",
            "PUTAWAY",
            "REPLENISH",
            "RELOCATION",
        ],
        tone: "working",
    },
    {
        key: "CHARGING",
        label: "충전 중",
        statuses: ["CHARGING"],
        tone: "charging",
    },
    {
        key: "UNAVAILABLE",
        label: "사용 불가",
        statuses: ["UNAVAILABLE"],
        tone: "unavailable",
    },
    {
        key: "OFFLINE",
        label: "오프라인",
        statuses: ["OFFLINE"],
        tone: "offline",
    },
    {
        key: "ERROR",
        label: "오류",
        statuses: ["ERROR", "FAULT"],
        tone: "error",
    },
];

// 시뮬레이션 화면에서 고른 창고를 그대로 이어받는다.
// 두 화면이 같은 키를 쓰면 창고를 한 번만 고르면 된다.
const WAREHOUSE_ID_KEY = "selectedWarehouseId";

// 창고 필터는 "ALL"(전체) 또는 창고 ID 문자열을 값으로 쓴다.
const readSelectedWarehouseId = () => {
    const saved = Number(localStorage.getItem(WAREHOUSE_ID_KEY));
    return Number.isFinite(saved) && saved > 0 ? String(saved) : "ALL";
};

const mergeRobotState = (robot, runtimeStates, nodeDetails) => {
    const runtime = runtimeStates[robot.id];
    const nodeId = runtime?.currentNodeId ?? robot.nodeId;
    const node = nodeDetails[nodeId];

    return {
        ...robot,
        nodeId,
        warehouseId:
            runtime?.warehouseId
            ?? runtime?.currentWarehouseId
            ?? robot.warehouseId
            ?? robot.warehouse?.id
            ?? node?.warehouseId
            ?? null,
        nodeCode:
            runtime?.currentNodeCode
            ?? node?.nodeCode
            ?? robot.nodeCode
            ?? null,
        battery: runtime?.batteryLevel ?? robot.battery,
        status: runtime?.status ?? robot.status,
        currentTaskId: runtime?.currentTaskId ?? robot.currentTaskId ?? null,
        hasRuntimeState: Boolean(runtime),
    };
};

const findCurrentTask = (robot, taskList) => {
    if (!robot) {
        return null;
    }

    if (robot.currentTaskId) {
        const runtimeTask = taskList.find(
            (task) => task.id === robot.currentTaskId
        );

        if (runtimeTask) {
            return runtimeTask;
        }
    }

    const robotTasks = taskList.filter((task) => task.robotId === robot.id);
    return robotTasks.find((task) => task.status === "IN_PROGRESS")
        ?? robotTasks.find((task) => task.status === "ASSIGNED")
        ?? null;
};

const getRobotDisplayName = (robot) => {
    const explicitName = robot?.robotName
        ?? robot?.name
        ?? robot?.displayName
        ?? robot?.robotNumber;

    if (explicitName) {
        return explicitName;
    }

    return `Robot ${String(robot?.id ?? "").padStart(2, "0")}`;
};

const normalizePercent = (value, fallback = 1) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    return numericValue <= 1 ? numericValue * 100 : numericValue;
};

function RobotManagement() {
    const [robots, setRobots] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [robotSpecs, setRobotSpecs] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [warehouseNodes, setWarehouseNodes] = useState([]);
    const [nodeDetails, setNodeDetails] = useState({});
    const [runtimeStates, setRuntimeStates] = useState({});

    const simulationRunId = Number(
        localStorage.getItem("simulationRunId")
    ) || null;

    const [selectedRobot, setSelectedRobot] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    // 창고 필터. "ALL" 이면 전체 창고
    const [warehouseFilter, setWarehouseFilter] = useState(
        readSelectedWarehouseId
    );

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newRobot, setNewRobot] = useState({
        robotSpecId: "",
        warehouseId: "",
        nodeId: "",
        battery: 100,
        status: "AVAILABLE",
    });

    const robotSpecsById = useMemo(
        () => Object.fromEntries(
            robotSpecs.map((spec) => [spec.id, spec])
        ),
        [robotSpecs]
    );

    const warehouseNames = useMemo(
        () => Object.fromEntries(
            warehouses.map((warehouse) => [warehouse.id, warehouse.name])
        ),
        [warehouses]
    );

    // 이미 로봇이 서 있는 노드. 등록 화면에서 겹치는 자리를 알려준다.
    const occupiedNodeIds = useMemo(
        () => new Set(
            robots
                .map((robot) => robot.nodeId)
                .filter((nodeId) => nodeId != null)
        ),
        [robots]
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
            mergeRobotState(robot, runtimeStates, nodeDetails)
        ),
        [robots, runtimeStates, nodeDetails]
    );

    const getRobotStatus = (status) => {
        switch (status) {
            case "AVAILABLE":
            case "IDLE":
                return { label: "사용 가능", className: "status-available" };
            case "ASSIGNED":
            case "WORKING":
            case "BUSY":
            case "MOVING":
            case "PICKING":
            case "PUTAWAY":
            case "REPLENISH":
            case "RELOCATION":
                return { label: "작업 중", className: "status-working" };
            case "CHARGING":
                return { label: "충전 중", className: "status-charging" };
            case "UNAVAILABLE":
                return { label: "사용 불가", className: "status-unavailable" };
            case "OFFLINE":
                return { label: "오프라인", className: "status-offline" };
            case "ERROR":
            case "FAULT":
                return { label: "오류", className: "status-error" };
            default:
                return { label: status || "-", className: "status-default" };
        }
    };

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

    const getTaskTypeLabel = (taskType) => {
        switch (taskType) {
            case "GENERAL":
            case "NORMAL":
                return "일반 작업";
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
            case "REPLENISH":
                return "보충";
            default:
                return taskType || "일반 작업";
        }
    };

    const getRobotModel = (robot) => {
        return robotSpecsById[robot?.robotSpecId]?.robotCode
            ?? robot?.robotCode
            ?? `Spec #${robot?.robotSpecId ?? "-"}`;
    };

    const getNode = (robot) => nodeDetails[robot?.nodeId] ?? null;

    const getLocationLabel = (robot) => {
        const node = getNode(robot);
        const explicitLocation = robot?.currentLocationName
            ?? robot?.locationName
            ?? node?.name
            ?? node?.nodeName
            ?? node?.stationName;

        if (explicitLocation) {
            return explicitLocation;
        }

        const nodeCode = robot?.nodeCode ?? node?.nodeCode;
        const nodeType = String(
            node?.nodeType ?? node?.type ?? node?.category ?? ""
        ).toUpperCase();

        if (nodeCode && (
            nodeType.includes("CHARG")
            || nodeType.includes("STATION")
        )) {
            return `충전소 ${nodeCode}`;
        }

        return nodeCode ?? `Node #${robot?.nodeId ?? "-"}`;
    };

    const getTaskLabelForRobot = (robot) => {
        const currentTask = findCurrentTask(robot, tasks);
        return getTaskTypeLabel(
            currentTask?.taskType
            ?? robot?.taskCode
            ?? robot?.taskType
            ?? "GENERAL"
        );
    };

    // 창고를 고르면 그 창고에 배치된 로봇만 받아온다. null 이면 전체.
    const fetchRobots = async (warehouseId = null) =>
        robotApi.getAll(warehouseId ?? undefined);

    const fetchTasks = async () => taskApi.getAll();
    const fetchRobotDetail = async (robotId) => robotApi.get(robotId);
    const fetchTaskDetail = async (taskId) => taskApi.get(taskId);

    const loadRobotDetail = async (
        robotId,
        taskList = tasks,
        nodeDetailsOverride = nodeDetails
    ) => {
        try {
            setIsDetailLoading(true);

            const robotData = await fetchRobotDetail(robotId);
            setSelectedRobot(robotData);

            const robotView = mergeRobotState(
                robotData,
                runtimeStates,
                nodeDetailsOverride
            );
            const currentTask = findCurrentTask(robotView, taskList);

            if (!currentTask) {
                setSelectedTask(null);
                return;
            }

            try {
                const taskData = await fetchTaskDetail(currentTask.id);
                setSelectedTask(taskData);
            } catch (taskError) {
                console.error("작업 상세 조회 실패:", taskError);
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
    const fetchPageData = async (
        preferredRobotId = null,
        selectedWarehouseId = warehouseFilter
    ) => {
        try {
            setIsLoading(true);

            const warehouseId =
                selectedWarehouseId === "ALL" || selectedWarehouseId == null
                    ? null
                    : Number(selectedWarehouseId);

            const [robotList, taskList, specList, warehouseList] = await Promise.all([
                fetchRobots(warehouseId),
                fetchTasks(),
                robotSpecApi.getAll(),
                warehouseApi.getAll(),
            ]);

            setRobots(robotList);
            setTasks(taskList);
            setRobotSpecs(specList);
            setWarehouses(warehouseList);

            // 노드 정보는 화면에 보이는 로봇의 위치를 표시하는 데만 쓴다.
            // 창고를 고른 경우 그 창고 레이아웃만 받으면 된다.
            // (레이아웃 하나가 노드 168개 + 간선 265개라 전부 받으면 무겁다)
            const layoutTargets = warehouseId
                ? warehouseList.filter(
                    (warehouse) => warehouse.id === warehouseId
                )
                : warehouseList;

            const layoutResults = await Promise.allSettled(
                layoutTargets.map((warehouse) =>
                    warehouseApi.getLayout(warehouse.id)
                )
            );

            const allNodes = layoutResults.flatMap((result, index) => {
                if (result.status !== "fulfilled") {
                    return [];
                }

                return (result.value.nodes ?? []).map((node) => ({
                    ...node,
                    warehouseId:
                        node.warehouseId
                        ?? layoutTargets[index]?.id
                        ?? null,
                }));
            });

            const nextNodeDetails = Object.fromEntries(
                allNodes.map((node) => [node.id, node])
            );
            setNodeDetails(nextNodeDetails);

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

            await loadRobotDetail(
                Number(targetRobotId),
                taskList,
                nextNodeDetails
            );
        } catch (error) {
            console.error("로봇 관리 데이터 조회 실패:", error);
            alert(error.message || "데이터를 불러오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // 저장된 창고 선택을 그대로 이어서 조회한다.
        fetchPageData(null, warehouseFilter);
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

    const handleSelectRobot = (robotId) => {
        loadRobotDetail(robotId, tasks);
    };

    const filteredRobots = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();

        return robotViews.filter((robot) => {
            const robotName = getRobotDisplayName(robot).toLowerCase();
            const robotModel = getRobotModel(robot).toLowerCase();

            const matchesSearch =
                !keyword
                || robotName.includes(keyword)
                || robotModel.includes(keyword)
                || String(robot.id).includes(keyword);

            const selectedStatusGroup = SUMMARY_GROUPS.find(
                (group) => group.key === statusFilter
            );

            const matchesStatus =
                statusFilter === "ALL"
                || selectedStatusGroup?.statuses.includes(robot.status);

            return matchesSearch && matchesStatus;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [robotViews, searchText, statusFilter, robotSpecsById]);

    // 창고 선택 시 백엔드가 해당 창고의 로봇만 반환한다.
    const warehouseFilteredRobotViews = robotViews;

    const statusSummary = useMemo(() => {
        return SUMMARY_GROUPS.map((group) => ({
            ...group,
            count: warehouseFilteredRobotViews.filter((robot) =>
                group.statuses.includes(robot.status)
            ).length,
        }));
    }, [warehouseFilteredRobotViews]);

    const selectedRobotView = useMemo(
        () => selectedRobot
            ? mergeRobotState(selectedRobot, runtimeStates, nodeDetails)
            : null,
        [selectedRobot, runtimeStates, nodeDetails]
    );

    const selectedSpec = selectedRobotView
        ? robotSpecsById[selectedRobotView.robotSpecId] ?? {}
        : {};

    const selectedWarehouseName = selectedRobotView
        ? warehouseNames[selectedRobotView.warehouseId]
            ?? selectedRobotView.warehouseName
            ?? `창고 ${selectedRobotView.warehouseId ?? "-"}`
        : "-";

    const baseBatteryConsumption =
        selectedSpec.baseBatteryConsumptionRate
        ?? selectedSpec.baseBatteryDrainRate
        ?? selectedSpec.idleBatteryConsumptionRate
        ?? selectedRobotView?.baseBatteryConsumptionRate
        ?? 0.05;

    const workingBatteryConsumption =
        selectedSpec.workingBatteryConsumptionRate
        ?? selectedSpec.workBatteryConsumptionRate
        ?? selectedSpec.loadedBatteryConsumptionRate
        ?? selectedRobotView?.workingBatteryConsumptionRate
        ?? 0.15;

    const failureProbability = normalizePercent(
        selectedSpec.failureProbability
        ?? selectedSpec.breakdownProbability
        ?? selectedRobotView?.failureProbability,
        1
    );

    const startNodeId =
        selectedRobotView?.startNodeId
        ?? selectedRobotView?.initialNodeId
        ?? selectedRobotView?.nodeId
        ?? null;

    const startNodeCode =
        selectedRobotView?.startNodeCode
        ?? selectedRobotView?.initialNodeCode
        ?? nodeDetails[startNodeId]?.nodeCode
        ?? selectedRobotView?.nodeCode
        ?? null;

    const startNodeLabel = startNodeCode
        ?? (startNodeId ? `Node #${startNodeId}` : "-");

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

    const handleResetFilter = async () => {
        setSearchText("");
        setWarehouseFilter("ALL");
        setStatusFilter("ALL");
        setSelectedRobot(null);
        setSelectedTask(null);
        localStorage.removeItem(WAREHOUSE_ID_KEY);
        await fetchPageData(null, "ALL");
    };

    /**
     * 창고를 바꾸면 그 창고의 로봇만 다시 불러온다.
     *
     * 목록이 바뀌면 선택 중이던 로봇이 사라질 수 있어
     * 상세 선택은 fetchPageData 가 첫 번째 로봇으로 다시 잡는다.
     * 고른 창고는 시뮬레이션 화면과 같은 키로 저장해 두 화면이 같은 창고를 본다.
     */
    const handleWarehouseFilterChange = async (value) => {
        setWarehouseFilter(value);

        if (value === "ALL") {
            localStorage.removeItem(WAREHOUSE_ID_KEY);
        } else {
            localStorage.setItem(WAREHOUSE_ID_KEY, String(value));
        }

        setSelectedRobot(null);
        setSelectedTask(null);
        await fetchPageData(null, value);
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

            // 로봇은 충전 자리에서 시작한다.
            // 통로나 랙 위에 올려두면 시뮬레이션 시작 시 위치가 어긋난다.
            const chargingSlots = (layout.nodes ?? []).filter(
                (node) => node.nodeType === "CHARGING_SLOT"
            );

            setWarehouseNodes(chargingSlots);
        } catch (error) {
            console.error("창고 노드 조회 실패:", error);
            setWarehouseNodes([]);
            alert(error.message || "창고 노드를 불러오지 못했습니다.");
        }
    };

    /**
     * 로봇 등록 모달을 연다.
     *
     * 목록에서 고른 창고가 있으면 그 창고로 미리 채우는데,
     * 값만 넣으면 초기 노드 목록이 비어 있게 된다.
     * 노드를 불러오는 건 handleWarehouseChange 이므로 그걸 그대로 태운다.
     */
    const handleOpenAddModal = () => {
        setIsAddModalOpen(true);

        if (warehouseFilter && warehouseFilter !== "ALL") {
            handleWarehouseChange(String(warehouseFilter));
        }
    };

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
            const createdWarehouseId = String(newRobot.warehouseId);

            setWarehouseFilter(createdWarehouseId);
            localStorage.setItem(WAREHOUSE_ID_KEY, createdWarehouseId);

            await fetchPageData(createdRobot.id, createdWarehouseId);
            handleCloseModal();
        } catch (error) {
            console.error("로봇 등록 실패:", error);
            alert(error.message || "로봇을 등록하지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteRobot = async () => {
        if (!selectedRobotView) {
            alert("삭제할 로봇을 선택해주세요.");
            return;
        }

        const robotId = selectedRobotView.id;
        const robotName = getRobotDisplayName(selectedRobotView);

        const shouldDelete = window.confirm(
            `${robotName}을(를) 삭제하시겠습니까?\n삭제한 로봇은 복구할 수 없습니다.`
        );

        if (!shouldDelete) {
            return;
        }

        try {
            setIsDeleting(true);

            await robotApi.delete(robotId);

            setRuntimeStates((previousStates) => {
                const nextStates = { ...previousStates };
                delete nextStates[robotId];
                return nextStates;
            });

            setSelectedRobot(null);
            setSelectedTask(null);

            await fetchPageData(null, warehouseFilter);

            alert("로봇이 삭제되었습니다.");
        } catch (error) {
            console.error("로봇 삭제 실패:", error);
            alert(error.message || "로봇을 삭제하지 못했습니다.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="robot-management-wrapper">
            <header className="robot-management-header">
                <div>
                    <h1 className="robot-management-title">로봇 관리</h1>
                    <p className="robot-management-description">
                        창고에 등록된 로봇 상태, 현재 위치, 작업 현황
                    </p>
                </div>

                <div className="robot-management-header-buttons">
                    <button
                        type="button"
                        className="robot-management-button"
                        disabled={isLoading}
                        onClick={() =>
                            fetchPageData(selectedRobot?.id ?? null, warehouseFilter)
                        }
                    >
                        {isLoading ? "조회 중..." : "새로고침"}
                    </button>

                    <button
                        type="button"
                        className="robot-management-button primary"
                        onClick={handleOpenAddModal}
                    >
                        + 로봇 등록
                    </button>
                </div>
            </header>

            <section className="robot-summary">
                <button
                    type="button"
                    className={`robot-summary-card tone-total ${statusFilter === "ALL" ? "active" : ""}`}
                    onClick={() => setStatusFilter("ALL")}
                >
                    <span className="robot-summary-icon">▣</span>
                    <span className="robot-summary-copy">
                        <span className="robot-summary-label">전체 로봇</span>
                        <strong className="robot-summary-value">
                            {warehouseFilteredRobotViews.length}
                        </strong>
                    </span>
                </button>

                {statusSummary.map(({ key, label, count, tone }) => (
                    <button
                        type="button"
                        key={key}
                        className={`robot-summary-card tone-${tone} ${statusFilter === key ? "active" : ""}`}
                        onClick={() => setStatusFilter(key)}
                    >
                        <span className="robot-summary-icon">
                            {key === "AVAILABLE" && "✓"}
                            {key === "WORKING" && "▶"}
                            {key === "CHARGING" && "⚡"}
                            {key === "UNAVAILABLE" && "−"}
                            {key === "OFFLINE" && "⌁"}
                            {key === "ERROR" && "!"}
                        </span>
                        <span className="robot-summary-copy">
                            <span className="robot-summary-label">{label}</span>
                            <strong className="robot-summary-value">{count}</strong>
                        </span>
                    </button>
                ))}
            </section>

            <section className="robot-filter-panel">
                <div className="robot-filter">
                    <input
                        type="text"
                        className="robot-filter-search"
                        placeholder="로봇 이름 또는 ID 검색"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                    />

                    {/* 창고 필터 */}
                    <select
                        className="robot-filter-select"
                        value={warehouseFilter}
                        disabled={isLoading}
                        onChange={(event) =>
                            handleWarehouseFilterChange(event.target.value)
                        }
                    >
                        <option value="ALL">전체 창고</option>
                        {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="robot-filter-select"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                    >
                        <option value="ALL">전체 상태</option>
                        {SUMMARY_GROUPS.map(({ key, label }) => (
                            <option key={key} value={key}>
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
                </div>

                <div className="robot-filter-guide">
                    {warehouseFilter === "ALL"
                        ? "전체 창고의 로봇을 조회하고 있습니다."
                        : `${warehouseNames[Number(warehouseFilter)] ?? "선택한 창고"}의 로봇을 조회하고 있습니다.`}
                </div>
            </section>

            <main className="robot-content-grid">
                <section className="robot-list">
                    <div className="robot-section-header">
                        <h2>로봇 목록</h2>
                        <span>총 {filteredRobots.length}대</span>
                    </div>

                    <div className="robot-table-wrapper">
                        <table className="robot-table">
                            <thead>
                                <tr>
                                    <th>로봇 번호</th>
                                    <th>로봇 모델</th>
                                    <th>현재 상태</th>
                                    <th>배터리</th>
                                    <th>현재 위치</th>
                                    <th>위치 노드</th>
                                    <th>담당 작업 유형</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan="7" className="robot-table-message">
                                            로봇 정보를 불러오는 중입니다.
                                        </td>
                                    </tr>
                                ) : filteredRobots.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="robot-table-message">
                                            조건에 맞는 로봇이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRobots.map((robot) => (
                                        <tr
                                            key={robot.id}
                                            className={
                                                selectedRobot?.id === robot.id
                                                    ? "selected"
                                                    : ""
                                            }
                                            onClick={() => handleSelectRobot(robot.id)}
                                        >
                                            <td className="robot-number-cell">
                                                <span className="robot-row-icon">◉</span>
                                                {getRobotDisplayName(robot)}
                                            </td>
                                            <td className="robot-model-cell">
                                                {getRobotModel(robot)}
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
                                                    <span>{robot.battery ?? 0}%</span>
                                                    <div className="robot-battery-track">
                                                        <div
                                                            className="robot-battery-fill"
                                                            style={{
                                                                width: `${Math.max(
                                                                    0,
                                                                    Math.min(
                                                                        100,
                                                                        Number(robot.battery ?? 0)
                                                                    )
                                                                )}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{getLocationLabel(robot)}</td>
                                            <td>{robot.nodeId ?? "-"}</td>
                                            <td>{getTaskLabelForRobot(robot)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <aside className="robot-detail">
                    <div className="robot-section-header">
                        <h2>로봇 상세</h2>

                        {selectedRobotView && (
                            <button
                                type="button"
                                className="robot-delete-button"
                                disabled={isDeleting || isLoading}
                                onClick={handleDeleteRobot}
                            >
                                {isDeleting ? "삭제 중..." : "로봇 삭제"}
                            </button>
                        )}
                    </div>

                    {isDetailLoading ? (
                        <div className="robot-detail-empty">
                            로봇 정보를 불러오는 중입니다.
                        </div>
                    ) : !selectedRobotView ? (
                        <div className="robot-detail-empty">
                            로봇을 선택해주세요.
                        </div>
                    ) : (
                        <div className="robot-detail-content">
                            <div className="robot-detail-main">
                                <div>
                                    <span className="robot-detail-id">
                                        Robot ID {selectedRobotView.id}
                                    </span>
                                    <div className="robot-detail-name">
                                        {getRobotDisplayName(selectedRobotView)}
                                    </div>
                                    <div className="robot-detail-model">
                                        {getRobotModel(selectedRobotView)}
                                    </div>
                                </div>
                                <span
                                    className={`robot-status ${getRobotStatus(selectedRobotView.status).className}`}
                                >
                                    {getRobotStatus(selectedRobotView.status).label}
                                </span>
                            </div>

                            <div className="robot-detail-section">
                                <h3>A. 현재 상태</h3>
                                <div className="robot-detail-item">
                                    <span>상태</span>
                                    <strong>
                                        {getRobotStatus(selectedRobotView.status).label}
                                    </strong>
                                </div>
                                <div className="robot-detail-item">
                                    <span>배터리</span>
                                    <strong>{selectedRobotView.battery ?? 0}%</strong>
                                </div>
                                <div className="robot-detail-battery-track">
                                    <div
                                        className="robot-detail-battery-fill"
                                        style={{
                                            width: `${Math.max(
                                                0,
                                                Math.min(
                                                    100,
                                                    Number(selectedRobotView.battery ?? 0)
                                                )
                                            )}%`,
                                        }}
                                    />
                                </div>
                                <div className="robot-detail-item">
                                    <span>현재 위치</span>
                                    <strong>{getLocationLabel(selectedRobotView)}</strong>
                                </div>
                                <div className="robot-detail-item">
                                    <span>위치 노드</span>
                                    <strong>{selectedRobotView.nodeId ?? "-"}</strong>
                                </div>
                            </div>

                            <div className="robot-detail-section">
                                <h3>B. 현재 작업</h3>
                                <div className="robot-detail-item">
                                    <span>담당 작업 유형</span>
                                    <strong>
                                        {getTaskTypeLabel(
                                            selectedTask?.taskType
                                            ?? selectedRobotView.taskCode
                                            ?? selectedRobotView.taskType
                                            ?? "GENERAL"
                                        )}
                                    </strong>
                                </div>

                                {selectedTask && (
                                    <>
                                        <div className="robot-task-title">
                                            <strong>Task #{selectedTask.id}</strong>
                                            <span
                                                className={`task-status task-${selectedTask.status
                                                    ?.toLowerCase()
                                                    .replaceAll("_", "-")}`}
                                            >
                                                {getTaskStatusLabel(selectedTask.status)}
                                            </span>
                                        </div>
                                        <div className="robot-detail-item">
                                            <span>출발 노드</span>
                                            <strong>{selectedTask.startNodeId ?? "-"}</strong>
                                        </div>
                                        <div className="robot-detail-item">
                                            <span>도착 노드</span>
                                            <strong>{selectedTask.endNodeId ?? "-"}</strong>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="robot-detail-section">
                                <h3>C. 기본 정보</h3>
                                <div className="robot-detail-item">
                                    <span>기본 배터리 소모율</span>
                                    <strong>{baseBatteryConsumption}</strong>
                                </div>
                                <div className="robot-detail-item">
                                    <span>작업 중 배터리 소모율</span>
                                    <strong>{workingBatteryConsumption}</strong>
                                </div>
                                <div className="robot-detail-item">
                                    <span>고장 확률</span>
                                    <strong>{failureProbability}%</strong>
                                </div>
                                <div className="robot-detail-item">
                                    <span>소속 창고</span>
                                    <strong>{selectedWarehouseName}</strong>
                                </div>
                                <div className="robot-detail-item">
                                    <span>시작 위치 노드</span>
                                    <strong>{startNodeLabel}</strong>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>
            </main>

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
                                    onChange={(event) => handleNewRobotChange(
                                        "robotSpecId",
                                        event.target.value
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
                                    onChange={(event) =>
                                        handleWarehouseChange(event.target.value)
                                    }
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
                                        onChange={(event) => handleNewRobotChange(
                                            "battery",
                                            event.target.value
                                        )}
                                    />
                                    <span>%</span>
                                </div>
                            </label>

                            <label className="robot-modal-field">
                                <span>초기 노드 (충전 자리)</span>
                                <select
                                    value={newRobot.nodeId}
                                    disabled={!newRobot.warehouseId}
                                    onChange={(event) => handleNewRobotChange(
                                        "nodeId",
                                        event.target.value
                                    )}
                                >
                                    <option value="">
                                        {!newRobot.warehouseId
                                            ? "창고를 먼저 선택하세요"
                                            : warehouseNodes.length === 0
                                                ? "충전 자리가 없습니다"
                                                : "충전 자리 선택"}
                                    </option>
                                    {warehouseNodes.map((node) => (
                                        <option key={node.id} value={node.id}>
                                            {node.nodeCode}
                                            {occupiedNodeIds.has(node.id)
                                                ? " (사용 중)"
                                                : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="robot-modal-field">
                                <span>초기 상태</span>
                                <select
                                    value={newRobot.status}
                                    onChange={(event) => handleNewRobotChange(
                                        "status",
                                        event.target.value
                                    )}
                                >
                                    <option value="AVAILABLE">사용 가능</option>
                                    <option value="UNAVAILABLE">사용 불가</option>
                                </select>
                            </label>
                        </div>

                        <div className="robot-modal-actions">
                            <button type="button" onClick={handleCloseModal}>
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