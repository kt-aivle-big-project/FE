import {
    EVENT_TYPE_LABELS,
    PRIORITY_LABELS,
    REPLAN_EVENT_LABELS,
    REPLAN_METHOD_LABELS,
    STATUS_LABELS,
    TASK_TYPE_LABELS,
    formatDateTime,
    getStatusClassName,
} from "./scenarioMockData";

import WarehouseSVG from "../WarehouseSVG.jsx";

function WarehouseMapPreview() {
    return (
        <div
            className="scenarios-map"
        >


            <div className="scenarios-map-preview-content">
                <WarehouseSVG
                    robots={[]}
                    simulationSpeed={1}
                />
            </div>
        </div>
    );
}


function ScenarioDetail({
    scenario,
    warehouse,
    onEdit,
    onClose,
    onRun,
    onOpenResult,
}) {
    const readinessItems = [
        {
            label: "창고 연결 관계 정상",
            ready: Boolean(warehouse),
        },
        {
            label: "작업 유형 선택 완료",
            ready: scenario.taskTypes.length > 0,
        },
        {
            label: "배터리 운영 조건 유효",
            ready:
                scenario.chargeThresholdPct <
                scenario.minimumOperationBatteryPct,
        },
        {
            label: "충전 작업 환경 확인",
            ready:
                !scenario.taskTypes.includes("CHARGING") ||
                (warehouse?.chargingStationCount ?? 0) > 0,
        },
        {
            label: "재계획 설정 정상",
            ready:
                !scenario.autoReplanEnabled ||
                scenario.replanEvents.length > 0,
        },
    ];

    const readyToRun = readinessItems.every((item) => item.ready);

    return (
        <aside className="scenario-detail-card">
            <header className="scenario-detail-header">
                <div className="scenario-detail-heading">
                    <div className="scenario-detail-title-row">
                        <h1>{scenario.name}</h1>
                        <span
                            className={`scenario-status ${getStatusClassName(
                                scenario.status
                            )}`}
                        >
                            {STATUS_LABELS[scenario.status]}
                        </span>
                    </div>

                    <p>
                        {scenario.description || "등록된 설명이 없습니다."}
                    </p>

                    <div className="scenario-detail-meta">
                        <strong>
                            {warehouse?.name || scenario.warehouseId}
                        </strong>
                        <span>·</span>
                        <span>
                            최종 수정 {formatDateTime(scenario.updatedAt)}
                        </span>
                    </div>
                </div>

                <div className="scenario-detail-actions">
                    <button
                        type="button"
                        className="scenario-button is-primary"
                        disabled={!readyToRun}
                        onClick={onRun}
                    >
                        시뮬레이션 실행
                    </button>
                    <button
                        type="button"
                        className="scenario-button is-secondary"
                        onClick={onEdit}
                    >
                        수정
                    </button>
                    <button
                        type="button"
                        className="scenario-icon-button"
                        onClick={onClose}
                        aria-label="상세 닫기"
                    >
                        ×
                    </button>
                </div>
            </header>

            {/* 창고 맵과 창고 구성 */}
            <section className="scenario-detail-section">
                <div className="scenario-section-heading">
                    <div>
                        <h2>시뮬레이션 환경</h2>
                        <p>
                            선택한 창고 구조를 확인합니다.
                        </p>
                    </div>
                </div>

                <div className="scenario-environment-grid">
                    <WarehouseMapPreview />

                    <div className="scenario-warehouse-summary">
                        <h3>{warehouse?.name || scenario.warehouseId}</h3>

                        <dl className="scenario-summary-grid">

                            <div>
                                <dt>창고맵</dt>
                                <dd>창고맵 타이틀명</dd>
                            </div>
                            <div>
                                <dt>구역</dt>
                                <dd>{warehouse?.zoneCount ?? "-"}개</dd>
                            </div>
                            <div>
                                <dt>선반</dt>
                                <dd>
                                    {warehouse?.storageLocationCount?.toLocaleString() ??
                                        "-"}
                                    개
                                </dd>
                            </div>
                            <div>
                                <dt>충전소</dt>
                                <dd>
                                    {warehouse?.chargingStationCount ?? "-"}개
                                </dd>
                            </div>
                            
                        </dl>

                        <div className="scenario-chip-block">
                            <strong>활성 작업 유형</strong>
                            <div className="scenario-chip-list">
                                {scenario.taskTypes.map((taskType) => (
                                    <span
                                        key={taskType}
                                        className="scenario-chip"
                                    >
                                        {TASK_TYPE_LABELS[taskType]}
                                    </span>
                                ))}
                            </div>
                            <p>
                                실행 시 설정 조건에 맞는 로봇이 자동 배정됩니다.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 운영 초기 조건 */}
            <section className="scenario-detail-section">
                <div className="scenario-section-heading">
                    <div>
                        <h2>운영 초기 조건</h2>
                        <p>
                            작업 투입과 충전 전환에 사용하는 기준값입니다.
                        </p>
                    </div>
                </div>

                <div className="scenario-condition-grid">
                    <article>
                        <span>작업 투입 최소 배터리</span>
                        <strong>
                            {scenario.minimumOperationBatteryPct}%
                        </strong>
                        <small>이상인 로봇만 작업 후보에 포함</small>
                    </article>

                    <article>
                        <span>충전 임계치</span>
                        <strong>{scenario.chargeThresholdPct}%</strong>
                        <small>이하인 로봇은 충전 대상으로 전환</small>
                    </article>

                    <article>
                        <span>자동 재계획</span>
                        <strong>
                            {scenario.autoReplanEnabled
                                ? "사용"
                                : "사용 안 함"}
                        </strong>
                        <small>
                            {scenario.autoReplanEnabled
                                ? "예외 발생 시 설정 방식으로 재계획"
                                : "자동 재계획을 수행하지 않음"}
                        </small>
                    </article>

                    <article>
                        <span>우선순위 정책</span>
                        <strong>
                            {PRIORITY_LABELS[scenario.priorityPolicy]}
                        </strong>
                        <small>작업 정렬과 배정 순서에 적용</small>
                    </article>

                    <article>
                        <span>재계획 방식</span>
                        <strong>
                            {scenario.autoReplanEnabled
                                ? REPLAN_METHOD_LABELS[scenario.replanMethod]
                                : "-"}
                        </strong>
                        <small>
                            {scenario.autoReplanEnabled
                                ? "선택한 범위만 다시 계산"
                                : "자동 재계획 미사용"}
                        </small>
                    </article>
                </div>
            </section>

            {/* 이벤트 및 예외 대응 */}
            <section className="scenario-detail-section">
                <div className="scenario-section-heading">
                    <div>
                        <h2>이벤트 및 예외 대응</h2>
                        <p>
                            시뮬레이션에서 사용할 이벤트와 재계획 조건입니다.
                        </p>
                    </div>
                </div>

                <div className="scenario-event-grid">
                    <div className="scenario-chip-block is-bordered">
                        <strong>이벤트 설정</strong>
                        <div className="scenario-chip-list">
                            {scenario.eventTypes.length > 0 ? (
                                scenario.eventTypes.map((eventType) => (
                                    <span
                                        key={eventType}
                                        className="scenario-chip"
                                    >
                                        {EVENT_TYPE_LABELS[eventType]}
                                    </span>
                                ))
                            ) : (
                                <span className="scenario-empty-text">
                                    선택한 이벤트가 없습니다.
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="scenario-chip-block is-bordered">
                        <strong>재계획 적용 이벤트</strong>
                        <div className="scenario-chip-list">
                            {scenario.autoReplanEnabled &&
                            scenario.replanEvents.length > 0 ? (
                                scenario.replanEvents.map((eventType) => (
                                    <span
                                        key={eventType}
                                        className="scenario-chip"
                                    >
                                        {REPLAN_EVENT_LABELS[eventType]}
                                    </span>
                                ))
                            ) : (
                                <span className="scenario-empty-text">
                                    자동 재계획을 사용하지 않습니다.
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* 실행 준비 상태 */}
            <section className="scenario-detail-section">
                <div className="scenario-section-heading is-inline">
                    <div>
                        <h2>실행 준비 상태</h2>
                        <p>
                            시뮬레이션 실행 전에 설정값을 확인합니다.
                        </p>
                    </div>

                    <span
                        className={`scenario-ready-badge ${
                            readyToRun ? "is-ready" : "is-warning"
                        }`}
                    >
                        {readyToRun ? "실행 가능" : "확인 필요"}
                    </span>
                </div>

                <div className="scenario-readiness-grid">
                    {readinessItems.map((item) => (
                        <div
                            key={item.label}
                            className={item.ready ? "is-ready" : "is-warning"}
                        >
                            <span>{item.ready ? "✓" : "!"}</span>
                            <strong>{item.label}</strong>
                        </div>
                    ))}
                </div>
            </section>

            {/* 최근 실행 이력 */}
            <section className="scenario-detail-section">
                <div className="scenario-section-heading">
                    <div>
                        <h2>최근 실행 이력</h2>
                        <p>
                            최근 실행한 시뮬레이션 결과를 확인합니다.
                        </p>
                    </div>
                </div>

                {scenario.runHistory.length > 0 ? (
                    <div className="scenario-run-table-wrap">
                        <table className="scenario-run-table">
                            <thead>
                                <tr>
                                    <th>실행 ID</th>
                                    <th>실행 일시</th>
                                    <th>상태</th>
                                    <th>전체 작업</th>
                                    <th>완료</th>
                                    <th>실패</th>
                                    <th>
                                        <span className="scenario-sr-only">
                                            결과 보기
                                        </span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {scenario.runHistory.map((run) => (
                                    <tr key={run.simulationId}>
                                        <td>{run.simulationId}</td>
                                        <td>
                                            {formatDateTime(run.executedAt)}
                                        </td>
                                        <td>{run.status}</td>
                                        <td>{run.totalTasks}건</td>
                                        <td>{run.completedTasks}건</td>
                                        <td>{run.failedTasks}건</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="scenario-text-button"
                                                onClick={() =>
                                                    onOpenResult(run)
                                                }
                                            >
                                                결과 보기
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="scenario-empty-state">
                        <strong>아직 실행 이력이 없습니다.</strong>
                        <p>
                            시뮬레이션을 실행하면 결과가 여기에 표시됩니다.
                        </p>
                    </div>
                )}
            </section>
        </aside>
    );
}


export default ScenarioDetail;
