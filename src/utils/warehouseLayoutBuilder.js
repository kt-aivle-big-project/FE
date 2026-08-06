const EPSILON = 1e-6;
const DEFAULT_SPEED_MPS = 1;
const EDGE_CODE_MAX_LENGTH = 50;

const REPEATABLE_FACILITY_KINDS = new Set([
    "inbound",
    "outbound",
    "charging",
]);

const EXISTING_MAP_FACILITY_STEPS = {
    inbound_handoff_access: 0.44,
    outbound_station_access: 0.44,
};

const FACILITY_ACCESS_TYPES = new Set([
    "inbound_handoff_access",
    "outbound_station_access",
]);

const LEGACY_FACILITY_TYPES = new Set(["inbound", "outbound"]);

const EDITOR_EXCLUDED_NODE_TYPES = new Set([
    "empty_tote_buffer_access",
]);

const REPEATABLE_RAW_TYPES = new Map([
    ["inbound_handoff_access", "inbound"],
    ["outbound_station_access", "outbound"],
    ["inbound", "inbound"],
    ["outbound", "outbound"],
    ["charging_slot", "charging"],
]);

const REQUIRED_KINDS = [
    ["rack", "3층 선반을"],
    ["inbound", "입고지를"],
    ["outbound", "출고지를"],
    ["charging", "충전소를"],
    ["route", "경로 노드를"],
];

const NODE_TYPE_BY_KIND = {
    inbound: "inbound_handoff_access",
    outbound: "outbound_station_access",
    charging: "charging_slot",
};

const RESOURCE_KEY_BY_KIND = {
    inbound: "handoff_id",
    outbound: "station_id",
    charging: "resource_id",
};

export const LAYOUT_OBJECT_DEFINITIONS = {
    rack: {
        label: "3층 선반",
        description: "층마다 BOX 1개를 보관합니다.",
        prefix: "K",
        width: 3.2,
        height: 1.4,
    },
    inbound: {
        label: "입고지",
        description: "입고 BOX를 로봇에 인계합니다.",
        prefix: "IN",
        width: 2.4,
        height: 2.4,
    },
    outbound: {
        label: "출고지",
        description: "출고 BOX가 전달되는 지점입니다.",
        prefix: "OUT",
        width: 2.4,
        height: 2.4,
    },
    charging: {
        label: "충전소",
        description: "로봇 시작 및 충전 위치입니다.",
        prefix: "CHG",
        width: 2,
        height: 2,
    },
    route: {
        label: "경로 노드",
        description: "엣지의 시작점 또는 끝점으로 사용하는 이동 노드입니다.",
        prefix: "N",
        width: 0,
        height: 0,
    },
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const round = (value, digits = 3) => {
    const factor = 10 ** digits;

    return Math.round(Number(value) * factor) / factor;
};

const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));

const distanceBetween = (left, right) =>
    Math.hypot(left.x - right.x, left.y - right.y);

const averageCoordinate = (items, key) =>
    round(
        items.reduce(
            (sum, item) => sum + Number(item[key] ?? 0),
            0,
        ) / items.length,
    );

const connectionKeyOf = (leftId, rightId) =>
    [leftId, rightId].sort().join("::");

const objectDimensions = (object) => {
    const rotated =
        Math.abs(Number(object.rotation) % 180) === 90;

    return {
        width: rotated ? object.height : object.width,
        height: rotated ? object.width : object.height,
    };
};

const defaultFacilityOrientation = (kind) =>
    kind === "charging" ? "HORIZONTAL" : "VERTICAL";

const defaultFacilityStep = (kind) => {
    const definition = LAYOUT_OBJECT_DEFINITIONS[kind];
    const orientation = defaultFacilityOrientation(kind);
    const size =
        orientation === "HORIZONTAL"
            ? definition?.width
            : definition?.height;

    return size + 0.3;
};

export const snapCoordinate = (value, gridSize = 1) =>
    round(Math.round(Number(value) / gridSize) * gridSize);

export const snapLayoutPoint = (
    point,
    width,
    height,
    gridSize = 1,
) => ({
    x: clamp(
        snapCoordinate(point.x, gridSize),
        0,
        Number(width) || 0,
    ),
    y: clamp(
        snapCoordinate(point.y, gridSize),
        0,
        Number(height) || 0,
    ),
});

const getHighestRouteNumber = (objects) =>
    objects.reduce((maximum, object) => {
        const match = String(object.id).match(/^N(\d+)$/i);

        return match
            ? Math.max(maximum, Number(match[1]))
            : maximum;
    }, 0);

export const nextLayoutObjectId = (kind, objects) => {
    const prefix =
        LAYOUT_OBJECT_DEFINITIONS[kind]?.prefix ?? "OBJ";
    const used = new Set(objects.map((object) => object.id));
    const routeStartIndex =
        kind === "route"
            ? Math.max(
                  objects.length + 1,
                  getHighestRouteNumber(objects) + 1,
              )
            : 1;

    let index = routeStartIndex;

    while (
        used.has(
            `${prefix}${String(index).padStart(3, "0")}`,
        )
    ) {
        index += 1;
    }

    return `${prefix}${String(index).padStart(3, "0")}`;
};

