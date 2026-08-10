import "../../styles/simulation/SimulationRobotList.css";

const ROBOT_STATUS_LABEL = {
    IDLE: "대기",
    WAITING: "대기",
    AVAILABLE: "대기",
    ASSIGNED: "배정",
    MOVING: "이동 중",
    WORKING: "작업 중",
    BUSY: "작업 중",
    IN_PROGRESS: "작업 중",
    SERVICING: "작업 중",
    PICKING: "픽업 중",
    DROPPING: "하차 중",
    LOADING: "적재 중",
    UNLOADING: "하역 중",
    CHARGING: "충전 중",
    STOPPED: "정지",
    ERROR: "오류",
    FAULT: "고장",
    FAILED: "고장",
    OFFLINE: "오프라인",
};

const TASK_TYPE_LABEL = {
    GENERAL: "일반 작업",
    NORMAL: "일반 작업",
    INBOUND: "입고",
    OUTBOUND: "출고",
    CHARGING: "충전",
    CHARGE: "충전",
    RELOCATION: "재배치",
    REPLENISHMENT: "보충",
    REPLENISH: "보충",
    PICKUP: "픽업",
    DROPOFF: "하차",
    DROP: "하차",
};

const SERVICE_KIND_LABEL = {
    PICKUP: "픽업",
    DROP: "하차",
    DROPOFF: "하차",
    CHARGE: "충전",
    RETURN: "복귀",
    PARK: "대기 위치 이동",
};

const normalizeValue = (value) =>
    typeof value === "string" ? value.toUpperCase() : value;

// 작업 중인 로봇을 우선 표시한다.
const workingRobots = robotList.filter(
    (robot) => robot.currentTaskId
);

// 세부 동작 상태가 있으면 로봇의 기본 상태보다 우선 표시한다.
const getRobotDisplayStatus = (robot) => {
    const activity = normalizeValue(robot.activity);

    if (activity && ROBOT_STATUS_LABEL[activity]) {
        return activity;
    }

    return normalizeValue(robot.status);
};

const getRobotStatusLabel = (robot) => {
    const status = getRobotDisplayStatus(robot);
    return ROBOT_STATUS_LABEL[status] ?? status ?? "-";
};

// 상태에 따라 배지 스타일을 구분한다.
const getRobotStatusClass = (robot) => {
    switch (getRobotDisplayStatus(robot)) {
        case "IDLE":
        case "WAITING":
        case "AVAILABLE":
            return "status-pending";

        case "ASSIGNED":
            return "status-assigned";

        case "MOVING":
        case "WORKING":
        case "BUSY":
        case "IN_PROGRESS":
        case "SERVICING":
        case "PICKING":
        case "DROPPING":
        case "LOADING":
        case "UNLOADING":
            return "status-in-progress";

        case "CHARGING":
            return "status-charging";

        case "ERROR":
        case "FAULT":
        case "FAILED":
            return "status-failed";

        case "STOPPED":
        case "OFFLINE":
            return "status-cancelled";

        default:
            return "status-default";
    }
};

const getRobotIdLabel = (robot) => {
    const robotId =
        robot.robot_code
        ?? robot.robotCode
        ?? robot.robot_id
        ?? robot.robotId
        ?? robot.id;

    if (robotId === null || robotId === undefined || robotId === "") {
        return "-";
    }

    const robotIdText = String(robotId);

    return robotIdText.toUpperCase().startsWith("R")
        ? robotIdText
        : `R${robotIdText}`;
};

// 이동 중에는 실제 출발 노드를 현재 위치로 사용한다.
const getRobotCurrentNodeLabel = (robot) =>
    robot.from_node_code
    ?? robot.fromNodeCode
    ?? robot.currentNodeCode
    ?? robot.current_node_code
    ?? robot.node_id
    ?? robot.nodeCode
    ?? robot.nodeId
    ?? "-";

// 다음 이동 노드가 현재 위치와 같으면 목적지가 없는 것으로 표시한다.
const getRobotNextNodeLabel = (robot) => {
    const currentNode = getRobotCurrentNodeLabel(robot);

    const nextNode =
        robot.to_node_code
        ?? robot.toNodeCode
        ?? robot.nextNodeCode
        ?? robot.next_node_code;

    if (
        nextNode === null
        || nextNode === undefined
        || nextNode === ""
        || String(nextNode) === String(currentNode)
    ) {
        return "-";
    }

    return String(nextNode);
};

