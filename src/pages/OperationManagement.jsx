import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/operationManagement.css";

// 백엔드 API가 준비되면 실제 경로에 맞춰 import합니다.
// import { operationApi } from "../api/client";

const WAREHOUSES = [
     {
        id: "ALL",
        name: "전체 창고",
    },
    {
        id: 1,
        name: "대전 물류센터 A",
    },
];

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
    })),
    hourlyEventVolume: HOURS.map((hour) => ({
        hour,
        count: 0,
    })),
    robotStatusDistribution: ROBOT_STATUS_META.map((status) => ({
        ...status,
        count: 0,
    })),
    warehouseThroughput: [
        {
            warehouseId: 1,
            warehouseName: "대전 물류센터 A",
            count: 0,
        },
    ],
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
    const countByHour = new Map(
        items.map((item) => [
            String(item.hour),
            Number(item.count ?? 0),
        ])
    );

    return HOURS.map((hour) => ({
        hour,
        count: countByHour.get(hour) ?? 0,
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
        warehouseThroughput:
            data.warehouseThroughput?.length > 0
                ? data.warehouseThroughput
                : EMPTY_DASHBOARD.warehouseThroughput,
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

function OperationManagement() {
    const navigate = useNavigate();
    const today = getToday();

    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [warehouseId, setWarehouseId] = useState("ALL");
    const [timeRange, setTimeRange] = useState("ALL");
    const [taskMetric, setTaskMetric] = useState("COUNT");
    const [eventMetric, setEventMetric] = useState("COUNT");
    const [dashboardData, setDashboardData] = useState(EMPTY_DASHBOARD);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadError, setLoadError] = useState("");

    const summaryCards = useMemo(
        () => [
            {
                key: "tasks",
                title: "오늘 작업 수",
                value: dashboardData.summary.todayTaskCount,
                unit: "건",
                caption: "선택 기간 처리 작업",
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

    const maxHourlyTask = useMemo(
        () => Math.max(
            ...dashboardData.hourlyTaskVolume.map(
                (item) => Number(item.count ?? 0)
            ),
            1
        ),
        [dashboardData.hourlyTaskVolume]
    );

    const maxWarehouseCount = useMemo(
        () => Math.max(
            ...dashboardData.warehouseThroughput.map(
                (item) => Number(item.count ?? 0)
            ),
            1
        ),
        [dashboardData.warehouseThroughput]
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

    const handleRefresh = async () => {
        setIsRefreshing(true);
        setLoadError("");

        try {
            const query = {
                warehouseId: Number(warehouseId),
                startDate,
                endDate,
                timeRange,
                taskMetric,
                eventMetric,
            };

            console.log("운영 대시보드 조회 조건:", query);

            /*
             * 백엔드 연결 시 아래 부분만 실제 API에 맞춰 활성화합니다.
             *
             * const response = await operationApi.getDashboard(query);
             * setDashboardData(normalizeDashboardResponse(response));
             */

            // API 연결 전에는 EMPTY_DASHBOARD가 유지되어
            // 숫자는 '-'로, 그래프는 기본 틀로 표시됩니다.
        } catch (error) {
            console.error("운영 대시보드 조회 실패:", error);

            setLoadError(
                error.message
                ?? "운영 데이터를 불러오지 못했습니다."
            );

            setDashboardData(EMPTY_DASHBOARD);
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="operation-dashboard">
            <header className="operation-dashboard-header">
                <div>
                    <h1>운영 관리</h1>
                    <p>
                        대전 물류센터 A의 운영 현황과 주요 지표를
                        한눈에 확인합니다.
                    </p>
                </div>

                <div className="operation-dashboard-updated">
                    <span>기준 시각</span>
                    <strong>{dashboardData.updatedAt ?? "-"}</strong>
                </div>
            </header>

            <section className="operation-dashboard-filter">
                <label className="operation-filter-field">
                    <span className="sr-only">시작 날짜</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(event) =>
                            setStartDate(event.target.value)
                        }
                    />
                </label>

                <span className="operation-date-separator">~</span>

                <label className="operation-filter-field">
                    <span className="sr-only">종료 날짜</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(event) =>
                            setEndDate(event.target.value)
                        }
                    />
                </label>

                <label className="operation-filter-field">
                    <span className="sr-only">창고 선택</span>
                    <select
                        value={warehouseId}
                        onChange={(event) =>
                            setWarehouseId(event.target.value)
                        }
                    >
                        {WAREHOUSES.map((warehouse) => (
                            <option
                                key={warehouse.id}
                                value={warehouse.id}
                            >
                                {warehouse.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="operation-filter-field">
                    <span className="sr-only">시간대 선택</span>
                    <select
                        value={timeRange}
                        onChange={(event) =>
                            setTimeRange(event.target.value)
                        }
                    >
                        <option value="ALL">전체 시간대</option>
                        <option value="MORNING">00:00 ~ 12:00</option>
                        <option value="AFTERNOON">12:00 ~ 18:00</option>
                        <option value="EVENING">18:00 ~ 24:00</option>
                    </select>
                </label>

                <button
                    type="button"
                    className="operation-refresh-button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    <span className={isRefreshing ? "is-spinning" : ""}>
                        ↻
                    </span>

                    {isRefreshing ? "조회 중" : "조회"}
                </button>
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
                                (item) => (
                                    <div
                                        className="operation-bar-item"
                                        key={item.hour}
                                    >
                                        <span className="operation-bar-value">
                                            {item.count > 0
                                                ? item.count
                                                : ""}
                                        </span>

                                        <div
                                            className="operation-bar"
                                            style={{
                                                height: `${
                                                    (
                                                        Number(
                                                            item.count
                                                            ?? 0
                                                        )
                                                        / maxHourlyTask
                                                    ) * 100
                                                }%`,
                                            }}
                                        />

                                        <span className="operation-bar-label">
                                            {item.hour}
                                        </span>
                                    </div>
                                )
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
                            <p>창고별 완료 작업 수를 비교합니다.</p>
                        </div>

                        <select defaultValue="COUNT">
                            <option value="COUNT">작업 수</option>
                            <option value="RATE">완료율</option>
                        </select>
                    </div>

                    <div className="operation-horizontal-chart">
                        {dashboardData.warehouseThroughput.map(
                            (item) => (
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
                                                    (
                                                        Number(
                                                            item.count
                                                            ?? 0
                                                        )
                                                        / maxWarehouseCount
                                                    ) * 100
                                                }%`,
                                            }}
                                        />
                                    </div>

                                    <strong>
                                        {item.count > 0
                                            ? item.count
                                            : "-"}
                                    </strong>
                                </div>
                            )
                        )}
                    </div>
                </article>

                <article className="operation-panel">
                    <div className="operation-panel-header">
                        <div>
                            <h2>시간대별 이벤트 발생</h2>
                            <p>오류·경고·작업 이벤트 발생 추이입니다.</p>
                        </div>

                        <select
                            value={eventMetric}
                            onChange={(event) =>
                                setEventMetric(event.target.value)
                            }
                        >
                            <option value="COUNT">이벤트 수</option>
                            <option value="WARNING">경고 이벤트</option>
                            <option value="ERROR">오류 이벤트</option>
                        </select>
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
                            onClick={() => navigate("/simulation")}
                        >
                            전체 보기
                            <span>›</span>
                        </button>
                    </div>

                    <div className="operation-table-wrapper">
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
                                {dashboardData.recentTasks.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan="7"
                                            className="operation-table-empty"
                                        >
                                            표시할 작업 데이터가 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    dashboardData.recentTasks.map(
                                        (task) => (
                                            <tr
                                                key={
                                                    task.taskId
                                                    ?? task.id
                                                }
                                            >
                                                <td>
                                                    {task.taskCode
                                                    ?? task.taskId
                                                    ?? task.id
                                                    ?? "-"}
                                                </td>
                                                <td>
                                                    {task.warehouseName
                                                    ?? "대전 물류센터 A"}
                                                </td>
                                                <td>
                                                    {task.taskType
                                                    ?? "-"}
                                                </td>
                                                <td>
                                                    {task.status
                                                    ?? "-"}
                                                </td>
                                                <td>
                                                    {task.delayMinutes
                                                        ? `${task.delayMinutes}분`
                                                        : "-"}
                                                </td>
                                                <td>
                                                    {task.startedAt
                                                    ?? "-"}
                                                </td>
                                                <td>
                                                    {task.completedAt
                                                    ?? "-"}
                                                </td>
                                            </tr>
                                        )
                                    )
                                )}
                            </tbody>
                        </table>
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
        </div>
    );
}

export default OperationManagement;