export const createLayoutObject = (
    kind,
    point,
    objects = [],
) => {
    const definition = LAYOUT_OBJECT_DEFINITIONS[kind];

    if (!definition) {
        throw new Error(
            `지원하지 않는 배치 객체입니다: ${kind}`,
        );
    }

    const id = nextLayoutObjectId(kind, objects);
    const repeatable = REPEATABLE_FACILITY_KINDS.has(kind);

    return {
        id,
        kind,
        x: round(point.x),
        y: round(point.y),
        width: definition.width,
        height: definition.height,
        rotation: 0,
        ...(repeatable
            ? {
                  facilityGroupId: `FACILITY_${id}`,
                  facilityIndex: 0,
                  facilityOrientation:
                      defaultFacilityOrientation(kind),
                  facilityStep: defaultFacilityStep(kind),
              }
            : {}),
    };
};

export const getLayoutConnectionNodeId = (object) =>
    object?.id;

export const getLayoutConnectionPoint = (object) => {
    if (!object) {
        return null;
    }

    // 원본 노드와 충전소는 표시 좌표를 연결점으로 사용한다.
    if (
        object.rawNode ||
        object.kind === "route" ||
        object.kind === "charging"
    ) {
        return {
            x: round(object.x),
            y: round(object.y),
        };
    }

    const dimensions = objectDimensions(object);
    const rotatedRack =
        object.kind === "rack" &&
        Math.abs(Number(object.rotation) % 180) === 90;

    if (rotatedRack) {
        return {
            x: round(
                object.x + dimensions.width / 2 + 0.65,
            ),
            y: round(object.y),
        };
    }

    if (object.kind === "rack") {
        return {
            x: round(object.x),
            y: round(
                object.y + dimensions.height / 2 + 0.65,
            ),
        };
    }

    return {
        x: round(object.x + dimensions.width / 2 + 0.65),
        y: round(object.y),
    };
};

export const createExplicitAisle = (
    startObject,
    endObject,
    id,
    direction = "BOTH",
) => ({
    id,
    startNodeId: startObject.id,
    endNodeId: endObject.id,
    start: getLayoutConnectionPoint(startObject),
    end: getLayoutConnectionPoint(endObject),
    direction,
});

const overlaps = (left, right) => {
    const ignoresCollision =
        left.rawNode ||
        right.rawNode ||
        left.kind === "route" ||
        right.kind === "route";

    if (ignoresCollision) {
        return false;
    }

    const leftDimensions = objectDimensions(left);
    const rightDimensions = objectDimensions(right);

    const overlapsHorizontally =
        Math.abs(left.x - right.x) <
        (leftDimensions.width + rightDimensions.width) / 2 -
            EPSILON;

    const overlapsVertically =
        Math.abs(left.y - right.y) <
        (leftDimensions.height + rightDimensions.height) / 2 -
            EPSILON;

    return overlapsHorizontally && overlapsVertically;
};

const isInsideWarehouse = (object, width, height) => {
    if (object.kind === "route") {
        return (
            object.x >= 0 &&
            object.x <= width &&
            object.y >= 0 &&
            object.y <= height
        );
    }

    const dimensions = objectDimensions(object);

    return (
        object.x - dimensions.width / 2 >= -EPSILON &&
        object.x + dimensions.width / 2 <= width + EPSILON &&
        object.y - dimensions.height / 2 >= -EPSILON &&
        object.y + dimensions.height / 2 <= height + EPSILON
    );
};

const isPointInsideWarehouse = (point, width, height) =>
    Boolean(point) &&
    point.x >= 0 &&
    point.x <= width &&
    point.y >= 0 &&
    point.y <= height;

const connectedNodeIds = (nodes, edges) => {
    if (nodes.length === 0) {
        return new Set();
    }

    const adjacency = new Map(
        nodes.map((node) => [node.id, new Set()]),
    );

    edges.forEach((edge) => {
        adjacency.get(edge.source)?.add(edge.target);
        adjacency.get(edge.target)?.add(edge.source);
    });

    const visited = new Set();
    const queue = [nodes[0].id];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const nodeId = queue[queueIndex];
        queueIndex += 1;

        if (visited.has(nodeId)) {
            continue;
        }

        visited.add(nodeId);

        adjacency.get(nodeId)?.forEach((neighbor) => {
            if (!visited.has(neighbor)) {
                queue.push(neighbor);
            }
        });
    }

    return visited;
};

const nodeForObject = (object) => {
    const point = getLayoutConnectionPoint(object);

    if (object.kind === "route") {
        return {
            id: object.id,
            type: "route",
            x: point.x,
            y: point.y,
            service_only: false,
            transit_allowed: true,
            holding_allowed: true,
            node_capacity: 1,
        };
    }

    const serviceOnly = object.kind !== "charging";
    const resourceKey =
        RESOURCE_KEY_BY_KIND[object.kind] ?? "resource_id";

    return {
        id: getLayoutConnectionNodeId(object),
        type: NODE_TYPE_BY_KIND[object.kind],
        x: point.x,
        y: point.y,
        [resourceKey]: object.id,
        resource_id: object.id,
        service_only: serviceOnly,
        transit_allowed: !serviceOnly,
        holding_allowed: object.kind === "charging",
        node_capacity: 1,
        label:
            LAYOUT_OBJECT_DEFINITIONS[object.kind]?.label,
    };
};

const editorKindForNode = (node) => {
    switch (node.type) {
        case "rack_storage":
            return "rack";

        case "inbound":
        case "inbound_handoff_access":
            return "inbound";

        case "outbound":
        case "outbound_station_access":
        case "empty_tote_buffer_access":
            return "outbound";

        case "charging_slot":
            return "charging";

        default:
            return "route";
    }
};

