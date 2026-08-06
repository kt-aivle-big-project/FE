import WarehouseBoxLayer from "./WarehouseBoxLayer";
import WarehouseConflictEdgeLayer from "./WarehouseConflictEdgeLayer";
import WarehouseFacilityLayer from "./WarehouseFacilityLayer";
import WarehouseGraphLayer from "./WarehouseGraphLayer";
import WarehouseRobotLayer from "./WarehouseRobotLayer";

/**
 * 창고 SVG의 루트와 레이어 순서를 관리한다.
 * 기존 화면 겹침을 그대로 유지하기 위해 그래프 → BOX → 시설 → 로봇 순서로 렌더링한다.
 */
function WarehouseCanvas({
    svgWidth,
    svgHeight,
    showNodeLabels,
    onToggleNodeLabels,
    graphData,
    nodeMap,
    convertX,
    convertY,
    conflictEdgeKeys,
    inboundLogicalEdges,
    outboundLogicalGroups,
    waitingInboundGroups,
    transferBoxes,
    rackInventoryMap,
    productColor,
    fixedOutboundRobots,
    mobileRobotMarkers,
    isRunning,
}) {
    return (
        <div className="warehouse-svg-wrapper">
            <button
                type="button"
                className="warehouse-node-toggle"
                onClick={onToggleNodeLabels}
            >
                {showNodeLabels ? "노드 번호 숨기기" : "노드 번호 보기"}
            </button>

            <svg
                className="warehouse-svg"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                preserveAspectRatio="xMidYMid meet"
            >
                <defs>
                    <pattern
                        id="warehouse-grid"
                        width="10"
                        height="10"
                        patternUnits="userSpaceOnUse"
                    >
                        <path
                            d="M 10 0 L 0 0 0 10"
                            fill="none"
                            stroke="#e5e5e5"
                            strokeWidth="1"
                        />
                    </pattern>
                </defs>

                {/* 창고 바닥과 격자를 가장 먼저 그린다. */}
                <rect
                    x="0"
                    y="0"
                    width={svgWidth}
                    height={svgHeight}
                    fill="#ffffff"
                />
                <rect
                    x="0"
                    y="0"
                    width={svgWidth}
                    height={svgHeight}
                    fill="url(#warehouse-grid)"
                />

                <WarehouseGraphLayer
                    graphData={graphData}
                    nodeMap={nodeMap}
                    convertX={convertX}
                    convertY={convertY}
                    showNodeLabels={showNodeLabels}
                    inboundLogicalEdges={inboundLogicalEdges}
                    outboundLogicalGroups={outboundLogicalGroups}
                />

                <WarehouseConflictEdgeLayer
                    graphData={graphData}
                    nodeMap={nodeMap}
                    convertX={convertX}
                    convertY={convertY}
                    conflictEdgeKeys={conflictEdgeKeys}
                />

                <WarehouseBoxLayer
                    waitingInboundGroups={waitingInboundGroups}
                    transferBoxes={transferBoxes}
                    convertX={convertX}
                    convertY={convertY}
                />

                <WarehouseFacilityLayer
                    graphData={graphData}
                    rackInventoryMap={rackInventoryMap}
                    convertX={convertX}
                    convertY={convertY}
                    productColor={productColor}
                    showNodeLabels={showNodeLabels}
                    svgWidth={svgWidth}
                    svgHeight={svgHeight}
                />

                <WarehouseRobotLayer
                    fixedOutboundRobots={fixedOutboundRobots}
                    mobileRobotMarkers={mobileRobotMarkers}
                    isRunning={isRunning}
                />
            </svg>
        </div>
    );
}

export default WarehouseCanvas;
