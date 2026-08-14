import "../../styles/simulation/SimulationEventList.css";

const EVENT_TYPE_LABEL = {
    PATH_BLOCKED: "통로 차단",
    COLLISION_AVOIDANCE_WAIT: "충돌 회피 대기",
    ROBOT_FAILURE: "로봇 고장",
    LOW_BATTERY: "배터리 부족",
    NEW_TASK_ADDED: "신규 작업",
    ROBOT_TASK_COMPLETED: "작업 완료",
    OBSTACLE_DETECTED: "장애물 감지",
    REPLAN_TRIGGERED: "재계획 수행",
    REPLAN_COMPLETED: "재계획 완료",
    MANUAL_REQUEST: "수동 재계획",
};

const RESOLVED_STATUS = new Set([
    "RESOLVED",
    "DONE",
    "COMPLETED",
    "CLOSED",
]);

const normalizeValue = (value) =>
    typeof value === "string" ? value.toUpperCase() : value;

const getEventType = (event) =>
    event.eventType
    ?? event.type
    ?? event.code
    ?? "";

const getEventTypeLabel = (event) => {
    const eventType = getEventType(event);

    return EVENT_TYPE_LABEL[normalizeValue(eventType)]
        ?? eventType
        ?? "-";
};

const formatSimulationTime = (milliseconds) => {
    const totalSeconds = Math.max(
        0,
        Math.floor(Number(milliseconds) / 1000)
    );

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
};

// 실제 시각이 없으면 기존처럼 시뮬레이션 경과 시간을 사용한다.
const formatEventTime = (event) => {
    const dateTime =
        event.occurredAt
        ?? event.occurred_at
        ?? event.createdAt
        ?? event.created_at
        ?? event.timestamp
        ?? event.eventAt;

    if (dateTime) {
        const date = new Date(dateTime);

        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            });
        }
    }

    const simulationTime =
        event.simulationTimeMillis
        ?? event.simulation_time_ms
        ?? event.elapsedMillis;

    return Number.isFinite(Number(simulationTime))
        ? formatSimulationTime(simulationTime)
        : "-";
};

const formatWaitingSeconds = (event) => {
    const seconds =
        event.waitingSeconds
        ?? event.waiting_seconds;

    if (seconds === null || seconds === undefined || seconds === "") {
        return "-";
    }

    const numericSeconds = Number(seconds);

    return Number.isFinite(numericSeconds)
        ? `${numericSeconds.toFixed(1)}초`
        : "-";
};

const getRobotIdLabel = (robotId) => {
    if (robotId === null || robotId === undefined || robotId === "") {
        return null;
    }

    const robotIdText = String(robotId);

    return robotIdText.toUpperCase().startsWith("R")
        ? robotIdText
        : `R${robotIdText}`;
};

// 명시된 레벨이 없으면 이벤트 유형을 기준으로 화면 레벨을 결정한다.
const getEventLevel = (event) => {
    const explicitLevel = normalizeValue(
        event.level
        ?? event.severity
        ?? event.priority
    );

    if (["ERROR", "CRITICAL", "DANGER"].includes(explicitLevel)) {
        return {
            label: "위험",
            className: "is-danger",
        };
    }

    if (["WARN", "WARNING"].includes(explicitLevel)) {
        return {
            label: "경고",
            className: "is-warning",
        };
    }

    const eventType = normalizeValue(getEventType(event));

    if (eventType === "ROBOT_FAILURE") {
        return {
            label: "위험",
            className: "is-danger",
        };
    }

    if (
        [
            "PATH_BLOCKED",
            "COLLISION_AVOIDANCE_WAIT",
            "LOW_BATTERY",
            "OBSTACLE_DETECTED",
        ].includes(eventType)
    ) {
        return {
            label: "경고",
            className: "is-warning",
        };
    }

    return {
        label: "정보",
        className: "is-info",
    };
};

// 현재 이벤트 데이터의 로봇, 작업, 노드 정보를 한 칸에 모아 표시한다.
const getEventTargetList = (event) => {
    const targetList = [];

    const robotIds =
        event.robotIds
        ?? event.robot_ids;

    if (Array.isArray(robotIds) && robotIds.length > 0) {
        robotIds.forEach((robotId) => {
            const robotLabel = getRobotIdLabel(robotId);

            if (robotLabel) {
                targetList.push(robotLabel);
            }
        });
    } else {
        const robotId =
            event.robotId
            ?? event.robot_id
            ?? event.targetRobotId;

        const robotLabel = getRobotIdLabel(robotId);

        if (robotLabel) {
            targetList.push(robotLabel);
        }
    }

    const taskId =
        event.taskId
        ?? event.task_id
        ?? event.targetTaskId;

    if (taskId !== null && taskId !== undefined) {
        targetList.push(`Task #${taskId}`);
    }

    const nodeId =
        event.nodeId
        ?? event.node_id
        ?? event.waitingNodeCode
        ?? event.waiting_node_code;

    if (nodeId !== null && nodeId !== undefined) {
        targetList.push(`Node ${nodeId}`);
    }

    if (event.source === "INFERRED") {
        targetList.push("화면 추정");
    }

    return [...new Set(targetList)];
};