const rawObjectSize = (node) => {
    if (node.type === "rack_storage") {
        return {
            width: 0.48,
            height: 0.38,
        };
    }

    if (
        node.type === "inbound" ||
        node.type === "outbound" ||
        node.__editorFacility
    ) {
        return {
            width: 0.32,
            height: 0.28,
        };
    }

    if (node.type === "charging_slot") {
        return {
            width: 0.32,
            height: 0.32,
        };
    }

    if (String(node.type).includes("access")) {
        return {
            width: 0.24,
            height: 0.24,
        };
    }

    return {
        width: 0,
        height: 0,
    };
};

const rackStorageResourceId = (node) =>
    node.rack_id ?? node.resource_id ?? node.id;

const rackAccessResourceId = (node) =>
    node.rack_id ??
    node.resource_id ??
    String(node.id).replace(
        /_ACCESS(?:_[AB])?$/,
        "",
    );

const createSynthesizedRackNode = (
    rackId,
    members,
) => ({
    id: rackId,
    type: "rack_storage",
    x: averageCoordinate(members, "x"),
    y: averageCoordinate(members, "y"),
    rack_id: rackId,
    resource_id: rackId,
    service_only: false,
    transit_allowed: false,
    holding_allowed: false,
    node_capacity: 1,
});

// 구형 rack_access 노드를 rack_storage 노드로 합친다.
const collapseRackAccessEndpoints = (
    sourceNodes,
    sourceEdges,
) => {
    const rackStorageById = new Map(
        sourceNodes
            .filter(
                (node) =>
                    node.type === "rack_storage",
            )
            .map((node) => [
                rackStorageResourceId(node),
                node,
            ]),
    );

    const rackAccessGroups = new Map();

    sourceNodes
        .filter((node) => node.type === "rack_access")
        .forEach((node) => {
            const rackId = rackAccessResourceId(node);
            const group =
                rackAccessGroups.get(rackId) ?? [];

            group.push(node);
            rackAccessGroups.set(rackId, group);
        });

    const storageIdByAccessId = new Map();
    const synthesizedRackNodes = [];

    rackAccessGroups.forEach((members, rackId) => {
        let rack = rackStorageById.get(rackId);

        if (!rack) {
            rack = createSynthesizedRackNode(
                rackId,
                members,
            );

            rackStorageById.set(rackId, rack);
            synthesizedRackNodes.push(rack);
        }

        members.forEach((member) => {
            storageIdByAccessId.set(
                member.id,
                rack.id,
            );
        });
    });

    const nodes = sourceNodes
        .filter(
            (node) => node.type !== "rack_access",
        )
        .concat(synthesizedRackNodes);

    const nodeIds = new Set(
        nodes.map((node) => node.id),
    );

    const edges = sourceEdges.flatMap((edge) => {
        const source =
            storageIdByAccessId.get(edge.source) ??
            edge.source;

        const target =
            storageIdByAccessId.get(edge.target) ??
            edge.target;

        if (
            source === target ||
            !nodeIds.has(source) ||
            !nodeIds.has(target)
        ) {
            return [];
        }

        return [
            {
                ...edge,
                source,
                target,
            },
        ];
    });

    return {
        nodes,
        edges,
    };
};

const facilityResourceId = (node) => {
    const fallbackId = String(node.id).replace(
        /_ACCESS(?:_[AB])?$/,
        "",
    );

    if (node.type === "inbound_handoff_access") {
        return (
            node.handoff_id ??
            node.resource_id ??
            fallbackId
        );
    }

    return (
        node.station_id ??
        node.resource_id ??
        fallbackId
    );
};

const facilityAccessSide = (index) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    return index < alphabet.length
        ? alphabet[index]
        : String(index + 1);
};

const connectedPeerIds = (nodeId, edges) =>
    [
        ...new Set(
            edges.flatMap((edge) => {
                if (edge.source === nodeId) {
                    return [edge.target];
                }

                if (edge.target === nodeId) {
                    return [edge.source];
                }

                return [];
            }),
        ),
    ].sort();

const rememberedAccessIds = (node) => {
    const ids =
        node.route_attributes
            ?.collapsed_access_node_ids;

    return Array.isArray(ids)
        ? ids.filter(
              (value) =>
                  value && value !== node.id,
          )
        : [];
};

