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
