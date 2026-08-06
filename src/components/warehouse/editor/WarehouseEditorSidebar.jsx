import {
    MAX_FACILITY_COUNT,
    MAX_FACILITY_STEP,
    MIN_FACILITY_COUNT,
    PALETTE_GROUPS,
    TOOL_META,
} from "./warehouseEditorConfig";
import {
    facilityGroupLabel,
    minimumFacilityStep,
    orderedFacilityMembers,
} from "./warehouseEditorUtils";

// 우측 도구·설비 설정·선택 항목 패널
function WarehouseEditorSidebar({
    activeTool,
    configurableFacilityGroups,
    selectedObject,
    selectedAisle,
    existingMapMode,
    onPalettePointerDown,
    onToolSelect,
    onFacilityCountChange,
    onFacilityStepChange,
    onFacilityOrientationChange,
    onRotateRack,
    onAisleDirectionChange,
}) {
    return (
        <aside className="layout-editor-palette">
            {/* PALETTE_GROUPS와 TOOL_META를 이용해 도구 버튼을 데이터 기반으로 생성한다. */}
            {PALETTE_GROUPS.map((group) => (
                <section key={group.title}>
                    <h4>{group.title}</h4>
                    <div className="layout-editor-palette-grid">
                        {group.tools.map((tool) => (
                            <button
                                key={tool}
                                type="button"
                                className={activeTool === tool ? "active" : ""}
                                onPointerDown={(event) => onPalettePointerDown(event, tool)}
                                onClick={() => onToolSelect(tool)}
                                title={TOOL_META[tool].description}
                            >
                                <span>{TOOL_META[tool].symbol}</span>
                                <strong>{TOOL_META[tool].label}</strong>
                            </button>
                        ))}
                    </div>
                </section>
            ))}

            {/* 반복 설비 그룹별 개수, 간격, 가로·세로 방향을 한 번에 조정한다. */}
            <section className="layout-editor-facility-settings">
                <h4>설비 설정</h4>
                {configurableFacilityGroups.length === 0 ? (
                    <p>입고지·출고지·충전소를 배치하면 개수와 방향을 설정할 수 있습니다.</p>
                ) : configurableFacilityGroups.map((group) => {
                    const members = orderedFacilityMembers(
                        group.members,
                        group.members[0]?.facilityOrientation,
                    );
                    const orientation = members[0]?.facilityOrientation ?? "VERTICAL";
                    const label = facilityGroupLabel(group.kind);
                    const step = Number(members[0]?.facilityStep) ||
                        minimumFacilityStep(members, orientation, existingMapMode);
                    const minimumStep = minimumFacilityStep(
                        members,
                        orientation,
                        existingMapMode,
                    );
                    return (
                        <div className={`layout-editor-facility-card kind-${group.kind}`} key={group.id}>
                            <div className="layout-editor-facility-card-title">
                                <strong>{label}</strong>
                                <span>{members.length}개</span>
                            </div>
                            <div className="layout-editor-facility-card-controls">
                                <label>
                                    <span>개수</span>
                                    <input
                                        type="number"
                                        min={MIN_FACILITY_COUNT}
                                        max={MAX_FACILITY_COUNT}
                                        aria-label={`${label} 개수`}
                                        value={members.length}
                                        onChange={(event) => onFacilityCountChange(group.id, event.target.value)}
                                    />
                                </label>
                                <label>
                                    <span>간격(m)</span>
                                    <input
                                        type="number"
                                        min={minimumStep}
                                        max={MAX_FACILITY_STEP}
                                        step="0.01"
                                        aria-label={`${label} 간격`}
                                        value={Number(step.toFixed(2))}
                                        onChange={(event) => onFacilityStepChange(group.id, event.target.value)}
                                    />
                                </label>
                                <div className="layout-editor-orientation-buttons">
                                    <button
                                        type="button"
                                        aria-label={`${label} 가로 배치`}
                                        className={orientation === "HORIZONTAL" ? "active" : ""}
                                        onClick={() => onFacilityOrientationChange(group.id, "HORIZONTAL")}
                                    >
                                        가로
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`${label} 세로 배치`}
                                        className={orientation === "VERTICAL" ? "active" : ""}
                                        onClick={() => onFacilityOrientationChange(group.id, "VERTICAL")}
                                    >
                                        세로
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </section>

            {/* 선택한 객체의 위치·종류 또는 선택한 엣지의 통행 방향을 확인하고 수정하는 인스펙터이다. */}
            {(selectedObject || selectedAisle) && (
                <section className="layout-editor-inspector">
                    <h4>선택 항목</h4>
                    {selectedObject && (
                        <>
                            <strong>{selectedObject.id}</strong>
                            <span>{selectedObject.rawNode?.type ?? TOOL_META[selectedObject.kind]?.label}</span>
                            <span>X {selectedObject.x}m · Y {selectedObject.y}m</span>
                            {selectedObject.kind === "rack" && (
                                <button type="button" onClick={onRotateRack}>
                                    선반 90° 회전
                                </button>
                            )}
                        </>
                    )}
                    {selectedAisle && (
                        <>
                            <strong>{selectedAisle.id}</strong>
                            <span>{selectedAisle.startNodeId} ↔ {selectedAisle.endNodeId}</span>
                            <label>
                                통행 방향
                                <select
                                    value={selectedAisle.direction}
                                    onChange={(event) => onAisleDirectionChange(event.target.value)}
                                >
                                    <option value="BOTH">양방향</option>
                                    <option value="FORWARD">시작 → 끝</option>
                                    <option value="REVERSE">끝 → 시작</option>
                                </select>
                            </label>
                        </>
                    )}
                </section>
            )}
        </aside>
    );
}

export default WarehouseEditorSidebar;