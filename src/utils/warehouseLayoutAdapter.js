const toArray = (value) => (Array.isArray(value) ? value : []);

const getNodeCode = (node) => node.nodeCode ?? String(node.id);

const getNodeLabel = (node) => {
    if (node.routeAttributes?.label != null) {
        return node.routeAttributes.label;
    }

    if (node.nodeType === "INBOUND") {
        return node.nodeCode?.replace("I_", "");
    }

    if (node.nodeType === "OUTBOUND") {
        return node.nodeCode?.replace("O_", "");
    }

    return node.nodeCode;
};

const convertNode = (node) => {
    const routeAttributes = node.routeAttributes ?? {};
    const isRackNode =
        node.nodeType === "RACK_ACCESS" ||
        node.nodeType === "RACK_STORAGE";

    return {
        ...routeAttributes,
        route_attributes: routeAttributes,
        databaseId: node.id,
        id: getNodeCode(node),
        label: getNodeLabel(node),
        type: String(node.nodeType ?? "route").toLowerCase(),
        x: node.x,
        y: node.y,
        rack_id: isRackNode ? node.resourceCode : undefined,
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
    };
};

const convertEdge = (edge, nodeCodeById) => {
    const routeAttributes = edge.routeAttributes ?? {};

    return {
        ...routeAttributes,
        route_attributes: routeAttributes,
        id: edge.edgeCode ?? String(edge.id),
        source: nodeCodeById.get(edge.fromNodeId),
        target: nodeCodeById.get(edge.toNodeId),
        type: edge.edgeType ?? "lane",

        // 방향 정보가 없는 구형 데이터는 양방향으로 처리한다.
        direction: edge.directionType ?? "BOTH",

        distance_m: edge.distance,
        speed_limit_mps: edge.speedLimitMps,
        nominal_travel_time_ms: edge.nominalTravelTimeMs,
        cost: edge.cost,
        physical_resource_code: edge.physicalResourceCode,
        service_only: edge.serviceOnly,
        mobile_robot_traversable: edge.mobileRobotTraversable,
    };
};

const getRackEntityCount = (layoutNodes) => {
    const storageRackCount = layoutNodes.filter(
        (node) => node.nodeType === "RACK_STORAGE",
    ).length;

    const accessRackCount = new Set(
        layoutNodes
            .filter((node) => node.nodeType === "RACK_ACCESS")
            .map((node) => node.resourceCode)
            .filter(Boolean),
    ).size;

    // 저장 노드가 없는 구형 데이터는 접근 노드 기준으로 계산한다.
    return storageRackCount || accessRackCount;
};

// Spring 창고 레이아웃 응답을 지도 데이터 구조로 변환한다.
export const layoutResponseToMapData = (layout, warehouse) => {
    const layoutNodes = toArray(layout?.nodes);
    const layoutEdges = toArray(layout?.edges);

    // 엣지의 DB 노드 ID를 지도 노드 코드로 변환할 때 사용한다.
    const nodeCodeById = new Map(
        layoutNodes.map((node) => [
            node.id,
            getNodeCode(node),
        ]),
    );

    const nodes = layoutNodes.map(convertNode);
    const routeNodeIds = new Set(nodes.map((node) => node.id));

    const edges = layoutEdges
        .map((edge) => convertEdge(edge, nodeCodeById))
        // 현재 지도에 존재하는 노드를 연결한 엣지만 사용한다.
        .filter(
            (edge) =>
                routeNodeIds.has(edge.source) &&
                routeNodeIds.has(edge.target),
        );

    return {
        title: `${warehouse.name} 지도`,
        nodes,
        edges,
        summary: {
            node_count: nodes.length,
            edge_count: edges.length,
            rack_entity_count: getRackEntityCount(layoutNodes),
        },
    };
};