import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/operationManagement.css";

import { operationApi, warehouseApi } from "../api/client";
import { TOPICS } from "../api/config";
import useStompSubscriptions from "../hooks/useStompSubscriptions";

// 실시간 갱신을 몰아서 처리하는 간격(ms).
// 시뮬레이션이 돌면 작업 변경이 몰아서 오기 때문에
// 하나 올 때마다 조회하면 요청이 너무 잦아진다.
const LIVE_REFRESH_DELAY_MS = 1500;

// 창고 목록을 못 불러왔을 때 쓸 기본값
const ALL_WAREHOUSES = {
    id: "ALL",
    name: "전체 창고",
};

const HOURS = [
    "00시",
    "02시",
    "04시",
    "06시",
    "08시",
    "10시",
    "12시",
    "14시",
    "16시",
    "18시",
    "20시",
    "22시",
];

const ROBOT_STATUS_META = [
    {
        key: "AVAILABLE",
        label: "사용 가능",
        color: "#4f7df3",
    },
    {
        key: "WORKING",
        label: "작업 중",
        color: "#39a96b",
    },
    {
        key: "CHARGING",
        label: "충전 중",
        color: "#f59f2f",
    },
    {
        key: "UNAVAILABLE",
        label: "사용 불가",
        color: "#8a93a2",
    },
    {
        key: "OFFLINE",
        label: "오프라인",
        color: "#7b61d1",
    },
    {
        key: "ERROR",
        label: "오류",
        color: "#e95b5b",
    },
];

// 숫자는 넣지 않고 그래프 틀만 유지하기 위한 초기 데이터입니다.
const EMPTY_DASHBOARD = {
    summary: {
        todayTaskCount: null,
        completionRate: null,
        activeRobotCount: null,
        chargingRequiredRobotCount: null,
        errorRobotCount: null,
    },
    hourlyTaskVolume: HOURS.map((hour) => ({
        hour,
        count: 0,
        completedCount: 0,
    })),
    hourlyEventVolume: HOURS.map((hour) => ({
        hour,
        count: 0,
        completedCount: 0,
    })),
    robotStatusDistribution: ROBOT_STATUS_META.map((status) => ({
        ...status,
        count: 0,
    })),
    warehouseThroughput: [],
    recentTasks: [],
    updatedAt: null,
};

const QUICK_LINKS = [
    {
        label: "시뮬레이션 보기",
        description: "작업 계획과 경로를 확인합니다.",
        icon: "▶",
        path: "/simulation",
    },
    {
        label: "창고 관리",
        description: "창고와 노드 정보를 관리합니다.",
        icon: "⌂",
        path: "/warehouse",
    },
    {
        label: "로봇 관리",
        description: "로봇 상태와 상세 정보를 확인합니다.",
        icon: "▣",
        path: "/robot",
    },
];

const getToday = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60 * 1000;

    return new Date(now.getTime() - offset)
        .toISOString()
        .slice(0, 10);
};

const formatValue = (value) => {
    if (value === null || value === undefined) {
        return "-";
    }

    return value;
};

const mergeHourlyData = (items = []) => {
    const byHour = new Map(
        items.map((item) => [String(item.hour), item])
    );

    return HOURS.map((hour) => ({
        hour,
        count: Number(byHour.get(hour)?.count ?? 0),
        completedCount: Number(byHour.get(hour)?.completedCount ?? 0),
    }));
};

