import {
    FACILITY_GROUP_KINDS,
    REQUIRED_FACILITY_KINDS,
    TOOL_GUIDE_MESSAGES,
} from "./warehouseEditorConfig";

// ============================================================
// 1. 상태 복사와 객체·엣지 표시 계산
// ============================================================

export const snapshotOf = (objects, aisles) => ({
    objects: objects.map((object) => ({
        ...object,
        rawNode: object.rawNode ? { ...object.rawNode } : undefined,
    })),
    aisles: aisles.map((aisle) => ({
        ...aisle,
        start: { ...aisle.start },
        end: { ...aisle.end },
        rawEdges: aisle.rawEdges?.map((edge) => ({ ...edge })),
    })),
});

export const objectDimensions = (object) => {
    const rotated = Math.abs(Number(object.rotation) % 180) === 90;

    return {
        width: rotated ? object.height : object.width,
        height: rotated ? object.width : object.height,
    };
};

export const nextAisleId = (aisles) => {
    const used = new Set(aisles.map((aisle) => aisle.id));
    let sequence = 1;

    while (used.has(`A${String(sequence).padStart(3, "0")}`)) {
        sequence += 1;
    }

    return `A${String(sequence).padStart(3, "0")}`;
};

export const aisleVisualClass = (aisle) => {
    const type = String(aisle.rawEdges?.[0]?.type ?? "lane").toLowerCase();

    if (type.includes("rack")) return "rack-edge";

    if (type.includes("inbound") || type.includes("handoff")) {
        return "inbound-edge";
    }

    if (
        type.includes("outbound")
        || type.includes("station")
        || type.includes("tote")
    ) {
        return "outbound-edge";
    }

    if (type.includes("return")) return "return-edge";

    return "route-edge";
};

export const objectRenderPriority = (object) => {
    const type = object.rawNode?.type;

    if (type === "rack_storage") return 0;
    if (type === "inbound" || type === "outbound") return 1;
    if (type === "charging_slot") return 2;
    if (type?.includes("access")) return 4;

    return 3;
};

// facilityEndpoint가 없는 입고·출고 접근 노드는 설비 내부 연결용이므로 화면에서 숨긴다.
export const isInternalAccessObject = (object) => [
    "inbound_handoff_access",
    "outbound_station_access",
].includes(object?.rawNode?.type) && !object?.facilityEndpoint;

// rack_access는 선반 연결 관계에만 사용하며 선반 도형과 중복 렌더링하지 않는다.
export const isRackAccessObject = (object) =>
    object?.rawNode?.type === "rack_access";

// ============================================================
// 2. 반복 설비 그룹 계산
// ============================================================

export const orderedFacilityMembers = (members, orientation) =>
    [...members].sort((left, right) => {
        const indexDifference =
            Number(left.facilityIndex ?? 0)
            - Number(right.facilityIndex ?? 0);

        if (indexDifference !== 0) {
            return indexDifference;
        }

        return orientation === "HORIZONTAL"
            ? left.x - right.x || left.y - right.y
            : left.y - right.y || left.x - right.x;
    });