const getRobotTaskId = (robot) =>
    robot.current_task_id
    ?? robot.currentTaskId
    ?? robot.taskId
    ?? robot.task_id;

const getRobotTaskType = (robot) =>
    robot.task_type
    ?? robot.taskType
    ?? robot.currentTaskType
    ?? robot.current_task_type;

const getRobotTaskTypeLabel = (robot) => {
    const taskType = getRobotTaskType(robot);
    const normalizedType = normalizeValue(taskType);

    return TASK_TYPE_LABEL[normalizedType] ?? taskType ?? null;
};

const getServiceKindLabel = (robot) => {
    const serviceKind =
        robot.service_kind
        ?? robot.serviceKind;

    const normalizedKind = normalizeValue(serviceKind);

    return SERVICE_KIND_LABEL[normalizedKind] ?? serviceKind ?? null;
};

// 0~1 또는 0~100 형태의 진행률을 모두 퍼센트 값으로 변환한다.
const normalizePercent = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return null;
    }

    const percent = numericValue <= 1
        ? numericValue * 100
        : numericValue;

    return Math.min(100, Math.max(0, percent));
};

const normalizeBattery = (battery) => normalizePercent(battery);

// 이동 중에는 이동 진행률, 작업 중에는 서비스 진행률을 사용한다.
const getRobotProgress = (robot) => {
    const movementProgress =
        robot.movement_progress
        ?? robot.movementProgress;

    if (movementProgress !== null && movementProgress !== undefined) {
        return normalizePercent(movementProgress);
    }

    const serviceProgress =
        robot.service_progress
        ?? robot.serviceProgress;

    return normalizePercent(serviceProgress);
};

const getBatteryClass = (battery) => {
    if (battery === null) {
        return "is-empty";
    }

    if (battery < 20) {
        return "is-danger";
    }

    if (battery < 40) {
        return "is-warning";
    }

    return "is-normal";
};

// 도착 예상 시간을 읽기 쉬운 초/분 단위로 변환한다.
const formatArrivalTime = (robot) => {
    const arrivalSeconds = Number(
        robot.arrival_in_seconds
        ?? robot.arrivalInSeconds
    );

    if (!Number.isFinite(arrivalSeconds)) {
        return "-";
    }

    const safeSeconds = Math.max(0, arrivalSeconds);

    if (safeSeconds < 60) {
        return `${safeSeconds.toFixed(1)}초`;
    }

    const minutes = Math.floor(safeSeconds / 60);
    const seconds = Math.round(safeSeconds % 60);

    return `${minutes}분 ${seconds}초`;
};

// 대기 원인이나 적재 상태가 있으면 상태 아래에 보조 정보로 표시한다.
const getRobotStatusDetail = (robot) => {
    const waitingReason =
        robot.waiting_reason
        ?? robot.waitingReason;

    const blockingRobotId =
        robot.blocking_robot_id
        ?? robot.blockingRobotId;

    if (waitingReason) {
        if (blockingRobotId !== null && blockingRobotId !== undefined) {
            return `${waitingReason} · R${blockingRobotId}`;
        }

        return waitingReason;
    }

    if (robot.carrying_load === true || robot.carryingLoad === true) {
        return "적재 중";
    }

    return null;
};

// 상태별 로봇 개수를 한 번의 순회로 계산한다.
const getRobotSummary = (robotList) =>
    robotList.reduce(
        (summary, robot) => {
            switch (getRobotDisplayStatus(robot)) {
                case "IDLE":
                case "WAITING":
                case "AVAILABLE":
                    summary.waiting += 1;
                    break;

                case "ASSIGNED":
                case "MOVING":
                case "WORKING":
                case "BUSY":
                case "IN_PROGRESS":
                case "SERVICING":
                case "PICKING":
                case "DROPPING":
                case "LOADING":
                case "UNLOADING":
                    summary.working += 1;
                    break;

                case "CHARGING":
                    summary.charging += 1;
                    break;

                case "ERROR":
                case "FAULT":
                case "FAILED":
                case "OFFLINE":
                    summary.error += 1;
                    break;

                default:
                    break;
            }

            return summary;
        },
        {
            waiting: 0,
            working: 0,
            charging: 0,
            error: 0,
        }
    );