const isResolvedEvent = (event) => {
    const status = normalizeValue(
        event.status
        ?? event.eventStatus
        ?? event.event_status
    );

    return Boolean(
        event.resolved === true
        || event.isResolved === true
        || event.resolvedAt
        || event.resolved_at
        || RESOLVED_STATUS.has(status)
    );
};

const getEventStatus = (event) => {
    if (isResolvedEvent(event)) {
        return {
            label: "해결",
            className: "is-resolved",
        };
    }

    const isAvoidanceEvent =
        normalizeValue(getEventType(event))
        === "COLLISION_AVOIDANCE_WAIT";

    if (isAvoidanceEvent) {
        return {
            label: "대기 중",
            className: "is-waiting",
        };
    }

    return {
        label: "미해결",
        className: "is-unresolved",
    };
};

const getEventDescription = (event) =>
    event.description
    ?? event.message
    ?? event.eventDescription
    ?? event.event_description
    ?? "-";

function SimulationEventList({ eventList = [] }) {
    // 최신 이벤트가 위에 오도록 정렬하고 화면에는 최근 30건만 유지한다.
    const sortedEventList = [...eventList]
        .sort((left, right) => (
            new Date(
                right.occurredAt
                ?? right.occurred_at
                ?? right.createdAt
                ?? right.created_at
                ?? right.timestamp
                ?? 0
            ).getTime()
            - new Date(
                left.occurredAt
                ?? left.occurred_at
                ?? left.createdAt
                ?? left.created_at
                ?? left.timestamp
                ?? 0
            ).getTime()
        ))
        .slice(0, 30);

    return (
        <section className="simulation-list simulation-event-list">
            <header className="simulation-event-list-header">
                <div>
                    <h2 className="simulation-event-list-title">EVENT LIST</h2>
                    <span className="simulation-event-list-count">
                        최근 {sortedEventList.length}건
                    </span>
                </div>
            </header>

            <div className="simulation-event-list-table-wrapper">
                <table className="simulation-event-list-table">
                    <thead>
                        <tr>
                            <th scope="col">시간</th>
                            <th scope="col">레벨</th>
                            <th scope="col">이벤트</th>
                            <th scope="col">관련 정보</th>
                            <th scope="col">대기 시간</th>
                            <th scope="col">해결 여부</th>
                        </tr>
                    </thead>

                    <tbody>
                        {sortedEventList.length === 0 ? (
                            <tr>
                                <td
                                    className="simulation-event-list-empty"
                                    colSpan={6}
                                >
                                    발생한 이벤트가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            sortedEventList.map((event, index) => {
                                const eventType = normalizeValue(
                                    getEventType(event)
                                );

                                const isAvoidanceEvent =
                                    eventType === "COLLISION_AVOIDANCE_WAIT";

                                const level = getEventLevel(event);
                                const status = getEventStatus(event);
                                const targetList = getEventTargetList(event);

                                return (
                                    <tr
                                        className={
                                            isAvoidanceEvent
                                                ? "is-avoidance"
                                                : undefined
                                        }
                                        key={event.id ?? `event-${index}`}
                                    >
                                        <td className="simulation-event-list-time">
                                            {formatEventTime(event)}
                                        </td>

                                        <td>
                                            <span
                                                className={`simulation-event-list-level ${level.className}`}
                                            >
                                                {level.label}
                                            </span>
                                        </td>

                                        <td className="simulation-event-list-event">
                                            <strong>
                                                {getEventTypeLabel(event)}
                                            </strong>
                                            <small>
                                                {getEventDescription(event)}
                                            </small>
                                        </td>

                                        <td className="simulation-event-list-related">
                                            {targetList.length > 0
                                                ? targetList.join(" · ")
                                                : "-"}
                                        </td>

                                        <td className="simulation-event-list-waiting">
                                            {formatWaitingSeconds(event)}
                                        </td>

                                        <td>
                                            <span
                                                className={`simulation-event-list-status ${status.className}`}
                                            >
                                                {status.label}
                                            </span>
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

export default SimulationEventList;
