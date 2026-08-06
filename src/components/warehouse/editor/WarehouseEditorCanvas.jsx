import { getLayoutConnectionPoint } from "../../../utils/warehouseLayoutBuilder";
import { TOOL_GUIDE_MESSAGES } from "./warehouseEditorConfig";
import {
    aisleVisualClass,
    facilityGroupLabel,
    isInternalAccessObject,
    objectDimensions,
} from "./warehouseEditorUtils";

// SVG 편집 캔버스
function WarehouseEditorCanvas({
    svgRef,
    dimensionsReady,
    numericWidth,
    numericHeight,
    editorGridSize,
    visualGridSize,
    activeViewport,
    activeTool,
    panning,
    existingMapMode,
    showGraph,
    facilityGroups,
    selectedFacilityGroupId,
    aisles,
    objectById,
    selectedAisle,
    deleteHold,
    importantAisleIds,
    visibleEdges,
    nodeById,
    compiled,
    orderedRenderObjects,
    importantNodeIds,
    selectedObject,
    aisleStart,
    facilityDisplayIndexById,
    aisleStartPoint,
    edgeMessage,
    onCanvasClick,
    onCanvasPan,
    onPointerMove,
    onPointerEnd,
    onAislePointerDown,
    onAisleClick,
    onObjectPointerDown,
    onConnectionNodeClick,
}) {
    return (
        <section className="layout-editor-canvas-panel">
            {!dimensionsReady ? (
                <div className="layout-editor-empty">
                    창고 가로·세로 크기를 입력하면 설계 영역이 열립니다.
                </div>
            ) : (
                <div
                    className={`layout-editor-canvas ${activeTool === "AISLE" ? "drawing-aisle" : ""} ${activeTool === "DELETE" ? "deleting" : ""} ${panning ? "panning" : ""}`}
                >
                    {/*
                      SVG의 viewBox가 현재 viewport 역할을 한다.
                      포인터 이벤트는 이 요소에서 받아 객체 이동, 캔버스 이동, 배치, 연결을 처리한다.
                    */}
                    <svg
                        ref={svgRef}
                        viewBox={`${activeViewport.x} ${activeViewport.y} ${activeViewport.width} ${activeViewport.height}`}
                        preserveAspectRatio="xMidYMid meet"
                        onClick={onCanvasClick}
                        onPointerDown={onCanvasPan}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerEnd}
                        onPointerCancel={onPointerEnd}
                        role="application"
                        aria-label="창고 지도 설계 캔버스"
                    >
                        {/* 객체를 정확한 간격으로 배치할 수 있도록 작은 격자와 큰 격자 패턴을 정의한다. */}
                        <defs>
                            <pattern
                                id="warehouse-editor-minor-grid"
                                width={editorGridSize}
                                height={editorGridSize}
                                patternUnits="userSpaceOnUse"
                            >
                                <path
                                    d={`M ${editorGridSize} 0 L 0 0 0 ${editorGridSize}`}
                                    fill="none"
                                    stroke={existingMapMode ? "#f5f7fa" : "#e2e8f0"}
                                    strokeWidth={existingMapMode ? "0.004" : "0.05"}
                                />
                            </pattern>
                            <pattern
                                id="warehouse-editor-major-grid"
                                width={visualGridSize}
                                height={visualGridSize}
                                patternUnits="userSpaceOnUse"
                            >
                                <path
                                    d={`M ${visualGridSize} 0 L 0 0 0 ${visualGridSize}`}
                                    fill="none"
                                    stroke={existingMapMode ? "#e5eaf0" : "#e2e8f0"}
                                    strokeWidth={existingMapMode ? "0.012" : "0.05"}
                                />
                            </pattern>
                        </defs>

                        {/* 창고 전체 경계와 기본 작은 격자를 그리는 배경 사각형이다. */}
                        <rect
                            x="0"
                            y="0"
                            width={numericWidth}
                            height={numericHeight}
                            fill="url(#warehouse-editor-minor-grid)"
                            stroke="#0f172a"
                            strokeWidth="0.15"
                        />
                        {existingMapMode && (
                            <rect
                                x="0"
                                y="0"
                                width={numericWidth}
                                height={numericHeight}
                                fill="url(#warehouse-editor-major-grid)"
                                pointerEvents="none"
                            />
                        )}

                        {/* 같은 그룹으로 묶인 반복 설비의 전체 범위와 개수를 배경 테두리로 표시한다. */}
                        <g className="layout-editor-facility-groups" aria-label="반복 설비 그룹">
                            {facilityGroups.map((group) => {
                                const padding = existingMapMode ? 0.12 : 0.4;
                                const selectedGroup = group.id === selectedFacilityGroupId;
                                return (
                                    <g key={group.id} className={selectedGroup ? "selected" : ""}>
                                        <rect
                                            x={group.bounds.left - padding}
                                            y={group.bounds.top - padding}
                                            width={group.bounds.right - group.bounds.left + padding * 2}
                                            height={group.bounds.bottom - group.bounds.top + padding * 2}
                                            rx={existingMapMode ? 0.08 : 0.25}
                                        />
                                        <text
                                            x={(group.bounds.left + group.bounds.right) / 2}
                                            y={group.bounds.top - padding - (existingMapMode ? 0.08 : 0.22)}
                                        >
                                            {facilityGroupLabel(group.kind)} · {group.members.length}개
                                        </text>
                                    </g>
                                );
                            })}
                        </g>

                        {/*
                          사용자가 직접 만든 엣지를 그린다.
                          첫 번째 투명한 굵은 선은 클릭 영역을 넓히고, 두 번째 선은 실제 시각 스타일을 담당한다.
                        */}
                        <g className={`layout-editor-raw-aisles ${existingMapMode ? "compact" : ""}`}>
                            {aisles.map((aisle) => {
                                const startObject = objectById.get(aisle.startNodeId);
                                const endObject = objectById.get(aisle.endNodeId);
                                if (existingMapMode && !showGraph &&
                                    (isInternalAccessObject(startObject) || isInternalAccessObject(endObject))) {
                                    return null;
                                }
                                const startPoint = getLayoutConnectionPoint(
                                    startObject,
                                );
                                const endPoint = getLayoutConnectionPoint(
                                    endObject,
                                );

                                if (!startPoint || !endPoint) {
                                    return null;
                                }

                                const deleting = deleteHold?.type === "aisle" &&
                                    deleteHold.id === aisle.id;
                                const className = `${aisleVisualClass(aisle)} ${selectedAisle?.id === aisle.id ? "selected" : ""} ${deleting ? "delete-pending" : ""}`;

                                return (
                                    <g key={aisle.id}>
                                        <line
                                            x1={startPoint.x}
                                            y1={startPoint.y}
                                            x2={endPoint.x}
                                            y2={endPoint.y}
                                            className="aisle-hit-area"
                                            onPointerDown={(event) => onAislePointerDown(event, aisle.id)}
                                            onClick={(event) => onAisleClick(event, aisle.id)}
                                        />
                                        <line
                                            x1={startPoint.x}
                                            y1={startPoint.y}
                                            x2={endPoint.x}
                                            y2={endPoint.y}
                                            className={className}
                                            onPointerDown={(event) => onAislePointerDown(event, aisle.id)}
                                            onClick={(event) => onAisleClick(event, aisle.id)}
                                        >
                                            <title>
                                                {aisle.id} / {aisle.startNodeId} → {aisle.endNodeId} / {aisle.direction}
                                            </title>
                                        </line>
                                        {existingMapMode && showGraph && importantAisleIds.has(aisle.id) && (
                                            <text
                                                className="layout-editor-edge-id"
                                                x={(startPoint.x + endPoint.x) / 2}
                                                y={(startPoint.y + endPoint.y) / 2}
                                            >
                                                {aisle.id}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>

                        {/* 신규 지도 모드에서는 컴파일 과정에서 생성된 보조 경로망도 필요할 때 함께 표시한다. */}
                        {!existingMapMode && showGraph && (
                            <g className="layout-editor-generated-graph">
                                {visibleEdges.map((edge) => {
                                    const source = nodeById.get(edge.source);
                                    const target = nodeById.get(edge.target);

                                    if (!source || !target || source.type === "rack_storage" || target.type === "rack_storage") {
                                        return null;
                                    }

                                    return (
                                        <line
                                            key={`${edge.source}-${edge.target}`}
                                            x1={source.x}
                                            y1={source.y}
                                            x2={target.x}
                                            y2={target.y}
                                            className={edge.service_only ? "service-edge" : "route-edge"}
                                        />
                                    );
                                })}
                                {compiled.map.nodes
                                    .filter((node) => node.type === "route")
                                    .map((node) => (
                                        <circle key={node.id} cx={node.x} cy={node.y} r="0.18">
                                            <title>{node.id}</title>
                                        </circle>
                                    ))}
                            </g>
                        )}

                        {/*
                          렌더링 대상 객체를 종류별 SVG 도형으로 표현한다.
                          경로 노드는 원, 충전소는 삼각형, 나머지 시설은 사각형을 기본으로 사용한다.
                        */}
                        <g className="layout-editor-objects">
                            {orderedRenderObjects.map((object) => {
                                if (object.kind === "route") {
                                    const showRouteLabel = existingMapMode
                                        ? showGraph && importantNodeIds.has(object.id)
                                        : !object.rawNode || showGraph;
                                    const deleting = deleteHold?.type === "object" &&
                                        deleteHold.id === object.id;
                                    return (
                                        <g
                                            key={object.id}
                                            data-node-id={object.id}
                                            className={`layout-editor-object route-object raw-${object.rawNode?.type ?? "new"} ${existingMapMode ? "compact-object" : ""} ${selectedObject?.id === object.id ? "selected" : ""} ${activeTool === "AISLE" ? "edge-selectable" : ""} ${aisleStart?.nodeId === object.id ? "edge-start" : ""} ${deleting ? "delete-pending" : ""}`}
                                            onPointerDown={(event) => onObjectPointerDown(event, object)}
                                            onClick={(event) => onConnectionNodeClick(event, object)}
                                        >
                                            {existingMapMode && (
                                                <circle className="node-hit-target" cx={object.x} cy={object.y} r="0.12" />
                                            )}
                                            <circle cx={object.x} cy={object.y} r={existingMapMode || object.rawNode ? "0.07" : "0.36"} />
                                            {showRouteLabel && (
                                                <text
                                                    className={existingMapMode ? "compact-node-id" : ""}
                                                    x={object.x}
                                                    y={object.y - (existingMapMode ? 0.16 : 0.55)}
                                                >
                                                    {object.id}
                                                </text>
                                            )}
                                            <title>{object.id} / {object.rawNode?.type ?? "route"}</title>
                                        </g>
                                    );
                                }

                                const dimensions = objectDimensions(object);
                                const connectionPoint = getLayoutConnectionPoint(object);
                                const rawType = object.rawNode?.type;
                                const rawAccess = rawType?.includes("access") && !object.facilityEndpoint;
                                const rawLogical = rawType === "inbound" || rawType === "outbound";
                                const chargingStation = object.kind === "charging";
                                const rawLabel = object.rawNode?.label ?? object.id.replace(/^[IO]_/, "");
                                const facilityTag = object.facilityGroupId
                                    ? facilityDisplayIndexById.get(object.id) ?? Number(object.facilityIndex ?? 0) + 1
                                    : rawLabel;
                                const showPrimaryLabel = object.kind !== "rack" ||
                                    !existingMapMode || showGraph;
                                const deleting = deleteHold?.type === "object" &&
                                    deleteHold.id === object.id;
                                return (
                                    <g
                                        key={object.id}
                                        data-node-id={object.id}
                                        className={`layout-editor-object kind-${object.kind} raw-${rawType ?? "new"} ${existingMapMode ? "compact-object" : ""} ${selectedObject?.id === object.id || (object.facilityGroupId && object.facilityGroupId === selectedFacilityGroupId) ? "selected" : ""} ${activeTool === "AISLE" ? "edge-selectable" : ""} ${aisleStart?.nodeId === object.id ? "edge-start" : ""} ${deleting ? "delete-pending" : ""}`}
                                        onPointerDown={(event) => onObjectPointerDown(event, object)}
                                        onClick={(event) => onConnectionNodeClick(event, object)}
                                    >
                                        {existingMapMode && !rawLogical && object.kind !== "rack" && (
                                            <circle className="node-hit-target" cx={object.x} cy={object.y} r="0.12" />
                                        )}
                                        {rawAccess ? (
                                            <circle cx={object.x} cy={object.y} r={existingMapMode ? "0.075" : "0.11"} />
                                        ) : chargingStation ? (
                                            <>
                                                <polygon points={`${object.x},${object.y - 0.2} ${object.x - 0.18},${object.y + 0.16} ${object.x + 0.18},${object.y + 0.16}`} />
                                                <text className="charging-symbol" x={object.x} y={object.y + 0.08}>{facilityTag}</text>
                                            </>
                                        ) : (
                                            <rect
                                                x={object.x - dimensions.width / 2}
                                                y={object.y - dimensions.height / 2}
                                                width={dimensions.width}
                                                height={dimensions.height}
                                                rx={object.kind === "rack" ? 0.04 : 0.08}
                                            />
                                        )}
                                        {object.kind === "rack" && (
                                            <>
                                                <line
                                                    x1={object.x - dimensions.width / 2}
                                                    y1={object.y - dimensions.height / 6}
                                                    x2={object.x + dimensions.width / 2}
                                                    y2={object.y - dimensions.height / 6}
                                                />
                                                <line
                                                    x1={object.x - dimensions.width / 2}
                                                    y1={object.y + dimensions.height / 6}
                                                    x2={object.x + dimensions.width / 2}
                                                    y2={object.y + dimensions.height / 6}
                                                />
                                                <circle
                                                    className="rack-center-node"
                                                    cx={object.x}
                                                    cy={object.y}
                                                    r={existingMapMode ? "0.045" : "0.16"}
                                                >
                                                    <title>{object.id} 연결 노드</title>
                                                </circle>
                                            </>
                                        )}
                                        {!rawAccess && !chargingStation && showPrimaryLabel && (
                                            <text
                                                className={object.rawNode && existingMapMode ? "raw-object-label" : ""}
                                                x={object.x}
                                                y={object.facilityGroupId ? object.y : object.y + (rawLogical ? 0.03 : 0.15)}
                                            >
                                                {object.facilityGroupId ? facilityTag : object.id}
                                            </text>
                                        )}
                                        {existingMapMode && showGraph && rawAccess && importantNodeIds.has(object.id) && (
                                            <text className="compact-node-id" x={object.x} y={object.y - 0.16}>
                                                {object.id}
                                            </text>
                                        )}
                                        {!object.rawNode && !chargingStation && (
                                            <>
                                                <line
                                                    className="layout-editor-connection-stem"
                                                    x1={object.x}
                                                    y1={object.y}
                                                    x2={connectionPoint.x}
                                                    y2={connectionPoint.y}
                                                />
                                                <circle
                                                    className="layout-editor-connection-handle"
                                                    cx={connectionPoint.x}
                                                    cy={connectionPoint.y}
                                                    r={existingMapMode ? "0.12" : "0.34"}
                                                >
                                                    <title>{object.id} 연결 노드</title>
                                                </circle>
                                            </>
                                        )}
                                        <title>{object.id} / {rawType ?? object.kind}</title>
                                    </g>
                                );
                            })}
                        </g>

                        {/* 엣지의 시작 노드를 선택한 동안 두 번째 노드 선택을 유도하는 강조 표시이다. */}
                        {aisleStartPoint && (
                            <g className={`layout-editor-aisle-start ${existingMapMode ? "compact" : ""}`}>
                                <circle
                                    cx={aisleStartPoint.x}
                                    cy={aisleStartPoint.y}
                                    r={existingMapMode ? "0.13" : "0.5"}
                                />
                                {!existingMapMode && (
                                    <text x={aisleStartPoint.x} y={aisleStartPoint.y - 0.7}>두 번째 노드를 선택하세요</text>
                                )}
                            </g>
                        )}
                    </svg>
                </div>
            )}

            {/* 지도 크기, 이동 단위, 생성 통계, 조작법, 현재 도구 안내를 실시간으로 보여 준다. */}
            <div className="layout-editor-statusbar">
                <span>{numericWidth || 0}m × {numericHeight || 0}m</span>
                <span>이동 단위 {editorGridSize}m</span>
                <span>선반 {compiled.stats.rackCount}개 / 보관 칸 {compiled.stats.storageSlotCount}개</span>
                <span>노드 {compiled.map.nodes.length}개 / 연결 {compiled.stats.connectionCount}개 / 방향 엣지 {compiled.stats.edgeCount}개</span>
                <span className="layout-editor-navigation-hint">
                    휠 이동 · Shift+휠 가로 이동 · Ctrl+휠 확대·축소 · 휠 버튼 드래그 이동
                </span>
                {activeTool === "AISLE" && (
                    <span className="layout-editor-tool-message">
                        {edgeMessage || TOOL_GUIDE_MESSAGES.AISLE}
                    </span>
                )}
                {activeTool === "route" && (
                    <span className="layout-editor-tool-message">경로 노드 연속 배치 중 · Esc 키로 종료</span>
                )}
            </div>
        </section>
    );
}

export default WarehouseEditorCanvas;
