/**
 * 창고의 고정 시설과 시설 접근 노드를 렌더링한다.
 * 입·출고 접근점, 충전 분기, 선반, 입고지, 출고지, 충전 슬롯을 한 레이어에서 관리한다.
 */
function WarehouseFacilityLayer({
    graphData,
    rackInventoryMap,
    convertX,
    convertY,
    productColor,
    showNodeLabels,
    svgWidth,
    svgHeight,
}) {
    return (
        <>
            {/* 입고 포트와 AMR 경로 사이의 인계 접근점을 표시한다. */}
            <g className="warehouse-inbound-access">
                {graphData.nodes
                    .filter((node) => node.type === "inbound_handoff_access")
                    .map((node) => (
                        <g key={node.id}>
                            <circle
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="4"
                                className="warehouse-inbound-access"
                            >
                                <title>{node.id}</title>
                            </circle>

                            {showNodeLabels && (
                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 12}
                                    textAnchor="middle"
                                    className="warehouse-route-label"
                                >
                                    {node.id}
                                </text>
                            )}
                        </g>
                    ))}
            </g>

            {/* 출고 스테이션과 AMR 경로 사이의 접근점을 표시한다. */}
            <g className="warehouse-outbound-access">
                {graphData.nodes
                    .filter((node) => node.type === "outbound_station_access")
                    .map((node) => (
                        <g key={node.id}>
                            <circle
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="4"
                                className="warehouse-outbound-access"
                            >
                                <title>{node.id}</title>
                            </circle>

                            {showNodeLabels && (
                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 12}
                                    textAnchor="middle"
                                    className="warehouse-route-label"
                                >
                                    {node.id}
                                </text>
                            )}
                        </g>
                    ))}
            </g>

            {/* route와 charging_slot 사이의 충전 진입 분기 노드이다. */}
            <g className="warehouse-charge-junctions">
                {graphData.nodes
                    .filter((node) => node.type === "route_charge_junction")
                    .map((node) => (
                        <circle
                            key={node.id}
                            cx={convertX(node.x)}
                            cy={convertY(node.y)}
                            r="4"
                            className="warehouse-charge-junction"
                        >
                            <title>{node.id}</title>
                        </circle>
                    ))}
            </g>

            {/* 선반 외곽과 3개 층의 점유 상태를 표시한다. */}
            <g className="warehouse-racks">
                {graphData.nodes
                    .filter((node) => node.type === "rack_storage")
                    .map((node) => {
                        const inventory = rackInventoryMap.get(node.id);
                        const levels = inventory?.levels
                            ? [...inventory.levels].sort((left, right) => right.level - left.level)
                            : [3, 2, 1].map((level) => ({
                                level,
                                item: null,
                                product: null,
                            }));

                        return (
                            <g
                                key={node.id}
                                transform={`translate(${convertX(node.x)}, ${convertY(node.y)})`}
                            >
                                <rect
                                    x="-22"
                                    y="-17"
                                    width="44"
                                    height="34"
                                    className="warehouse-rack"
                                />

                                {levels.map((level, index) => (
                                    <rect
                                        key={level.level}
                                        x="-20"
                                        y={-15 + index * 10}
                                        width="40"
                                        height="9"
                                        className={`warehouse-rack-level ${level.item ? "rack-level-occupied" : "rack-level-empty"}`}
                                        style={level.item
                                            ? { fill: productColor(level.item.itemId) }
                                            : undefined}
                                    >
                                        <title>
                                            {level.item
                                                ? `${node.id} / ${level.level}층 / ${level.product?.productName ?? level.item.itemId} / ${level.item.quantity} EA`
                                                : `${node.id} / ${level.level}층 / 비어 있음`}
                                        </title>
                                    </rect>
                                ))}

                                <text
                                    x="0"
                                    y="27"
                                    textAnchor="middle"
                                    className="warehouse-rack-label"
                                >
                                    {node.id}
                                </text>
                            </g>
                        );
                    })}
            </g>

            {/* 논리 입고 시설을 사각형과 라벨로 표시한다. */}
            <g className="warehouse-inbound">
                {graphData.nodes
                    .filter((node) => node.type === "inbound")
                    .map((node) => (
                        <g key={node.id}>
                            <rect
                                x={convertX(node.x) - 14}
                                y={convertY(node.y) - 10}
                                width="28"
                                height="20"
                                className="warehouse-inbound-node"
                            />

                            <text
                                x={convertX(node.x)}
                                y={convertY(node.y) + 4}
                                textAnchor="middle"
                                className="warehouse-station-label"
                            >
                                {node.label}
                            </text>

                            {showNodeLabels && (
                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 22}
                                    textAnchor="middle"
                                    className="warehouse-station-id"
                                >
                                    {node.id}
                                </text>
                            )}
                        </g>
                    ))}
            </g>

            {/* 논리 출고 시설을 사각형과 라벨로 표시한다. */}
            <g className="warehouse-outbound">
                {graphData.nodes
                    .filter((node) => node.type === "outbound")
                    .map((node) => (
                        <g key={node.id}>
                            <rect
                                x={convertX(node.x) - 14}
                                y={convertY(node.y) - 10}
                                width="28"
                                height="20"
                                className="warehouse-outbound-node"
                            />

                            <text
                                x={convertX(node.x)}
                                y={convertY(node.y) + 4}
                                textAnchor="middle"
                                className="warehouse-station-label"
                            >
                                {node.label}
                            </text>

                            {showNodeLabels && (
                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 22}
                                    textAnchor="middle"
                                    className="warehouse-station-id"
                                >
                                    {node.id}
                                </text>
                            )}
                        </g>
                    ))}
            </g>

            {/* 충전 슬롯 번호와 전체 노드 ID를 표시한다. */}
            <g className="warehouse-charging">
                {graphData.nodes
                    .filter((node) => node.type === "charging_slot")
                    .map((node) => (
                        <g key={node.id}>
                            <rect
                                x={convertX(node.x) - 18}
                                y={convertY(node.y) - 10}
                                width="36"
                                height="20"
                                className="warehouse-charging-slot"
                            >
                                <title>{node.id}</title>
                            </rect>

                            <text
                                x={convertX(node.x)}
                                y={convertY(node.y) + 4}
                                textAnchor="middle"
                                className="warehouse-charging-label"
                            >
                                {node.index}
                            </text>

                            {showNodeLabels && (
                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 22}
                                    textAnchor="middle"
                                    className="warehouse-station-id"
                                >
                                    {node.id}
                                </text>
                            )}
                        </g>
                    ))}
            </g>

            {/* 창고의 주요 시설 영역명을 고정 위치에 표시한다. */}
            <text
                x="40"
                y="100"
                className="warehouse-area-title"
                textAnchor="middle"
            >
                입고지
            </text>

            <text
                x={svgWidth - 40}
                y="100"
                className="warehouse-area-title"
                textAnchor="middle"
            >
                출고지
            </text>

            <text
                x={svgWidth / 2}
                y={svgHeight - 8}
                className="warehouse-area-title"
                textAnchor="middle"
            >
                충전소
            </text>
        </>
    );
}

export default WarehouseFacilityLayer;