// 여러 통로에 연결된 설비는 저장할 때 접근 노드를 분리한다.
const expandFacilityEndpointsForStorage = (
    sourceNodes,
    sourceEdges,
) => {
    const hasFacilityNodes = sourceNodes.some(
        (node) =>
            FACILITY_ACCESS_TYPES.has(node.type),
    );

    const replacements = new Map();
    const expandedIds = new Set();
    const expandedNodes = [];

    sourceNodes.forEach((node) => {
        if (
            !FACILITY_ACCESS_TYPES.has(node.type)
        ) {
            expandedNodes.push(node);
            return;
        }

        const peers = connectedPeerIds(
            node.id,
            sourceEdges,
        );

        if (peers.length <= 1) {
            expandedNodes.push(node);
            return;
        }

        const resourceId = facilityResourceId(node);
        const rememberedIds =
            rememberedAccessIds(node);

        const collapsedAccessNodeIds = peers.map(
            (_, index) =>
                rememberedIds[index] ??
                `${resourceId}_ACCESS_${facilityAccessSide(
                    index,
                )}`,
        );

        peers.forEach((peerId, index) => {
            const side = facilityAccessSide(index);
            const rememberedId =
                rememberedIds[index];

            const generatedId =
                `${resourceId}_ACCESS_${side}`;

            const accessId =
                rememberedId &&
                !expandedIds.has(rememberedId)
                    ? rememberedId
                    : generatedId;

            expandedIds.add(accessId);

            replacements.set(
                `${node.id}::${peerId}`,
                accessId,
            );

            expandedNodes.push({
                ...node,
                id: accessId,
                side,
                route_attributes: {
                    ...(node.route_attributes ?? {}),
                    adjacent_route_node: peerId,
                    collapsed_access_node_ids:
                        collapsedAccessNodeIds,
                },
            });
        });
    });

    if (
        !hasFacilityNodes ||
        replacements.size === 0
    ) {
        return {
            nodes: sourceNodes,
            edges: sourceEdges,
        };
    }

    const edges = sourceEdges.map((edge) => ({
        ...edge,
        source:
            replacements.get(
                `${edge.source}::${edge.target}`,
            ) ?? edge.source,
        target:
            replacements.get(
                `${edge.target}::${edge.source}`,
            ) ?? edge.target,
    }));

    return {
        nodes: expandedNodes,
        edges,
    };
};

const createFacilityAccessGroups = (
    sourceNodes,
) => {
    const groups = new Map();

    sourceNodes
        .filter((node) =>
            FACILITY_ACCESS_TYPES.has(node.type),
        )
        .forEach((node) => {
            const resourceId =
                facilityResourceId(node);

            const key =
                `${node.type}::${resourceId}`;

            const group = groups.get(key) ?? [];

            group.push(node);
            groups.set(key, group);
        });

    return groups;
};

const collapseFacilityGroup = (
    members,
    endpointIdBySourceId,
) => {
    const first = members[0];
    const resourceId = facilityResourceId(first);

    const displayKey =
        first.type === "inbound_handoff_access"
            ? "display_port_ids"
            : "display_chute_ids";

    const displayIds = [
        ...new Set(
            members.flatMap(
                (member) =>
                    member[displayKey] ?? [],
            ),
        ),
    ];

    const routeAttributes = {
        ...(first.route_attributes ?? {}),
    };

    members.forEach((member) => {
        endpointIdBySourceId.set(
            member.id,
            resourceId,
        );
    });

    delete routeAttributes.adjacent_route_node;

    routeAttributes.collapsed_access_node_ids =
        members.map((member) => member.id);

    if (displayIds.length > 0) {
        routeAttributes[displayKey] = displayIds;
    }

    const collapsed = {
        ...first,
        id: resourceId,
        x: averageCoordinate(members, "x"),
        y: averageCoordinate(members, "y"),
        resource_id: resourceId,
        service_only: true,
        transit_allowed: false,
        holding_allowed: false,
        node_capacity: 1,
        route_attributes: routeAttributes,
        __editorFacility: true,
    };

    if (
        first.type ===
        "inbound_handoff_access"
    ) {
        collapsed.handoff_id = resourceId;
    } else {
        collapsed.station_id = resourceId;
    }

    if (displayIds.length > 0) {
        collapsed[displayKey] = displayIds;
    }

    delete collapsed.side;
    delete collapsed.adjacent_route_node;

    return collapsed;
};

// 접근 노드를 편집기용 설비 객체 하나로 합친다.
const collapseFacilityEndpoints = (
    sourceNodes,
    sourceEdges,
) => {
    const excludedIds = new Set(
        sourceNodes
            .filter((node) =>
                EDITOR_EXCLUDED_NODE_TYPES.has(
                    node.type,
                ),
            )
            .map((node) => node.id),
    );

    const hasFacilityAccessNodes =
        sourceNodes.some((node) =>
            FACILITY_ACCESS_TYPES.has(node.type),
        );

    const legacyIds = new Set(
        hasFacilityAccessNodes
            ? sourceNodes
                  .filter((node) =>
                      LEGACY_FACILITY_TYPES.has(
                          node.type,
                      ),
                  )
                  .map((node) => node.id)
            : [],
    );

    const accessGroups =
        createFacilityAccessGroups(sourceNodes);

    const endpointIdBySourceId = new Map();

    const facilityNodes = [
        ...accessGroups.values(),
    ].map((members) =>
        collapseFacilityGroup(
            members,
            endpointIdBySourceId,
        ),
    );

    const nodes = sourceNodes
        .filter(
            (node) =>
                !legacyIds.has(node.id) &&
                !FACILITY_ACCESS_TYPES.has(
                    node.type,
                ) &&
                !EDITOR_EXCLUDED_NODE_TYPES.has(
                    node.type,
                ),
        )
        .concat(facilityNodes);

    const nodeIds = new Set(
        nodes.map((node) => node.id),
    );

    const edges = sourceEdges.flatMap((edge) => {
        const referencesExcludedNode =
            legacyIds.has(edge.source) ||
            legacyIds.has(edge.target) ||
            excludedIds.has(edge.source) ||
            excludedIds.has(edge.target);

        if (referencesExcludedNode) {
            return [];
        }

        const source =
            endpointIdBySourceId.get(edge.source) ??
            edge.source;

        const target =
            endpointIdBySourceId.get(edge.target) ??
            edge.target;

        if (
            source === target ||
            !nodeIds.has(source) ||
            !nodeIds.has(target)
        ) {
            return [];
        }

        return [
            {
                ...edge,
                source,
                target,
            },
        ];
    });

    return {
        nodes,
        edges,
    };
};

