/**
 * 창고의 이동 경로와 노드를 렌더링하는 SVG 레이어이다.
 * 실제 이동 엣지, 통로 라벨, route 노드, 시설 관계를 설명하는 논리 엣지를 담당한다.
 */
function WarehouseGraphLayer({
    graphData,
    nodeMap,
    convertX,
    convertY,
    showNodeLabels,
    inboundLogicalEdges,
    outboundLogicalGroups,
}) {
    return (
        <>
            {/* 이동 가능한 활성 엣지만 표시한다. */}
            <g className="warehouse-edges">
                {graphData.edges.map((edge) => {
                    if (
                        edge.mobile_robot_traversable === false
                        || edge.active_for_new_work === false
                    ) {
                        return null;
                    }

                    const source = nodeMap.get(edge.source);
                    const target = nodeMap.get(edge.target);

                    if (!source || !target) {
                        return null;
                    }

                    return (
                        <line
                            key={edge.id}
                            x1={convertX(source.x)}
                            y1={convertY(source.y)}
                            x2={convertX(target.x)}
                            y2={convertY(target.y)}
                            className={`warehouse-edge edge-${edge.type}`}
                        />
                    );
                })}
            </g>

            {/* 각 통로의 첫 번째 열 노드에 A01 형식의 통로 라벨을 표시한다. */}
            <g className="warehouse-aisle-labels">
                {graphData.nodes
                    .filter((node) => node.type === "route" && node.col === 0)
                    .map((node) => (
                        <text
                            key={`aisle-${node.row}`}
                            x={convertX(node.x) - 10}
                            y={convertY(node.y) + 4}
                            textAnchor="end"
                            className="warehouse-aisle-label"
                        >
                            {`A${String(node.row).padStart(2, "0")}`}
                        </text>
                    ))}
            </g>

            {/* AMR이 실제로 지나는 route 노드를 표시한다. */}
            <g className="warehouse-route-nodes">
                {graphData.nodes
                    .filter((node) => node.type === "route")
                    .map((node) => (
                        <g key={node.id}>
                            <circle
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="3"
                                className="warehouse-route-node"
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

            {/* 시설 관계를 설명하기 위한 논리 엣지이며 실제 로봇 경로와는 구분된다. */}
            <g className="warehouse-logical-edges">
                {inboundLogicalEdges.map((edge) => (
                    <line
                        key={edge.id}
                        x1={convertX(edge.source.x)}
                        y1={convertY(edge.source.y)}
                        x2={convertX(edge.target.x)}
                        y2={convertY(edge.target.y)}
                        className="warehouse-logical-edge logical-inbound"
                    />
                ))}

                {outboundLogicalGroups.flatMap((group) =>
                    group.chutes.map((chute) => (
                        <line
                            key={`logical-outbound-${group.id}-${chute.id}`}
                            x1={convertX(group.x)}
                            y1={convertY(group.y)}
                            x2={convertX(chute.x)}
                            y2={convertY(chute.y)}
                            className="warehouse-logical-edge logical-outbound"
                        />
                    )),
                )}
            </g>
        </>
    );
}

export default WarehouseGraphLayer;
