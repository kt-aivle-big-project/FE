import warehouseGraph from "../data/warehouse_graph.json";

function SimulationView() {

    // SVG 크기
    const SVG_WIDTH = 1500;
    const SVG_HEIGHT = 720;

    // JSON 좌표 범위
    const MIN_X = 3;
    const MAX_X = 12.5;

    const MIN_Y = 0.5;
    const MAX_Y = 5.8;

    // 좌우 엘레베이터/충전소 제외한 창고 그래프 표시 영역
    const MAP_LEFT = 140;
    const MAP_TOP = 40;

    const MAP_WIDTH = 1200;
    const MAP_HEIGHT = 600;

    // JSON X 좌표 → SVG X 좌표
    const convertX = (x) => {

        return (
            MAP_LEFT +
            ((x - MIN_X) / (MAX_X - MIN_X)) *
            MAP_WIDTH
        );
    };

    // JSON Y 좌표 → SVG Y 좌표
    const convertY = (y) => {

        return (
            MAP_TOP +
            ((y - MIN_Y) / (MAX_Y - MIN_Y)) *
            MAP_HEIGHT
        );
    };

    // 노드 ID로 노드 찾기
    // edge.source / edge.target를 실제 좌표로 바꿀 때 사용
    const nodeMap = new Map(
        warehouseGraph.nodes.map((node) => [node.id, node,])
    );

    return (
        <div className="warehouse-simulation">
            <svg
                className="warehouse-svg"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            >

                {/* 엣지 */}
                <g className="warehouse-edges">
                    {warehouseGraph.edges.map((edge) => {
                        const sourceNode = nodeMap.get(edge.source);
                        const targetNode = nodeMap.get(edge.target);
                        if (!sourceNode || !targetNode) {
                            return null;
                        }
                        return (
                            <line
                                key={edge.id}
                                x1={convertX(sourceNode.x)}
                                y1={convertY(sourceNode.y)}
                                x2={convertX(targetNode.x)}
                                y2={convertY(targetNode.y)}
                                className={`warehouse-edge edge-${edge.type}`}
                            />
                        );
                    })}
                </g>

                {/* 이동 노드 */}
                <g className="warehouse-route-nodes">
                    {warehouseGraph.nodes
                        .filter(
                            (node) =>
                                node.type === "route"
                        )
                        .map((node) => (
                            <circle
                                key={node.id}
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="4"
                                className="warehouse-route-node"
                            />
                        ))}
                </g>

                {/* 선반 */}
                <g className="warehouse-racks">
                    {warehouseGraph.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "rack_storage"
                        )
                        .map((node) => (
                            <g
                                key={node.id}
                                transform={`
                                    translate(
                                        ${convertX(node.x)},
                                        ${convertY(node.y)}
                                    )
                                `}
                            >
                                {/* 선반 전체 */}
                                <rect
                                    x="-24"
                                    y="-15"
                                    width="48"
                                    height="30"
                                    className="warehouse-rack"
                                />
                                {/* 선반 ID */}
                                <text
                                    x="0"
                                    y="4"
                                    textAnchor="middle"
                                    className="warehouse-rack-label"
                                >
                                    {node.id}
                                </text>
                            </g>
                        ))}
                </g>


                {/* 입고 엘리베이터 노드 */}
                <g className="warehouse-inbound">
                    {warehouseGraph.nodes
                        .filter(
                            (node) =>
                                node.type === "inbound"
                        )
                        .map((node) => (
                            <circle
                                key={node.id}
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="8"
                                className="warehouse-inbound-node"
                            />
                        ))}
                </g>

                {/* 출고 엘리베이터 노드 */}
                <g className="warehouse-outbound">
                    {warehouseGraph.nodes
                        .filter(
                            (node) =>
                                node.type === "outbound"
                        )
                        .map((node) => (
                            <circle
                                key={node.id}
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="8"
                                className="warehouse-outbound-node"
                            />
                        ))}
                </g>

                {/* 충전소 */}
                <g className="warehouse-charging">
                    {warehouseGraph.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "charging_slot"
                        )
                        .map((node) => (
                            <rect
                                key={node.id}
                                x={convertX(node.x) - 18}
                                y={convertY(node.y) - 10}
                                width="36"
                                height="20"
                                className="warehouse-charging-slot"
                            />
                        ))}
                </g>
            </svg>
        </div>
    );
}

export default SimulationView;