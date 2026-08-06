import {
    createUndirectedEdgeKey,
} from "./robotConflictAnalyzer";

/**
 * 실시간 로봇 상태에서 감지된 충돌 위험 엣지를 강조한다.
 *
 * 기본 이동 경로는 WarehouseGraphLayer가 담당하고,
 * 이 레이어는 위험으로 판정된 엣지만 그 위에 추가로 렌더링한다.
 */
function WarehouseConflictEdgeLayer({
    graphData,
    nodeMap,
    convertX,
    convertY,
    conflictEdgeKeys,
}) {
    if (
        !graphData
        || !Array.isArray(graphData.edges)
        || !nodeMap
        || !conflictEdgeKeys
        || conflictEdgeKeys.size === 0
    ) {
        return null;
    }

    return (
        <g
            className="warehouse-conflict-edges"
            pointerEvents="none"
        >
            {graphData.edges.map((edge) => {
                if (
                    edge.mobile_robot_traversable === false
                    || edge.active_for_new_work === false
                ) {
                    return null;
                }

                const edgeKey =
                    createUndirectedEdgeKey(
                        edge.source,
                        edge.target,
                    );

                if (
                    !edgeKey
                    || !conflictEdgeKeys.has(edgeKey)
                ) {
                    return null;
                }

                const source =
                    nodeMap.get(edge.source);

                const target =
                    nodeMap.get(edge.target);

                if (!source || !target) {
                    return null;
                }

                return (
                    <line
                        key={`conflict-${edge.id}`}
                        x1={convertX(source.x)}
                        y1={convertY(source.y)}
                        x2={convertX(target.x)}
                        y2={convertY(target.y)}
                        className="warehouse-conflict-edge"
                    >
                        <title>
                            충돌 위험 엣지:
                            {" "}
                            {edge.source}
                            {" → "}
                            {edge.target}
                        </title>
                    </line>
                );
            })}
        </g>
    );
}

export default WarehouseConflictEdgeLayer;