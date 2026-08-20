const OUTBOUND_SERVICE_EDGE_TYPES = new Set([
    "outbound_service",
    "station_service",
]);

export const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const selectByStableKey = (items, key = 0) => {
    if (!Array.isArray(items) || items.length === 0) return null;

    const numericKey = Number(key ?? 0);
    const safeKey = Number.isFinite(numericKey) ? numericKey : 0;
    return items[Math.abs(safeKey) % items.length];
};

export const interpolate = (start, end, progress) =>
    start + (end - start) * progress;

export const peerNodeId = (edge, nodeId) => (
    edge.source === nodeId
        ? edge.target
        : edge.target === nodeId
            ? edge.source
            : null
);

export const isOutboundServiceEdge = (edge) => (
    edge.service_only === true
    || OUTBOUND_SERVICE_EDGE_TYPES.has(String(edge.type ?? "").toLowerCase())
);

export const closestNodeByY = (nodes, targetY) => nodes.reduce(
    (best, node) => (
        !best || Math.abs(Number(node.y) - Number(targetY))
            < Math.abs(Number(best.y) - Number(targetY))
            ? node
            : best
    ),
    null,
);

export const createCoordinateConverter = (values, canvasSize, padding) => {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const availableSize = canvasSize - padding * 2;

    return (value) => (
        padding
        + ((value - minValue) / (maxValue - minValue)) * availableSize
    );
};

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
