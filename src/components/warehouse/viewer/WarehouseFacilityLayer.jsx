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
