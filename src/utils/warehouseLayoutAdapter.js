/** Convert the Spring warehouse layout response into the shared map contract. */
export const layoutResponseToMapData = (layout, warehouse) => {
    const layoutNodes = Array.isArray(layout?.nodes) ? layout.nodes : [];
    const nodeCodeById = new Map(
        layoutNodes.map((node) => [node.id, node.nodeCode ?? String(node.id)]),
    );
    const nodes = layoutNodes.map((node) => ({
        ...(node.routeAttributes ?? {}),
        route_attributes: node.routeAttributes ?? {},
        databaseId: node.id,
        id: node.nodeCode ?? String(node.id),
        label:
            node.routeAttributes?.label ??
            (node.nodeType === "INBOUND"
                ? node.nodeCode?.replace("I_", "")
                : node.nodeType === "OUTBOUND"
                    ? node.nodeCode?.replace("O_", "")
                    : node.nodeCode),
        type: String(node.nodeType ?? "route").toLowerCase(),
        x: node.x,
        y: node.y,
        rack_id:
            node.nodeType === "RACK_ACCESS" || node.nodeType === "RACK_STORAGE"
                ? node.resourceCode
                : undefined,
        handoff_id:
            node.nodeType === "INBOUND_HANDOFF_ACCESS"
                ? node.resourceCode
                : undefined,
        station_id:
            node.nodeType === "OUTBOUND_STATION_ACCESS"
                ? node.resourceCode
                : undefined,
        buffer_id:
            node.nodeType === "EMPTY_TOTE_BUFFER_ACCESS"
                ? node.resourceCode
                : undefined,
        resource_id: node.resourceCode,
        side: node.side,
        service_only: node.serviceOnly,
        transit_allowed: node.transitAllowed,
        holding_allowed: node.holdingAllowed,
        node_capacity: node.nodeCapacity,
    }));
    const routeNodeIds = new Set(nodes.map((node) => node.id));
    const edges = Array.isArray(layout?.edges)
        ? layout.edges
              .map((edge) => ({
                  ...(edge.routeAttributes ?? {}),
                  route_attributes: edge.routeAttributes ?? {},
                  id: edge.edgeCode ?? String(edge.id),
                  source: nodeCodeById.get(edge.fromNodeId),
                  target: nodeCodeById.get(edge.toNodeId),
                  type: edge.edgeType ?? "lane",
                  // 구형 저장 데이터에 방향 필드가 없으면 일반 주행로 계약에 맞춰
                  // 양방향으로 복원한다. 명시된 서비스 인계 방향은 그대로 유지한다.
                  direction: edge.directionType ?? "BOTH",
                  distance_m: edge.distance,
                  speed_limit_mps: edge.speedLimitMps,
                  nominal_travel_time_ms: edge.nominalTravelTimeMs,
                  cost: edge.cost,
                  physical_resource_code: edge.physicalResourceCode,
                  service_only: edge.serviceOnly,
                  mobile_robot_traversable: edge.mobileRobotTraversable,
              }))
              .filter(
                  (edge) =>
                      routeNodeIds.has(edge.source) &&
                      routeNodeIds.has(edge.target),
              )
        : [];
    const storageRackCount = layoutNodes.filter(
        (node) => node.nodeType === "RACK_STORAGE",
    ).length;
    const accessRackCount = new Set(
        layoutNodes
            .filter((node) => node.nodeType === "RACK_ACCESS")
            .map((node) => node.resourceCode)
            .filter(Boolean),
    ).size;

    return {
        title: `${warehouse.name} 지도`,
        nodes,
        edges,
        summary: {
            node_count: nodes.length,
            edge_count: edges.length,
            rack_entity_count: storageRackCount || accessRackCount,
        },
    };
};