function SimulationRobotList({ robotList = [] }) {
    const robotSummary = getRobotSummary(robotList);

    return (
        <section className="simulation-list simulation-robot-list">
            <header className="simulation-robot-list-header">
                <div>
                    <h2 className="simulation-robot-list-title">ROBOT LIST</h2>
                    <span className="simulation-robot-list-count">
                        전체 {robotList.length}대
                    </span>
                </div>

                <div
                    className="simulation-robot-list-summary"
                    aria-label="로봇 상태 요약"
                >
                    <span>대기 {robotSummary.waiting}</span>
                    <span>작업 {robotSummary.working}</span>
                    <span>충전 {robotSummary.charging}</span>

                    {robotSummary.error > 0 && (
                        <span className="is-danger">
                            오류 {robotSummary.error}
                        </span>
                    )}
                </div>
            </header>

            <div className="simulation-robot-list-table-wrapper">
                <table className="simulation-robot-list-table">
                    <thead>
                        <tr>
                            <th scope="col">로봇 ID</th>
                            <th scope="col">현재 위치</th>
                            <th scope="col">다음 위치</th>
                            <th scope="col">배터리</th>
                            <th scope="col">현재 작업</th>
                            <th scope="col">진행률</th>
                            <th scope="col">도착 예상</th>
                            <th scope="col">상태</th>
                        </tr>
                    </thead>

                    <tbody>
                        {robotList.length === 0 ? (
                            <tr>
                                <td
                                    className="simulation-robot-list-empty"
                                    colSpan={8}
                                >
                                    현재 등록된 로봇이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            workingRobots.slice(0, 5).map((robot, index) => {
                                const battery = normalizeBattery(robot.battery);
                                const progress = getRobotProgress(robot);
                                const taskId = getRobotTaskId(robot);
                                const taskType = getRobotTaskTypeLabel(robot);
                                const serviceKind = getServiceKindLabel(robot);
                                const statusDetail = getRobotStatusDetail(robot);
                                const batteryClass = getBatteryClass(battery);

                                return (
                                    <tr
                                        key={
                                            robot.robot_id
                                            ?? robot.robotId
                                            ?? robot.id
                                            ?? `robot-${index}`
                                        }
                                    >
                                        <td className="simulation-robot-list-id">
                                            {getRobotIdLabel(robot)}
                                        </td>

                                        <td className="simulation-robot-list-location">
                                            {getRobotCurrentNodeLabel(robot)}
                                        </td>

                                        <td className="simulation-robot-list-next-location">
                                            {getRobotNextNodeLabel(robot)}
                                        </td>

                                        <td>
                                            <div
                                                className={`simulation-robot-list-battery ${batteryClass}`}
                                            >
                                                <div
                                                    className="simulation-robot-list-battery-track"
                                                    aria-hidden="true"
                                                >
                                                    <span
                                                        style={{
                                                            width: `${battery ?? 0}%`,
                                                        }}
                                                    />
                                                </div>

                                                <strong>
                                                    {battery !== null
                                                        ? `${Math.round(battery)}%`
                                                        : "-"}
                                                </strong>
                                            </div>
                                        </td>

                                        <td className="simulation-robot-list-task">
                                            <strong>
                                                {taskId !== null
                                                && taskId !== undefined
                                                    ? `Task #${taskId}`
                                                    : "-"}
                                            </strong>

                                            {(taskType || serviceKind) && (
                                                <small>
                                                    {[taskType, serviceKind]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </small>
                                            )}
                                        </td>

                                        <td>
                                            <div className="simulation-robot-list-progress">
                                                {progress !== null ? (
                                                    <>
                                                        <div
                                                            className="simulation-robot-list-progress-track"
                                                            aria-hidden="true"
                                                        >
                                                            <span
                                                                style={{
                                                                    width: `${progress}%`,
                                                                }}
                                                            />
                                                        </div>
                                                        <strong>
                                                            {Math.round(progress)}%
                                                        </strong>
                                                    </>
                                                ) : (
                                                    <strong>-</strong>
                                                )}
                                            </div>
                                        </td>

                                        <td className="simulation-robot-list-eta">
                                            {formatArrivalTime(robot)}
                                        </td>

                                        <td className="simulation-robot-list-status-cell">
                                            <span
                                                className={`simulation-robot-list-status ${getRobotStatusClass(
                                                    robot
                                                )}`}
                                            >
                                                {getRobotStatusLabel(robot)}
                                            </span>

                                            {statusDetail && (
                                                <small>{statusDetail}</small>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default SimulationRobotList;