const createDraftObject = (node) => {
    const size = rawObjectSize(node);

    const {
        __editorFacility,
        ...rawNode
    } = node;

    return {
        id: node.id,
        kind: editorKindForNode(node),
        x: round(node.x),
        y: round(node.y),
        width: size.width,
        height: size.height,
        rotation: 0,
        facilityEndpoint:
            Boolean(__editorFacility),
        rawNode,
    };
};

const facilityOrientation = (members) => {
    const xValues = members.map(
        (member) => member.x,
    );

    const yValues = members.map(
        (member) => member.y,
    );

    const xRange =
        Math.max(...xValues) -
        Math.min(...xValues);

    const yRange =
        Math.max(...yValues) -
        Math.min(...yValues);

    return xRange >= yRange
        ? "HORIZONTAL"
        : "VERTICAL";
};

const sortFacilityMembers = (
    members,
    orientation,
) =>
    [...members].sort((left, right) =>
        orientation === "HORIZONTAL"
            ? left.x - right.x ||
              left.y - right.y
            : left.y - right.y ||
              left.x - right.x,
    );

const facilityStep = (
    ordered,
    orientation,
    rawType,
    kind,
) => {
    const positions = ordered.map((member) =>
        orientation === "HORIZONTAL"
            ? member.x
            : member.y,
    );

    const positiveGaps = positions
        .slice(1)
        .map(
            (position, index) =>
                position - positions[index],
        )
        .filter((gap) => gap > EPSILON);

    if (
        EXISTING_MAP_FACILITY_STEPS[
            rawType
        ] != null
    ) {
        return EXISTING_MAP_FACILITY_STEPS[
            rawType
        ];
    }

    if (positiveGaps.length === 0) {
        return defaultFacilityStep(kind);
    }

    return round(
        positiveGaps.reduce(
            (sum, gap) => sum + gap,
            0,
        ) / positiveGaps.length,
    );
};

const applyRepeatableFacilityGroups = (
    objects,
) => {
    REPEATABLE_RAW_TYPES.forEach(
        (kind, rawType) => {
            const members = objects.filter(
                (object) =>
                    object.rawNode?.type ===
                    rawType,
            );

            if (members.length === 0) {
                return;
            }

            const orientation =
                facilityOrientation(members);

            const ordered =
                sortFacilityMembers(
                    members,
                    orientation,
                );

            const step = facilityStep(
                ordered,
                orientation,
                rawType,
                kind,
            );

            const groupId =
                `FACILITY_${kind.toUpperCase()}_001`;

            const anchor = ordered[0];

            ordered.forEach(
                (member, index) => {
                    member.x = round(
                        anchor.x +
                            (orientation ===
                            "HORIZONTAL"
                                ? step * index
                                : 0),
                    );

                    member.y = round(
                        anchor.y +
                            (orientation ===
                            "VERTICAL"
                                ? step * index
                                : 0),
                    );

                    member.facilityGroupId =
                        groupId;

                    member.facilityIndex =
                        index;

                    member.facilityOrientation =
                        orientation;

                    member.facilityStep = step;
                },
            );
        },
    );
};

const groupAisleEdges = (edges, nodeIds) => {
    const groups = new Map();

    edges.forEach((edge) => {
        const invalidEdge =
            !nodeIds.has(edge.source) ||
            !nodeIds.has(edge.target) ||
            edge.source === edge.target;

        if (invalidEdge) {
            return;
        }

        const key = connectionKeyOf(
            edge.source,
            edge.target,
        );

        const group = groups.get(key) ?? [];

        group.push({
            ...edge,
        });

        groups.set(key, group);
    });

    return groups;
};

const aisleDirection = (group) => {
    const first = group[0];

    const hasReverse = group.some(
        (edge) =>
            edge.source === first.target &&
            edge.target === first.source,
    );

    if (
        first.direction === "BOTH" ||
        hasReverse
    ) {
        return "BOTH";
    }

    return first.direction === "B_TO_A"
        ? "REVERSE"
        : "FORWARD";
};

const createDraftAisles = (
    groups,
    pointById,
) =>
    [...groups.values()].map(
        (group, index) => {
            const first = group[0];

            return {
                id:
                    first.id ||
                    `A${String(
                        index + 1,
                    ).padStart(3, "0")}`,
                startNodeId: first.source,
                endNodeId: first.target,
                start: {
                    ...pointById.get(
                        first.source,
                    ),
                },
                end: {
                    ...pointById.get(
                        first.target,
                    ),
                },
                direction:
                    aisleDirection(group),
                rawEdges: group,
            };
        },
    );

// 기존 지도를 편집기 객체와 엣지 구조로 변환한다.
export const createLayoutDraftFromMap = (
    map,
) => {
    const rackNormalized =
        collapseRackAccessEndpoints(
            toArray(map?.nodes),
            toArray(map?.edges),
        );

    const normalized =
        collapseFacilityEndpoints(
            rackNormalized.nodes,
            rackNormalized.edges,
        );

    const nodes = normalized.nodes;
    const edges = normalized.edges;

    const nodeIds = new Set(
        nodes.map((node) => node.id),
    );

    const objects = nodes.map(
        createDraftObject,
    );

    applyRepeatableFacilityGroups(objects);

    const groups = groupAisleEdges(
        edges,
        nodeIds,
    );

    const pointById = new Map(
        objects.map((object) => [
            object.id,
            getLayoutConnectionPoint(object),
        ]),
    );

    const aisles = createDraftAisles(
        groups,
        pointById,
    );

    return {
        objects,
        aisles,
    };
};