export const facilityGroupBounds = (members) => {
    if (members.length === 0) {
        return null;
    }

    const boxes = members.map((object) => {
        const dimensions = objectDimensions(object);

        return {
            left: object.x - dimensions.width / 2,
            right: object.x + dimensions.width / 2,
            top: object.y - dimensions.height / 2,
            bottom: object.y + dimensions.height / 2,
        };
    });

    return {
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        top: Math.min(...boxes.map((box) => box.top)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
};

export const facilityGroupLabel = (kind) => ({
    inbound: "입고 설비",
    outbound: "출고 설비",
    charging: "충전 설비",
}[kind] ?? "설비");

export const minimumFacilityStep = (members, orientation, compact) => {
    const occupiedSize = Math.max(
        ...members.map((member) => {
            const dimensions = objectDimensions(member);

            return orientation === "HORIZONTAL"
                ? dimensions.width
                : dimensions.height;
        }),
        0,
    );

    const minimumGap = compact ? 0.04 : 0.2;

    return Math.ceil((occupiedSize + minimumGap) * 100) / 100;
};

export const alphaLabel = (index, upperCase = false) => {
    let value = index + 1;
    let label = "";

    while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }

    return upperCase ? label : label.toLowerCase();
};

/**
 * 기존 지도 데이터 형식을 유지하면서 새 설비의 ID와 화면 라벨을 생성한다.
 * 접근 노드 기반 지도는 IN_HANDOFF_1, OUT_STATION_1 형식을 사용하고,
 * 일반 설비 지도는 I_a, O_A, C01 형식을 사용한다.
 * 이미 존재하는 ID는 건너뛴다.
 */
export const nextRawFacilityIdentity = (
    kind,
    objects,
    template = null,
) => {
    const used = new Set(objects.map((object) => object.id));

    const accessFacility = [
        "inbound_handoff_access",
        "outbound_station_access",
    ].includes(template?.type);

    for (let index = 0; index < 999; index += 1) {
        if (accessFacility) {
            const id = kind === "inbound"
                ? `IN_HANDOFF_${index + 1}`
                : `OUT_STATION_${index + 1}`;

            if (!used.has(id)) {
                return {
                    id,
                    label: String(index + 1),
                };
            }

            continue;
        }

        const label = kind === "charging"
            ? String(index + 1).padStart(2, "0")
            : alphaLabel(index, kind === "outbound");

        const id = kind === "inbound"
            ? `I_${label}`
            : kind === "outbound"
                ? `O_${label}`
                : `C${label}`;

        if (!used.has(id)) {
            return { id, label };
        }
    }

    throw new Error("설비 노드 ID를 생성할 수 없습니다.");
};

// ============================================================
// 3. 초안 초기화와 공통 UI 유틸
// ============================================================

export const initialObjectsFromDraft = (initialDraft) => (
    Array.isArray(initialDraft?.objects)
        ? initialDraft.objects
            .filter((object) => object.kind !== "buffer")
            .map((object) => ({ ...object }))
        : []
);

export const initialAislesFromDraft = (initialDraft) => (
    Array.isArray(initialDraft?.aisles)
        ? initialDraft.aisles
            .filter((aisle) => aisle.startNodeId && aisle.endNodeId)
            .map((aisle) => ({
                ...aisle,
                start: { ...aisle.start },
                end: { ...aisle.end },
            }))
        : []
);

export const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, value));

export const toolGuideMessage = (tool) =>
    TOOL_GUIDE_MESSAGES[tool] ?? "";

export const isEditableKeyboardTarget = (target) => {
    const tagName = target?.tagName?.toLowerCase();

    return (
        ["input", "select", "textarea"].includes(tagName)
        || target?.isContentEditable
    );
};

export const isPointInsideRect = (
    clientX,
    clientY,
    rect,
) => (
    Boolean(rect)
    && clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom
);

export const defaultFacilityStep = (member, existingMapMode) => (
    Number(member?.facilityStep)
    || (
        existingMapMode
            ? 0.5
            : Math.max(member?.width ?? 0, member?.height ?? 0) + 0.3
    )
);

export const calculateContentViewport = (
    objects,
    existingMapMode,
) => {
    if (!existingMapMode || objects.length === 0) {
        return null;
    }

    const xValues = objects
        .map((object) => Number(object.x))
        .filter(Number.isFinite);

    const yValues = objects
        .map((object) => Number(object.y))
        .filter(Number.isFinite);

    if (xValues.length === 0 || yValues.length === 0) {
        return null;
    }

    const left = Math.min(...xValues);
    const right = Math.max(...xValues);
    const top = Math.min(...yValues);
    const bottom = Math.max(...yValues);

    const spanX = Math.max(right - left, 1);
    const spanY = Math.max(bottom - top, 1);
    const margin = Math.max(spanX, spanY) * 0.06;

    return {
        x: left - margin,
        y: top - margin,
        width: spanX + margin * 2,
        height: spanY + margin * 2,
    };
};

// ============================================================
// 4. 그래프 표시와 검증 데이터
// ============================================================

export const uniqueVisibleEdges = (edges) => {
    const visibleEdges = [];
    const visibleEdgeKeys = new Set();

    edges.forEach((edge) => {
        const key = [edge.source, edge.target]
            .sort()
            .join("::");

        if (!visibleEdgeKeys.has(key)) {
            visibleEdgeKeys.add(key);
            visibleEdges.push(edge);
        }
    });

    return visibleEdges;
};

export const createFacilityGroups = (objects) => [
    ...new Set(
        objects
            .map((object) => object.facilityGroupId)
            .filter(Boolean),
    ),
].map((groupId) => {
    const members = objects.filter(
        (object) => object.facilityGroupId === groupId,
    );

    return {
        id: groupId,
        kind: members[0]?.kind,
        members,
        bounds: facilityGroupBounds(members),
    };
}).filter((group) => group.bounds);

