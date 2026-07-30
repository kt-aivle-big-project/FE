import { useState, useRef } from "react";
import "../styles/SimulationEvent.css";

function SimulationEvent({ events = [] }) {

    // 이벤트 유형 한글 변환
    const getEventTypeLabel = (eventType) => {
        switch (eventType) {
            case "PATH_BLOCKED":
                return "통로 차단";

            default:
                return eventType || "-";
        }
    };

    // 시간 표시
    const formatEventTime = (dateTime) => {
        if (!dateTime) {
            return "-";
        }

        const date = new Date(dateTime);

        return date.toLocaleTimeString(
            "ko-KR",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }
        );
    };

    return (
        <section className="simulation-event">
            <div className="simulation-event-header">
                <h2 className="simulation-event-title">
                    최근 이벤트
                </h2>
            </div>

            <div className="simulation-event-list">

                {events.length === 0 ? (

                    <div className="simulation-event-empty">
                        발생한 이벤트가 없습니다.
                    </div>

                ) : (

                    events.map((event) => (

                        <article
                            className="simulation-event-card"
                            key={event.id}
                        >

                            {/* 이벤트 상단 */}
                            <div className="simulation-event-card-header">

                                <strong className="simulation-event-type">
                                    {getEventTypeLabel(event.eventType)}
                                </strong>

                                <span className="simulation-event-time">
                                    {formatEventTime(event.occurredAt)}
                                </span>

                            </div>


                            {/* 이벤트 설명 */}
                            <p className="simulation-event-description">
                                {event.description}
                            </p>


                            {/* 관련 정보 */}
                            <div className="simulation-event-info">

                                {event.robotId !== null && (
                                    <span>R{event.robotId}</span>
                                )}

                                {event.taskId !== null && (
                                    <span>Task #{event.taskId}</span>
                                )}

                                {event.nodeId !== null && (
                                    <span>Node {event.nodeId}</span>
                                )}

                            </div>


                            {/* 해결 상태 */}
                            <div className="simulation-event-footer">

                                <span
                                    className={
                                        event.resolvedAt
                                            ? "simulation-event-status resolved"
                                            : "simulation-event-status unresolved"
                                    }
                                >
                                    {event.resolvedAt
                                        ? "해결"
                                        : "미해결"}
                                </span>

                            </div>

                        </article>

                    ))

                )}

            </div>

        </section>
    );
}

export default SimulationEvent;