const uniqueEdgeId = (edge, used) => {
    const base =
        `${edge.source}__${edge.target}`;

    let candidate = base.slice(
        0,
        EDGE_CODE_MAX_LENGTH,
    );

    let sequence = 2;

    while (used.has(candidate)) {
        const suffix = `_${sequence}`;

        candidate =
            base.slice(
                0,
                EDGE_CODE_MAX_LENGTH -
                    suffix.length,
            ) + suffix;

        sequence += 1;
    }

    return candidate;
};

// 중복 간선 ID는 노드 조합을 기준으로 다시 만든다.
const withUniqueEdgeIds = (sourceEdges) => {
    const used = new Set();

    return sourceEdges.map((edge) => {
        const original =
            edge.id == null
                ? ""
                : String(edge.id);

        if (
            original !== "" &&
            !used.has(original)
        ) {
            used.add(original);
            return edge;
        }

        const id = uniqueEdgeId(
            edge,
            used,
        );

        used.add(id);

        return {
            ...edge,
            id,
        };
    });
};

const edgeType = (left, right) => {
    const hasRackAccess = [left, right].some(
        (object) =>
            object.rawNode?.type ===
            "rack_access",
    );

    if (hasRackAccess) {
        return "rack_access";
    }

    const facility = [left, right].find(
        (object) =>
            object.kind !== "route",
    );

    // 충전소 연결은 일반 이동 엣지로 저장한다.
    if (
        !facility ||
        facility.kind === "charging"
    ) {
        return "lane";
    }

    return facility.kind === "rack"
        ? "rack_access"
        : `${facility.kind}_service`;
};

const hasValidWarehouseSize = (
    width,
    height,
) =>
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0;

const validateRequiredKinds = (
    layoutObjects,
    errors,
) => {
    REQUIRED_KINDS.forEach(
        ([kind, labelWithParticle]) => {
            const exists = layoutObjects.some(
                (object) =>
                    object.kind === kind &&
                    !(
                        kind === "route" &&
                        object.rawNode?.type ===
                            "rack_access"
                    ),
            );

            if (!exists) {
                errors.push(
                    `${labelWithParticle} 하나 이상 배치하세요.`,
                );
            }
        },
    );
};

const validateObjectBounds = (
    layoutObjects,
    warehouseWidth,
    warehouseHeight,
    errors,
) => {
    layoutObjects.forEach((object) => {
        if (
            !isInsideWarehouse(
                object,
                warehouseWidth,
                warehouseHeight,
            )
        ) {
            errors.push(
                `${object.id}이(가) 창고 경계를 벗어났습니다.`,
            );
        }

        const connectionPoint =
            getLayoutConnectionPoint(object);

        if (
            !isPointInsideWarehouse(
                connectionPoint,
                warehouseWidth,
                warehouseHeight,
            )
        ) {
            errors.push(
                `${object.id}의 연결 노드가 창고 경계를 벗어났습니다.`,
            );
        }
    });
};

const validateObjectOverlaps = (
    layoutObjects,
    errors,
) => {
    for (
        let left = 0;
        left < layoutObjects.length;
        left += 1
    ) {
        for (
            let right = left + 1;
            right < layoutObjects.length;
            right += 1
        ) {
            if (
                overlaps(
                    layoutObjects[left],
                    layoutObjects[right],
                )
            ) {
                errors.push(
                    `${layoutObjects[left].id}과(와) ${layoutObjects[right].id}이 겹칩니다.`,
                );
            }
        }
    }
};

const rackStorageNode = (object) => ({
    id: object.id,
    type: "rack_storage",
    x: round(object.x),
    y: round(object.y),
    rack_id: object.id,
    resource_id: object.id,
    service_only: false,
    transit_allowed: false,
    holding_allowed: false,
    node_capacity: 1,
    label: `${object.id} · 3층`,
});

const compiledNodeForObject = (
    object,
    referencedObjectIds,
) => {
    const unusedRackAccess =
        object.rawNode?.type === "rack_access" &&
        !referencedObjectIds.has(object.id);

    if (unusedRackAccess) {
        return null;
    }

    if (object.rawNode) {
        return {
            ...object.rawNode,
            id: object.id,
            x: round(object.x),
            y: round(object.y),
        };
    }

    if (object.kind === "rack") {
        return rackStorageNode(object);
    }

    return nodeForObject(object);
};

const buildCompiledNodes = (
    layoutObjects,
    referencedObjectIds,
) =>
    layoutObjects.flatMap((object) => {
        const node = compiledNodeForObject(
            object,
            referencedObjectIds,
        );

        return node ? [node] : [];
    });

const normalizeEdgeDistance = (distance) =>
    Math.max(Number(distance), 0.01);