export const createImportantGraphIds = ({
    aisles,
    aisleStart,
    objectById,
    renderObjects,
    selectedAisle,
    selectedObject,
}) => {
    const importantNodeIds = new Set();
    const importantAisleIds = new Set();

    const physicalRouteObjects = renderObjects.filter(
        (object) => (
            object.kind === "route"
            && (
                !object.rawNode
                || object.rawNode.type === "route"
            )
        ),
    );

    const leftmostRouteByRow = new Map();
    const topmostRouteByColumn = new Map();

    physicalRouteObjects.forEach((object) => {
        const rowKey = Number(object.y).toFixed(3);
        const columnKey = Number(object.x).toFixed(3);

        const leftmost = leftmostRouteByRow.get(rowKey);
        const topmost = topmostRouteByColumn.get(columnKey);

        if (!leftmost || object.x < leftmost.x) {
            leftmostRouteByRow.set(rowKey, object);
        }

        if (!topmost || object.y < topmost.y) {
            topmostRouteByColumn.set(columnKey, object);
        }
    });

    leftmostRouteByRow.forEach((object) => {
        importantNodeIds.add(object.id);
    });

    topmostRouteByColumn.forEach((object) => {
        importantNodeIds.add(object.id);
    });

    aisles.forEach((aisle) => {
        const startObject = objectById.get(aisle.startNodeId);
        const endObject = objectById.get(aisle.endNodeId);

        const startIsFacility =
            FACILITY_GROUP_KINDS.has(startObject?.kind);

        const endIsFacility =
            FACILITY_GROUP_KINDS.has(endObject?.kind);

        if (!startIsFacility && !endIsFacility) {
            return;
        }

        importantAisleIds.add(aisle.id);

        if (startObject?.kind === "route") {
            importantNodeIds.add(startObject.id);
        }

        if (endObject?.kind === "route") {
            importantNodeIds.add(endObject.id);
        }
    });

    if (selectedObject) {
        importantNodeIds.add(selectedObject.id);
    }

    if (aisleStart?.nodeId) {
        importantNodeIds.add(aisleStart.nodeId);
    }

    if (selectedAisle) {
        importantAisleIds.add(selectedAisle.id);
    }

    return {
        importantNodeIds,
        importantAisleIds,
    };
};

export const createValidationState = ({
    aisles,
    compiled,
    dimensionsReady,
    objects,
}) => {
    const missingFacilityLabels = REQUIRED_FACILITY_KINDS
        .filter(
            ([kind]) =>
                !objects.some((object) => object.kind === kind),
        )
        .map(([, label]) => label);

    const facilitiesReady =
        dimensionsReady
        && missingFacilityLabels.length === 0;

    const routeNodeReady = objects.some(
        (object) =>
            object.kind === "route"
            && !isRackAccessObject(object),
    );

    const connectionErrors = compiled.validation.errors.filter(
        (error) =>
            error.includes("엣지")
            || error.includes("연결")
            || error.includes("분리된 노드"),
    );

    const placementErrors = compiled.validation.errors.filter(
        (error) =>
            error.includes("경계")
            || error.includes("겹칩니다"),
    );

    const routeReady =
        routeNodeReady
        && aisles.length > 0
        && connectionErrors.length === 0;

    const placementReady =
        facilitiesReady
        && routeReady
        && placementErrors.length === 0;

    const validationSteps = [
        {
            id: "facilities",
            label: "필수 시설 배치",
            complete: facilitiesReady,
            description: !dimensionsReady
                ? "먼저 창고 가로·세로 크기를 입력하세요."
                : missingFacilityLabels.length > 0
                    ? `${missingFacilityLabels.join("·")}를 1개 이상 배치하세요.`
                    : "선반과 입고·출고·충전 설비가 준비되었습니다.",
        },
        {
            id: "routes",
            label: "노드·엣지 연결",
            complete: routeReady,
            description: !routeNodeReady
                ? "경로 노드를 배치한 뒤 엣지 연결 도구로 시설과 연결하세요."
                : aisles.length === 0
                    ? "엣지 연결을 누르고 서로 다른 노드 두 개를 차례로 선택하세요."
                    : connectionErrors[0]
                        ?? "모든 시설이 하나의 경로망으로 연결되었습니다.",
        },
        {
            id: "placement",
            label: "배치 검증",
            complete: placementReady,
            description: placementErrors[0] ?? (
                compiled.validation.isValid
                    ? "경계·겹침 검사를 통과했습니다."
                    : "앞 단계의 미완료 항목을 해결하면 자동으로 검증됩니다."
            ),
        },
    ];

    return {
        validationSteps,
        activeValidationStep: validationSteps.find(
            (step) => !step.complete,
        ),
    };
};