const normalizeDashboardResponse = (response = {}) => {
    const data = response.data ?? response;
    const summary = data.summary ?? {};

    const robotStatusSource =
        data.robotStatusDistribution
        ?? data.robotStatus
        ?? [];

    const robotStatusMap = Array.isArray(robotStatusSource)
        ? new Map(
            robotStatusSource.map((item) => [
                item.key ?? item.status,
                Number(item.count ?? 0),
            ])
        )
        : new Map(
            Object.entries(robotStatusSource).map(([key, count]) => [
                key,
                Number(count ?? 0),
            ])
        );

    return {
        summary: {
            todayTaskCount:
                summary.todayTaskCount
                ?? summary.totalTasks
                ?? null,
            completionRate:
                summary.completionRate
                ?? null,
            activeRobotCount:
                summary.activeRobotCount
                ?? summary.workingRobots
                ?? null,
            chargingRequiredRobotCount:
                summary.chargingRequiredRobotCount
                ?? summary.lowBatteryRobots
                ?? null,
            errorRobotCount:
                summary.errorRobotCount
                ?? summary.errorRobots
                ?? null,
        },
        hourlyTaskVolume: mergeHourlyData(
            data.hourlyTaskVolume
            ?? data.taskVolumeByHour
            ?? []
        ),
        hourlyEventVolume: mergeHourlyData(
            data.hourlyEventVolume
            ?? data.eventVolumeByHour
            ?? []
        ),
        robotStatusDistribution: ROBOT_STATUS_META.map((status) => ({
            ...status,
            count: robotStatusMap.get(status.key) ?? 0,
        })),
        warehouseThroughput: data.warehouseThroughput ?? [],
        recentTasks:
            data.recentTasks
            ?? data.tasks
            ?? [],
        updatedAt:
            data.updatedAt
            ?? null,
    };
};