const createEdgeBuilder = () => {
    const edges = [];
    let edgeSequence = 1;

    const addDirectedEdge = (
        source,
        target,
        distance,
        type,
        serviceOnly,
    ) => {
        const effectiveDistance =
            normalizeEdgeDistance(distance);

        edges.push({
            id: `E${String(
                edgeSequence,
            ).padStart(4, "0")}`,
            source,
            target,
            type,
            direction: "A_TO_B",
            distance_m: round(
                effectiveDistance,
            ),
            speed_limit_mps:
                DEFAULT_SPEED_MPS,
            nominal_travel_time_ms:
                Math.max(
                    1,
                    Math.round(
                        (effectiveDistance /
                            DEFAULT_SPEED_MPS) *
                            1000,
                    ),
                ),
            cost: round(effectiveDistance),
            service_only: serviceOnly,
            mobile_robot_traversable: true,
        });

        edgeSequence += 1;
    };

    const addRawAisleEdges = (
        aisle,
        source,
        target,
        distance,
        normalizeAsLane = false,
        normalizedServiceOnly = false,
    ) => {
        const rawEdges =
            aisle.rawEdges ?? [];

        const normalizedDistance = round(
            normalizeEdgeDistance(distance),
        );

        const withDistance = (
            edge,
            nextSource,
            nextTarget,
            direction = "A_TO_B",
        ) => ({
            ...edge,
            ...(normalizeAsLane
                ? {
                      type: "lane",
                      service_only:
                          normalizedServiceOnly,
                  }
                : {}),
            source: nextSource,
            target: nextTarget,
            direction,
            distance_m: normalizedDistance,
            nominal_travel_time_ms:
                Math.max(
                    1,
                    Math.round(
                        (normalizedDistance /
                            Number(
                                edge.speed_limit_mps ||
                                    DEFAULT_SPEED_MPS,
                            )) *
                            1000,
                    ),
                ),
            cost:
                edge.cost == null
                    ? normalizedDistance
                    : edge.cost,
        });

        if (aisle.direction === "BOTH") {
            if (
                rawEdges.length === 1 &&
                rawEdges[0].direction ===
                    "BOTH"
            ) {
                edges.push(
                    withDistance(
                        rawEdges[0],
                        source,
                        target,
                        "BOTH",
                    ),
                );

                return;
            }

            const forward =
                rawEdges.find(
                    (edge) =>
                        edge.source === source &&
                        edge.target === target,
                ) ?? rawEdges[0];

            const reverse = rawEdges.find(
                (edge) =>
                    edge.source === target &&
                    edge.target === source,
            );

            edges.push(
                withDistance(
                    forward,
                    source,
                    target,
                ),
            );

            edges.push(
                withDistance(
                    reverse ?? {
                        ...forward,
                        id:
                            `${forward.id || aisle.id}_RETURN`,
                    },
                    target,
                    source,
                ),
            );

            return;
        }

        const forward = rawEdges[0];

        if (
            aisle.direction === "REVERSE"
        ) {
            edges.push(
                withDistance(
                    forward,
                    target,
                    source,
                ),
            );
        } else {
            edges.push(
                withDistance(
                    forward,
                    source,
                    target,
                ),
            );
        }
    };

    return {
        edges,
        addDirectedEdge,
        addRawAisleEdges,
    };
};

const isServiceOnlyConnection = (
    startObject,
    endObject,
) =>
    [startObject, endObject].some(
        (object) =>
            object.rawNode?.type ===
                "rack_access" ||
            (object.kind !== "route" &&
                object.kind !== "charging"),
    );

const compileAisles = (
    aisles,
    objectById,
    warnings,
) => {
    const linkedObjectIds = new Set();
    const connectionKeys = new Set();
    const edgeBuilder = createEdgeBuilder();

    aisles.forEach((aisle) => {
        const startObject = objectById.get(
            aisle.startNodeId,
        );

        const endObject = objectById.get(
            aisle.endNodeId,
        );

        if (
            !startObject ||
            !endObject ||
            startObject.id === endObject.id
        ) {
            return;
        }

        const connectionKey =
            connectionKeyOf(
                startObject.id,
                endObject.id,
            );

        if (
            connectionKeys.has(connectionKey)
        ) {
            warnings.push(
                `${startObject.id}과(와) ${endObject.id} 사이의 중복 엣지는 제외했습니다.`,
            );

            return;
        }

        connectionKeys.add(connectionKey);
        linkedObjectIds.add(startObject.id);
        linkedObjectIds.add(endObject.id);

        const startPoint =
            getLayoutConnectionPoint(startObject);

        const endPoint =
            getLayoutConnectionPoint(endObject);

        const distance = distanceBetween(
            startPoint,
            endPoint,
        );

        const source =
            getLayoutConnectionNodeId(
                startObject,
            );

        const target =
            getLayoutConnectionNodeId(
                endObject,
            );

        const type = edgeType(
            startObject,
            endObject,
        );

        const serviceOnly =
            isServiceOnlyConnection(
                startObject,
                endObject,
            );

        const chargingConnection =
            startObject.kind === "charging" ||
            endObject.kind === "charging";

        if (aisle.rawEdges?.length) {
            edgeBuilder.addRawAisleEdges(
                aisle,
                source,
                target,
                distance,
                chargingConnection,
                serviceOnly,
            );

            return;
        }

        if (
            aisle.direction === "FORWARD"
        ) {
            edgeBuilder.addDirectedEdge(
                source,
                target,
                distance,
                type,
                serviceOnly,
            );

            return;
        }

        if (
            aisle.direction === "REVERSE"
        ) {
            edgeBuilder.addDirectedEdge(
                target,
                source,
                distance,
                type,
                serviceOnly,
            );

            return;
        }

        edgeBuilder.addDirectedEdge(
            source,
            target,
            distance,
            type,
            serviceOnly,
        );

        edgeBuilder.addDirectedEdge(
            target,
            source,
            distance,
            type,
            serviceOnly,
        );
    });

    return {
        edges: edgeBuilder.edges,
        linkedObjectIds,
        connectionKeys,
    };
};

