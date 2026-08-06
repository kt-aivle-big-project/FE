import "../../styles/simulation/SimulationEvent.css";

const getEventTypeLabel = (eventType) => {
    switch (eventType) {
        case "PATH_BLOCKED":
            return "통로 차단";

        case "COLLISION_AVOIDANCE_WAIT":
            return "충돌 회피 대기";

        default:
            return eventType || "-";
    }
};

const formatEventTime = (dateTime) => {
    if (!dateTime) {
        return "-";
    }

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleTimeString(
        "ko-KR",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        },
    );
};

const formatWaitingSeconds = (seconds) => {
    const numericSeconds = Number(seconds);

    if (!Number.isFinite(numericSeconds)) {
        return null;
    }

    return `${numericSeconds.toFixed(1)}초 대기`;
};

function SimulationEvent({
    events = [],
}) {
    const sortedEvents = [...events]
        .sort((left, right) => (
            new Date(right.occurredAt).getTime()
            - new Date(left.occurredAt).getTime()
        ))
        .slice(0, 30);

    return (
        <section className="simulation-event">
            <div className="simulation-event-header">
                <h2 className="simulation-event-title">
                    최근 이벤트
                </h2>
            </div>

            <div className="simulation-event-list">
                {sortedEvents.length === 0 ? (
                    <div className="simulation-event-empty">
                        발생한 이벤트가 없습니다.
                    </div>
                ) : (
                    sortedEvents.map((event) => {
                        const isAvoidanceEvent =
                            event.eventType
                            === "COLLISION_AVOIDANCE_WAIT";

                        return (
                            <article
                                className={
                                    isAvoidanceEvent
                                        ? "simulation-event-card avoidance"
                                        : "simulation-event-card"
                                }
                                key={event.id}
                            >
                                <div className="simulation-event-card-header">
                                    <strong className="simulation-event-type">
                                        {getEventTypeLabel(
                                            event.eventType,
                                        )}
                                    </strong>

                                    <span className="simulation-event-time">
                                        {formatEventTime(
                                            event.occurredAt,
                                        )}
                                    </span>
                                </div>

                                <p className="simulation-event-description">
                                    {event.description}
                                </p>

                                <div className="simulation-event-info">
                                    {Array.isArray(event.robotIds)
                                    && event.robotIds.length > 0
                                        ? event.robotIds.map(
                                            (robotId) => (
                                                <span
                                                    key={`${event.id}-${robotId}`}
                                                >
                                                    R{robotId}
                                                </span>
                                            ),
                                        )
                                        : event.robotId !== null
                                            && event.robotId !== undefined
                                            && (
                                                <span>
                                                    R{event.robotId}
                                                </span>
                                            )}

                                    {event.taskId !== null
                                    && event.taskId !== undefined
                                    && (
                                        <span>
                                            Task #{event.taskId}
                                        </span>
                                    )}

                                    {event.nodeId !== null
                                    && event.nodeId !== undefined
                                    && (
                                        <span>
                                            Node {event.nodeId}
                                        </span>
                                    )}

                                    {isAvoidanceEvent
                                    && !event.resolvedAt
                                    && (
                                        <span className="avoidance-wait-time">
                                            {formatWaitingSeconds(
                                                event.waitingSeconds,
                                            )}
                                        </span>
                                    )}

                                    {event.source === "INFERRED" && (
                                        <span className="avoidance-inferred">
                                            화면 추정
                                        </span>
                                    )}
                                </div>

                                <div className="simulation-event-footer">
                                    <span
                                        className={
                                            event.resolvedAt
                                                ? "simulation-event-status resolved"
                                                : "simulation-event-status unresolved"
                                        }
                                    >
                                        {event.resolvedAt
                                            ? "이동 재개"
                                            : isAvoidanceEvent
                                                ? "대기 중"
                                                : "미해결"}
                                    </span>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        </section>
    );
}

export default SimulationEvent;