const buildDonutGradient = (items) => {
    const total = items.reduce(
        (sum, item) => sum + Number(item.count ?? 0),
        0
    );

    // 데이터가 없어도 도넛 그래프의 기본 틀은 남깁니다.
    if (total === 0) {
        return "conic-gradient(#e5e5e5 0deg 360deg)";
    }

    let accumulated = 0;

    const segments = items.map((item) => {
        const start = (accumulated / total) * 360;

        accumulated += Number(item.count ?? 0);

        const end = (accumulated / total) * 360;

        return `${item.color} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${segments.join(", ")})`;
};

const buildEventChart = (items) => {
    const width = 720;
    const height = 240;
    const paddingLeft = 34;
    const paddingRight = 18;
    const paddingTop = 20;
    const paddingBottom = 44;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const max = Math.max(
        ...items.map((item) => Number(item.count ?? 0)),
        1
    );

    const points = items.map((item, index) => {
        const x =
            paddingLeft
            + (plotWidth / Math.max(items.length - 1, 1)) * index;
        const y =
            paddingTop
            + plotHeight
            - (Number(item.count ?? 0) / max) * plotHeight;

        return {
            ...item,
            x,
            y,
        };
    });

    const linePath = points
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
        )
        .join(" ");

    const areaPath = points.length > 0
        ? `${linePath} L ${points.at(-1).x} ${
            paddingTop + plotHeight
        } L ${points[0].x} ${paddingTop + plotHeight} Z`
        : "";

    return {
        width,
        height,
        paddingLeft,
        paddingTop,
        paddingBottom,
        plotHeight,
        points,
        linePath,
        areaPath,
    };
};

/**
 * 작업 목록 표.
 *
 * 「작업 요약」 패널과 「전체 보기」 팝업이 같은 열 구성을 쓰기 때문에
 * 한 곳에서만 그린다.
 */
function TaskTable({ tasks, emptyMessage }) {
    return (
        <table className="operation-table">
            <thead>
                <tr>
                    <th>작업 ID</th>
                    <th>창고</th>
                    <th>작업 유형</th>
                    <th>상태</th>
                    <th>지연 시간</th>
                    <th>시작 시간</th>
                    <th>완료 시간</th>
                </tr>
            </thead>

            <tbody>
                {tasks.length === 0 ? (
                    <tr>
                        <td colSpan="7" className="operation-table-empty">
                            {emptyMessage}
                        </td>
                    </tr>
                ) : (
                    tasks.map((task) => (
                        <tr key={task.taskId ?? task.id}>
                            <td>
                                {task.taskCode
                                ?? task.taskId
                                ?? task.id
                                ?? "-"}
                            </td>
                            <td>{task.warehouseName ?? "-"}</td>
                            <td>{task.taskType ?? "-"}</td>
                            <td>{task.status ?? "-"}</td>
                            <td>
                                {task.delayMinutes === null
                                || task.delayMinutes === undefined
                                    ? "-"
                                    : `${task.delayMinutes}분`}
                            </td>
                            <td>{task.startedAt ?? "-"}</td>
                            <td>{task.completedAt ?? "-"}</td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );
}

function OperationManagement() {
    const navigate = useNavigate();
    const today = getToday();

    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [warehouseId, setWarehouseId] = useState("ALL");
    const [warehouses, setWarehouses] = useState([ALL_WAREHOUSES]);
    const [taskMetric, setTaskMetric] = useState("COUNT");

    // 창고별 처리량 막대에 무엇을 그릴지
    const [warehouseMetric, setWarehouseMetric] = useState("TOTAL");
    const [dashboardData, setDashboardData] = useState(EMPTY_DASHBOARD);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadError, setLoadError] = useState("");

    // 「전체 보기」 팝업
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [allTasks, setAllTasks] = useState([]);
    const [isTaskModalLoading, setIsTaskModalLoading] = useState(false);
    const [taskModalError, setTaskModalError] = useState("");

    const summaryCards = useMemo(
        () => [
            {
                key: "tasks",
                title: "선택 기간 작업 수",
                value: dashboardData.summary.todayTaskCount,
                unit: "건",
                caption: "기간 내 발생한 전체 작업",
                tone: "blue",
                icon: "▤",
            },
            {
                key: "completion",
                title: "완료율",
                value: dashboardData.summary.completionRate,
                unit: "%",
                caption: "완료 작업 비율",
                tone: "green",
                icon: "✓",
            },
            {
                key: "activeRobots",
                title: "가동 중 로봇",
                value: dashboardData.summary.activeRobotCount,
                unit: "대",
                caption: "현재 작업 중인 로봇",
                tone: "blue",
                icon: "▣",
            },
            {
                key: "lowBattery",
                title: "충전 필요 로봇",
                value:
                    dashboardData.summary
                        .chargingRequiredRobotCount,
                unit: "대",
                caption: "배터리 기준 이하",
                tone: "orange",
                icon: "▥",
            },
            {
                key: "errors",
                title: "오류 로봇",
                value: dashboardData.summary.errorRobotCount,
                unit: "대",
                caption: "점검이 필요한 로봇",
                tone: "red",
                icon: "!",
            },
        ],
        [dashboardData]
    );

    /** 시간대별 막대에 그릴 값. "완료 작업"을 고르면 완료 건수만 본다. */
    const hourlyTaskValue = useCallback(
        (item) => taskMetric === "COMPLETED"
            ? Number(item.completedCount ?? 0)
            : Number(item.count ?? 0),
        [taskMetric]
    );

    const maxHourlyTask = useMemo(
        () => Math.max(
            ...dashboardData.hourlyTaskVolume.map(hourlyTaskValue),
            1
        ),
        [dashboardData.hourlyTaskVolume, hourlyTaskValue]
    );

    /** 고른 기준에 해당하는 값을 꺼낸다. */
    const warehouseMetricValue = useCallback(
        (item) => {
            if (warehouseMetric === "DONE") {
                return Number(item.count ?? 0);
            }
            if (warehouseMetric === "RATE") {
                return Number(item.completionRate ?? 0);
            }
            return Number(item.totalCount ?? 0);
        },
        [warehouseMetric]
    );

    const maxWarehouseCount = useMemo(
        () => Math.max(
            ...dashboardData.warehouseThroughput.map(warehouseMetricValue),
            1
        ),
        [dashboardData.warehouseThroughput, warehouseMetricValue]
    );

    const totalRobotCount = useMemo(
    () =>
        dashboardData.robotStatusDistribution.reduce(
            (sum, item) => sum + Number(item.count ?? 0),
            0
        ),
    [dashboardData.robotStatusDistribution]
);

    const donutBackground = useMemo(
        () => buildDonutGradient(
            dashboardData.robotStatusDistribution
        ),
        [dashboardData.robotStatusDistribution]
    );

    const eventChart = useMemo(
        () => buildEventChart(dashboardData.hourlyEventVolume),
        [dashboardData.hourlyEventVolume]
    );

    /**
     * 대시보드를 다시 불러온다.
     *
     * @param silent 실시간 갱신처럼 배경에서 도는 경우 true.
     *               "조회 중..." 표시를 띄우지 않아 화면이 깜빡이지 않는다.
     */
    const handleRefresh = useCallback(async (silent = false) => {
        if (!silent) {
            setIsRefreshing(true);
        }

        setLoadError("");

        try {
            const response = await operationApi.getDashboard({
                // "ALL" 이면 창고 조건 없이 전체를 집계한다.
                warehouseId: warehouseId === "ALL" ? null : warehouseId,
                startDate,
                endDate,
            });

            setDashboardData(normalizeDashboardResponse(response));
        } catch (error) {
            console.error("운영 대시보드 조회 실패:", error);

            setLoadError(
                error.message
                ?? "운영 데이터를 불러오지 못했습니다."
            );

            if (!silent) {
                setDashboardData(EMPTY_DASHBOARD);
            }
        } finally {
            if (!silent) {
                setIsRefreshing(false);
            }
        }
    }, [warehouseId, startDate, endDate]);

    // 창고 목록을 받아 드롭다운을 채운다.
    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const list = await warehouseApi.getAll();

                setWarehouses([
                    ALL_WAREHOUSES,
                    ...list.map((warehouse) => ({
                        id: warehouse.id,
                        name: warehouse.name,
                    })),
                ]);
            } catch (error) {
                console.warn("창고 목록 조회 실패", error.message);
            }
        };

        loadWarehouses();
    }, []);

    // 창고나 기간을 바꾸면 바로 다시 조회한다.
    // 화면에 처음 들어올 때도 오늘 기준으로 한 번 돈다.
    useEffect(() => {
        handleRefresh();
    }, [handleRefresh]);

    /* =========================================================
       실시간 갱신

       백엔드는 작업이 배정·시작·완료될 때마다 /topic/tasks 로 알려준다.
       그때마다 조회하면 요청이 너무 잦아지므로 잠깐 모았다가 한 번만 부른다.

       조회 기간에 오늘이 안 들어 있으면 지난 기록만 보는 것이므로
       실시간으로 바뀔 일이 없어 아예 연결하지 않는다.
    ========================================================= */

    /* =========================================================
       「전체 보기」 팝업

       대시보드 응답에는 최근 10건만 들어 있어서
       팝업을 열 때 전체 목록을 따로 받아온다.
    ========================================================= */

    const fetchAllTasks = useCallback(async (silent = false) => {
        if (!silent) {
            setIsTaskModalLoading(true);
        }

        setTaskModalError("");

        try {
            const response = await operationApi.getTasks({
                warehouseId: warehouseId === "ALL" ? null : warehouseId,
                startDate,
                endDate,
            });

            setAllTasks(Array.isArray(response) ? response : []);
        } catch (error) {
            console.error("작업 전체 조회 실패:", error);

            setTaskModalError(
                error.message
                ?? "작업 목록을 불러오지 못했습니다."
            );

            if (!silent) {
                setAllTasks([]);
            }
        } finally {
            if (!silent) {
                setIsTaskModalLoading(false);
            }
        }
    }, [warehouseId, startDate, endDate]);

    // 실시간 갱신 콜백이 팝업 상태를 보려고 매번 새로 만들어지면
    // 그때마다 재구독이 일어난다. ref 로만 읽는다.
    const isTaskModalOpenRef = useRef(false);
    isTaskModalOpenRef.current = isTaskModalOpen;

    const openTaskModal = useCallback(() => {
        setIsTaskModalOpen(true);
        fetchAllTasks();
    }, [fetchAllTasks]);

    const closeTaskModal = useCallback(() => {
        setIsTaskModalOpen(false);
        setTaskModalError("");
    }, []);

    /* =========================================================
       실시간 갱신

       백엔드는 작업이 배정·시작·완료될 때마다 /topic/tasks 로 알려준다.
       그때마다 조회하면 요청이 너무 잦아지므로 잠깐 모았다가 한 번만 부른다.

       조회 기간에 오늘이 안 들어 있으면 지난 기록만 보는 것이므로
       실시간으로 바뀔 일이 없어 아예 연결하지 않는다.
    ========================================================= */

    const refreshTimerRef = useRef(null);

    const scheduleLiveRefresh = useCallback(() => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
        }

        refreshTimerRef.current = setTimeout(() => {
            handleRefresh(true);

            // 팝업이 열려 있으면 전체 목록도 같이 맞춘다.
            if (isTaskModalOpenRef.current) {
                fetchAllTasks(true);
            }
        }, LIVE_REFRESH_DELAY_MS);
    }, [handleRefresh, fetchAllTasks]);

    const isLivePeriod = endDate >= today;

    useStompSubscriptions(
        isLivePeriod
            ? {
                [TOPICS.TASKS]: scheduleLiveRefresh,
                [TOPICS.EVENTS]: scheduleLiveRefresh,
            }
            : {},
        isLivePeriod
    );

    useEffect(() => () => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
        }
    }, []);

    // 팝업은 Esc 로도 닫는다.
    useEffect(() => {
        if (!isTaskModalOpen) {
            return;
        }

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                closeTaskModal();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isTaskModalOpen, closeTaskModal]);

    /**
     * 시작일을 바꾼다.
     *
     * 달력에서는 max 로 막아두지만 직접 입력하면 뚫릴 수 있어
     * 종료일보다 뒤면 종료일도 같이 당긴다.
     */
    const handleStartDateChange = (value) => {
        if (!value) {
            return;
        }

        setStartDate(value);

        if (value > endDate) {
            setEndDate(value);
        }
    };

    /** 종료일이 시작일보다 앞이면 시작일도 같이 당긴다. */
    const handleEndDateChange = (value) => {
        if (!value) {
            return;
        }

        setEndDate(value);

        if (value < startDate) {
            setStartDate(value);
        }
    };

    const selectedWarehouseName = useMemo(
        () => warehouses.find(
            (warehouse) => String(warehouse.id) === String(warehouseId)
        )?.name ?? "전체 창고",
        [warehouses, warehouseId]
    );

    return (
        <div className="operation-dashboard">
            <header className="operation-dashboard-header">
                <div>
                    <h1>운영 관리</h1>
                    <p>
                        {selectedWarehouseName}의 운영 현황과 주요 지표를
                        한눈에 확인합니다.
                    </p>
                </div>

                <div className="operation-dashboard-updated">
                    <span>기준 시각</span>
                    <strong>
                        {isRefreshing
                            ? "조회 중..."
                            : dashboardData.updatedAt ?? "-"}
                    </strong>
                </div>
            </header>

            <section className="operation-dashboard-filter">
                <label className="operation-filter-field">
                    <span className="sr-only">시작 날짜</span>
                    <input
                        type="date"
                        value={startDate}
                        // 달력에서 종료일 이후는 아예 고를 수 없게 한다
                        max={endDate}
                        onChange={(event) =>
                            handleStartDateChange(event.target.value)
                        }
                    />
                </label>

                <span className="operation-date-separator">~</span>

                <label className="operation-filter-field">
                    <span className="sr-only">종료 날짜</span>
                    <input
                        type="date"
                        value={endDate}
                        // 시작일 이전은 고를 수 없다
                        min={startDate}
                        onChange={(event) =>
                            handleEndDateChange(event.target.value)
                        }
                    />
                </label>

                <label className="operation-filter-field">
                    <span className="sr-only">창고 선택</span>
                    <select
                        value={warehouseId}
                        disabled={isRefreshing}
                        onChange={(event) =>
                            setWarehouseId(event.target.value)
                        }
                    >
                        {warehouses.map((warehouse) => (
                            <option
                                key={warehouse.id}
                                value={warehouse.id}
                            >
                                {warehouse.name}
                            </option>
                        ))}
                    </select>
                </label>
            </section>

            {loadError && (
                <div className="operation-error-message">
                    {loadError}
                </div>
            )}

            <section className="operation-summary-grid">
                {summaryCards.map((card) => (
                    <article
                        key={card.key}
                        className={`operation-summary-card tone-${card.tone}`}
                    >
                        <div className="operation-summary-icon">
                            {card.icon}
                        </div>

                        <div className="operation-summary-copy">
                            <span>{card.title}</span>

                            <div className="operation-summary-value">
                                <strong>{formatValue(card.value)}</strong>

                                {card.value !== null
                                    && card.value !== undefined
                                    && <small>{card.unit}</small>}
                            </div>

                            <p>{card.caption}</p>
                        </div>
                    </article>
                ))}
            </section>

            <section className="operation-chart-grid operation-chart-grid-top">
                <article className="operation-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>시간대별 작업량</h2>
                            <p>시간대별 처리 작업 수입니다.</p>
                        </div>

                        <select
                            value={taskMetric}
                            onChange={(event) =>
                                setTaskMetric(event.target.value)
                            }
                        >
                            <option value="COUNT">작업 수</option>
                            <option value="COMPLETED">완료 작업</option>
                        </select>
                    </div>

                    <div className="operation-bar-chart">
                        <div className="operation-bar-chart-grid" />

                        <div className="operation-bar-chart-items">
                            {dashboardData.hourlyTaskVolume.map(
                                (item) => {
                                    const value = hourlyTaskValue(item);

                                    return (
                                        <div
                                            className="operation-bar-item"
                                            key={item.hour}
                                        >
                                            <span className="operation-bar-value">
                                                {value > 0 ? value : ""}
                                            </span>

                                            <div
                                                className="operation-bar"
                                                style={{
                                                    height: `${
                                                        (value / maxHourlyTask)
                                                        * 100
                                                    }%`,
                                                }}
                                            />

                                            <span className="operation-bar-label">
                                                {item.hour}
                                            </span>
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    </div>
                </article>

                <article className="operation-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>로봇 상태 분포</h2>
                            <p>전체 로봇의 현재 상태입니다.</p>
                        </div>

                        <span className="operation-panel-badge">
                            전체 {totalRobotCount > 0
                                ? `${totalRobotCount}대`
                                : "-"}
                        </span>
                    </div>

                    <div className="operation-donut-layout">
                        <div
                            className="operation-donut"
                            style={{ background: donutBackground }}
                        >
                            <div className="operation-donut-center">
                                <strong>
                                    {totalRobotCount > 0
                                        ? `${totalRobotCount}대`
                                        : "-"}
                                </strong>
                                <span>전체 로봇</span>
                            </div>
                        </div>

                        <div className="operation-donut-legend">
                            {dashboardData.robotStatusDistribution.map(
                                (item) => {
                                    const percentage =
                                        totalRobotCount > 0
                                            ? Math.round(
                                                (
                                                    Number(
                                                        item.count
                                                        ?? 0
                                                    )
                                                    / totalRobotCount
                                                ) * 100
                                            )
                                            : 0;

                                    return (
                                        <div
                                            key={item.key}
                                            className="operation-donut-legend-row"
                                        >
                                            <span
                                                className="operation-legend-dot"
                                                style={{
                                                    backgroundColor:
                                                        item.color,
                                                }}
                                            />

                                            <span className="operation-legend-label">
                                                {item.label}
                                            </span>

                                            <strong>
                                                {totalRobotCount > 0
                                                    ? `${item.count}대 (${percentage}%)`
                                                    : "-"}
                                            </strong>
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    </div>
                </article>
            </section>

            <section className="operation-chart-grid">
                <article className="operation-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>창고별 처리량</h2>
                            <p>
                                전체 창고를 비교합니다. (창고 선택과 무관)
                            </p>
                        </div>

                        <select
                            value={warehouseMetric}
                            onChange={(event) =>
                                setWarehouseMetric(event.target.value)
                            }
                        >
                            <option value="TOTAL">전체 작업</option>
                            <option value="DONE">완료 작업</option>
                            <option value="RATE">완료율</option>
                        </select>
                    </div>

                    <div className="operation-horizontal-chart">
                        {dashboardData.warehouseThroughput.map(
                            (item) => {
                                const value = warehouseMetricValue(item);

                                return (
                                    <div
                                        className="operation-horizontal-row"
                                        key={item.warehouseId}
                                    >
                                        <span>{item.warehouseName}</span>

                                        <div className="operation-horizontal-track">
                                            <div
                                                className="operation-horizontal-fill"
                                                style={{
                                                    width: `${
                                                        (value / maxWarehouseCount)
                                                        * 100
                                                    }%`,
                                                }}
                                            />
                                        </div>

                                        <strong>
                                            {value > 0
                                                ? warehouseMetric === "RATE"
                                                    ? `${value}%`
                                                    : value
                                                : "-"}
                                        </strong>
                                    </div>
                                );
                            }
                        )}
                    </div>
                </article>

                <article className="operation-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>시간대별 이벤트 발생</h2>
                            <p>오류·경고·작업 이벤트 발생 추이입니다.</p>
                        </div>
                    </div>

                    <div className="operation-line-chart">
                        <svg
                            viewBox={`0 0 ${eventChart.width} ${eventChart.height}`}
                            role="img"
                            aria-label="시간대별 이벤트 발생 그래프"
                        >
                            <defs>
                                <linearGradient
                                    id="operationEventArea"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stopColor="#6d5dfc"
                                        stopOpacity="0.25"
                                    />
                                    <stop
                                        offset="100%"
                                        stopColor="#6d5dfc"
                                        stopOpacity="0"
                                    />
                                </linearGradient>
                            </defs>

                            {[0, 0.25, 0.5, 0.75, 1].map(
                                (ratio) => {
                                    const y =
                                        eventChart.paddingTop
                                        + eventChart.plotHeight
                                        * ratio;

                                    return (
                                        <line
                                            key={ratio}
                                            x1={
                                                eventChart.paddingLeft
                                            }
                                            y1={y}
                                            x2={
                                                eventChart.width
                                                - eventChart.paddingLeft
                                                / 2
                                            }
                                            y2={y}
                                            className="operation-line-grid"
                                        />
                                    );
                                }
                            )}

                            <path
                                d={eventChart.areaPath}
                                fill="url(#operationEventArea)"
                            />

                            <path
                                d={eventChart.linePath}
                                className="operation-line-path"
                            />

                            {eventChart.points.map((point) => (
                                <g key={point.hour}>
                                    <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="5"
                                        className="operation-line-point"
                                    />

                                    {point.count > 0 && (
                                        <text
                                            x={point.x}
                                            y={point.y - 12}
                                            textAnchor="middle"
                                            className="operation-line-value"
                                        >
                                            {point.count}
                                        </text>
                                    )}

                                    <text
                                        x={point.x}
                                        y={
                                            eventChart.height
                                            - eventChart.paddingBottom
                                            + 28
                                        }
                                        textAnchor="middle"
                                        className="operation-line-label"
                                    >
                                        {point.hour}
                                    </text>
                                </g>
                            ))}
                        </svg>
                    </div>
                </article>
            </section>

            <section className="operation-bottom-grid">
                <article className="operation-panel operation-task-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>작업 요약</h2>
                            <p>최근 처리된 작업을 표시합니다.</p>
                        </div>

                        <button
                            type="button"
                            className="operation-text-button"
                            onClick={openTaskModal}
                        >
                            전체 보기
                            <span>›</span>
                        </button>
                    </div>

                    <div className="operation-table-wrapper">
                        <TaskTable
                            tasks={dashboardData.recentTasks}
                            emptyMessage="표시할 작업 데이터가 없습니다."
                        />
                    </div>
                </article>

                <article className="operation-panel operation-quick-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>빠른 이동</h2>
                            <p>관련 관리 화면으로 이동합니다.</p>
                        </div>
                    </div>

                    <div className="operation-quick-links">
                        {QUICK_LINKS.map((link) => (
                            <button
                                type="button"
                                key={link.label}
                                onClick={() => navigate(link.path)}
                            >
                                <span className="operation-quick-icon">
                                    {link.icon}
                                </span>

                                <span className="operation-quick-copy">
                                    <strong>{link.label}</strong>
                                    <small>{link.description}</small>
                                </span>

                                <span className="operation-quick-arrow">
                                    ›
                                </span>
                            </button>
                        ))}
                    </div>
                </article>
            </section>

            {isTaskModalOpen && (
                <div
                    className="operation-modal-backdrop"
                    onClick={closeTaskModal}
                >
                    {/* 안쪽을 눌렀을 때는 닫히지 않게 막는다. */}
                    <div
                        className="operation-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label="전체 작업 목록"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="operation-modal-header">
                            <div>
                                <h2>전체 작업</h2>
                                <p>
                                    {selectedWarehouseName}
                                    {" · "}
                                    {startDate}
                                    {startDate === endDate
                                        ? ""
                                        : ` ~ ${endDate}`}
                                    {" · 총 "}
                                    {allTasks.length.toLocaleString()}
                                    건
                                </p>
                            </div>

                            <button
                                type="button"
                                className="operation-modal-close"
                                onClick={closeTaskModal}
                                aria-label="닫기"
                            >
                                ×
                            </button>
                        </div>

                        {taskModalError && (
                            <p className="operation-modal-error">
                                {taskModalError}
                            </p>
                        )}

                        <div className="operation-modal-body">
                            {isTaskModalLoading ? (
                                <p className="operation-modal-loading">
                                    작업 목록을 불러오는 중입니다...
                                </p>
                            ) : (
                                <TaskTable
                                    tasks={allTasks}
                                    emptyMessage="선택한 조건에 해당하는 작업이 없습니다."
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OperationManagement;