const validateLinkedObjects = (
    layoutObjects,
    referencedObjectIds,
    linkedObjectIds,
    errors,
) => {
    layoutObjects.forEach((object) => {
        const ignoresConnectionValidation =
            object.rawNode?.type ===
                "rack_storage" ||
            (object.rawNode?.type ===
                "rack_access" &&
                !referencedObjectIds.has(
                    object.id,
                ));

        if (
            ignoresConnectionValidation
        ) {
            return;
        }

        if (
            !linkedObjectIds.has(object.id)
        ) {
            errors.push(
                `${object.id} 노드가 엣지로 연결되지 않았습니다.`,
            );
        }
    });
};

const validateGraphConnection = (
    nodes,
    edges,
    errors,
) => {
    const graphNodes = nodes.filter(
        (node) =>
            node.type !== "rack_storage",
    );

    const visited = connectedNodeIds(
        graphNodes,
        edges,
    );

    const disconnected = graphNodes.filter(
        (node) => !visited.has(node.id),
    );

    if (
        graphNodes.length > 0 &&
        disconnected.length > 0
    ) {
        errors.push(
            `경로망에서 분리된 노드가 있습니다: ${disconnected
                .slice(0, 5)
                .map((node) => node.id)
                .join(", ")}`,
        );
    }
};

export function compileWarehouseLayout({
    width,
    height,
    objects = [],
    aisles = [],
    title = "사용자 설계 창고",
}) {
    const warehouseWidth = Number(width);
    const warehouseHeight = Number(height);

    const errors = [];
    const warnings = [];

    const layoutObjects = objects.filter(
        (object) =>
            Boolean(
                LAYOUT_OBJECT_DEFINITIONS[
                    object.kind
                ],
            ),
    );

    const objectById = new Map(
        layoutObjects.map((object) => [
            object.id,
            object,
        ]),
    );

    const referencedObjectIds = new Set(
        aisles.flatMap((aisle) => [
            aisle.startNodeId,
            aisle.endNodeId,
        ]),
    );

    if (
        layoutObjects.length !==
        objects.length
    ) {
        warnings.push(
            "현재 설계에서 지원하지 않는 시설물은 저장 대상에서 제외했습니다.",
        );
    }

    if (
        !hasValidWarehouseSize(
            warehouseWidth,
            warehouseHeight,
        )
    ) {
        errors.push(
            "창고 가로·세로 크기를 먼저 입력하세요.",
        );
    }

    validateRequiredKinds(
        layoutObjects,
        errors,
    );

    validateObjectBounds(
        layoutObjects,
        warehouseWidth,
        warehouseHeight,
        errors,
    );

    validateObjectOverlaps(
        layoutObjects,
        errors,
    );

    const nodes = buildCompiledNodes(
        layoutObjects,
        referencedObjectIds,
    );

    const {
        edges,
        linkedObjectIds,
        connectionKeys,
    } = compileAisles(
        aisles,
        objectById,
        warnings,
    );

    if (connectionKeys.size === 0) {
        errors.push(
            "엣지 도구로 서로 다른 노드 두 개를 연결하세요.",
        );
    }

    validateLinkedObjects(
        layoutObjects,
        referencedObjectIds,
        linkedObjectIds,
        errors,
    );

    const persisted =
        expandFacilityEndpointsForStorage(
            nodes,
            edges,
        );

    const persistedNodes =
        persisted.nodes;

    const persistedEdges =
        withUniqueEdgeIds(
            persisted.edges,
        );

    validateGraphConnection(
        persistedNodes,
        persistedEdges,
        errors,
    );

    const uniqueErrors = [
        ...new Set(errors),
    ];

    const uniqueWarnings = [
        ...new Set(warnings),
    ];

    const rackCount =
        layoutObjects.filter(
            (object) =>
                object.kind === "rack",
        ).length;

    const routeNodeCount =
        layoutObjects.filter(
            (object) =>
                object.kind === "route" &&
                object.rawNode?.type !==
                    "rack_access",
        ).length;

    const facilityCount =
        layoutObjects.filter(
            (object) =>
                object.kind !== "rack" &&
                object.kind !== "route",
        ).length;

    return {
        map: {
            schema_version:
                "laro-layout-editor-v2-explicit-edges",
            title,
            nodes: persistedNodes,
            edges: persistedEdges,
            summary: {
                node_count:
                    persistedNodes.length,
                edge_count:
                    persistedEdges.length,
                route_node_count:
                    routeNodeCount,
                rack_entity_count:
                    rackCount,
                storage_slot_count:
                    rackCount * 3,
            },
        },
        validation: {
            isValid:
                uniqueErrors.length === 0,
            errors: uniqueErrors,
            warnings: uniqueWarnings,
        },
        stats: {
            rackCount,
            storageSlotCount:
                rackCount * 3,
            routeNodeCount,
            edgeCount: edges.length,
            connectionCount:
                connectionKeys.size,
            facilityCount,
        },
    };
}