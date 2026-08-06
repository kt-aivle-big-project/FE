const OUTBOUND_SERVICE_EDGE_TYPES = new Set([
    "outbound_service",
    "station_service",
]);

// 진행률이나 비율을 0~1 범위로 제한한다.
// 숫자로 변환할 수 없는 값은 0으로 처리해 좌표 계산에서 NaN이 퍼지는 것을 막는다.
export const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// task/robot ID를 이용해 여러 후보 중 하나를 안정적으로 선택한다.
export const selectByStableKey = (items, key = 0) => {
    if (!Array.isArray(items) || items.length === 0) return null;

    const numericKey = Number(key ?? 0);
    const safeKey = Number.isFinite(numericKey) ? numericKey : 0;
    return items[Math.abs(safeKey) % items.length];
};

// 시작 좌표와 끝 좌표 사이의 값을 진행률에 따라 선형 보간한다.
export const interpolate = (start, end, progress) =>
    start + (end - start) * progress;

// 주어진 엣지에서 현재 nodeId 반대편에 있는 노드 ID를 반환한다.
export const peerNodeId = (edge, nodeId) => (
    edge.source === nodeId
        ? edge.target
        : edge.target === nodeId
            ? edge.source
            : null
);

// 출고 설비 내부 연결에 해당하는 서비스 엣지인지 판별한다.
export const isOutboundServiceEdge = (edge) => (
    edge.service_only === true
    || OUTBOUND_SERVICE_EDGE_TYPES.has(String(edge.type ?? "").toLowerCase())
);

// 여러 후보 중 목표 y 좌표와 가장 가까운 노드를 선택한다.
export const closestNodeByY = (nodes, targetY) => nodes.reduce(
    (best, node) => (
        !best || Math.abs(Number(node.y) - Number(targetY))
            < Math.abs(Number(best.y) - Number(targetY))
            ? node
            : best
    ),
    null,
);

// 원본 그래프 좌표를 SVG 좌표로 바꾸는 변환 함수를 만든다.
export const createCoordinateConverter = (values, canvasSize, padding) => {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const availableSize = canvasSize - padding * 2;

    return (value) => (
        padding
        + ((value - minValue) / (maxValue - minValue)) * availableSize
    );
};

// 노드마다 연결된 엣지를 바로 찾을 수 있도록 역인덱스를 만든다.
export const createEdgesByNodeMap = (edges) => {
    const edgesByNode = new Map();

    edges.forEach((edge) => {
        [edge.source, edge.target].forEach((nodeId) => {
            const connectedEdges = edgesByNode.get(nodeId) ?? [];
            connectedEdges.push(edge);
            edgesByNode.set(nodeId, connectedEdges);
        });
    });

    return edgesByNode;
};

// 상품 ID마다 렌더링이 바뀌어도 유지되는 BOX 색상을 만든다.
export const productColor = (itemId) => {
    const numericId = Number(itemId);
    const stableNumber = Number.isFinite(numericId)
        ? numericId
        : String(itemId ?? "")
            .split("")
            .reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const hue = ((stableNumber - 1) * 137.508 + 210) % 360;
    return `hsl(${hue.toFixed(1)} 68% 62%)`;
};

/**
 * 특정 시각에 로봇이 화면상 어느 좌표에 있어야 하는지 계산한다.
 * 백엔드 진행률을 기준값으로 사용하고 다음 스냅샷 전 짧은 구간만 예측한다.
 */
export const robotPositionAt = (
    robot,
    fromX,
    fromY,
    toX,
    toY,
    now,
    isRunning,
) => {
    if (!robot.movement_step_id || !Number.isFinite(robot.movement_progress)) {
        return { x: fromX, y: fromY };
    }

    const baseProgress = clamp01(robot.movement_progress);
    let progress = baseProgress;
    const remainingMillis = Number(robot.arrival_in_seconds) * 1000;
    const receivedAt = Number(robot.movement_snapshot_received_at);

    if (
        isRunning
        && baseProgress < 1
        && Number.isFinite(remainingMillis)
        && remainingMillis > 0
        && Number.isFinite(receivedAt)
    ) {
        const elapsed = Math.max(0, now - receivedAt);
        const remainingRatio = Math.min(1, elapsed / remainingMillis);
        progress = baseProgress + (1 - baseProgress) * remainingRatio;
    }

    return {
        x: interpolate(fromX, toX, progress),
        y: interpolate(fromY, toY, progress),
    };
};
