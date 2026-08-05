import { useEffect, useMemo, useRef, useState } from "react";
import {
    LAYOUT_OBJECT_DEFINITIONS,
    compileWarehouseLayout,
    createExplicitAisle,
    createLayoutObject,
    getLayoutConnectionPoint,
    snapLayoutPoint,
} from "../../utils/warehouseLayoutBuilder";
import "../../styles/WarehouseLayoutEditor.css";

/**
 * 창고 레이아웃을 직접 편집하는 React 컴포넌트입니다.
 *
 * 이 파일에서 담당하는 핵심 기능은 다음과 같습니다.
 * 1. 선반·입고지·출고지·충전소·경로 노드를 SVG 캔버스에 배치합니다.
 * 2. 두 노드를 선택해 엣지를 만들고, 엣지의 통행 방향을 설정합니다.
 * 3. 객체 이동, 캔버스 이동, 확대·축소, 실행 취소, 길게 눌러 삭제를 처리합니다.
 * 4. 반복 설비 그룹의 개수·방향·간격을 한 번에 변경합니다.
 * 5. 편집 중인 초안을 실제 저장용 지도 구조로 컴파일하고 유효성을 검증합니다.
 *
 * 주의: 화면 좌표와 창고 좌표가 다르므로 포인터 입력은 항상 SVG 좌표로 변환한 뒤 사용합니다.
 */

/**
 * 편집기에서 공통으로 사용하는 기준값입니다.
 * 일반 신규 지도는 1m 단위로 정렬하고, 기존 지도 편집 모드에서는 더 촘촘한 좌표를 사용합니다.
 * MAX_HISTORY는 실행 취소 메모리의 최대 개수이며, DELETE_HOLD_MS는 실수로 삭제하는 것을 막기 위한 대기 시간입니다.
 */
const GRID_SIZE = 1;
const EXISTING_MAP_GRID_SIZE = 0.05;
const EXISTING_MAP_MAJOR_GRID_SIZE = 0.25;
const MAX_HISTORY = 30;
const DELETE_HOLD_MS = 3000;
const FACILITY_GROUP_KINDS = new Set(["inbound", "outbound", "charging"]);

/**
 * 기존 지도 편집 모드에서 객체가 지나치게 크게 보이지 않도록 사용하는 축소 크기입니다.
 * 기존 지도 좌표는 일반 신규 설계 좌표보다 훨씬 작은 단위를 사용할 수 있으므로 별도 크기가 필요합니다.
 */
const COMPACT_OBJECT_SIZES = {
    rack: { width: 0.48, height: 0.38 },
    inbound: { width: 0.32, height: 0.28 },
    outbound: { width: 0.32, height: 0.28 },
    charging: { width: 0.32, height: 0.32 },
    route: { width: 0, height: 0 },
};

/**
 * 우측 도구 팔레트에 표시할 도구를 기능별로 묶습니다.
 * 화면 렌더링 순서도 이 배열의 순서를 그대로 따릅니다.
 */
const PALETTE_GROUPS = [
    {
        title: "시설물",
        tools: ["rack", "inbound", "outbound", "charging"],
    },
    {
        title: "경로망",
        tools: ["AISLE", "route"],
    },
];

/**
 * 각 도구의 화면 표시 이름, 아이콘, 도움말을 한곳에서 관리합니다.
 * 실제 객체 생성 규칙은 warehouseLayoutBuilder의 LAYOUT_OBJECT_DEFINITIONS를 사용하고,
 * 이 객체는 사용자 인터페이스에 필요한 메타데이터만 담당합니다.
 */
const TOOL_META = {
    SELECT: { label: "선택·이동", symbol: "↖", description: "배치된 객체를 선택하고 이동합니다." },
    AISLE: { label: "엣지 연결", symbol: "╱", description: "서로 다른 노드 두 개를 차례로 선택해 연결합니다." },
    rack: { label: "3층 선반", symbol: "▤", description: LAYOUT_OBJECT_DEFINITIONS.rack.description },
    inbound: { label: "입고지", symbol: "⇥", description: LAYOUT_OBJECT_DEFINITIONS.inbound.description },
    outbound: { label: "출고지", symbol: "⇢", description: LAYOUT_OBJECT_DEFINITIONS.outbound.description },
    charging: { label: "충전소", symbol: "▲", description: LAYOUT_OBJECT_DEFINITIONS.charging.description },
    route: { label: "경로 노드", symbol: "◇", description: LAYOUT_OBJECT_DEFINITIONS.route.description },
};

/**
 * 현재 객체와 엣지 상태를 실행 취소용 스냅샷으로 복사합니다.
 *
 * 배열만 복사하면 내부 객체가 같은 참조를 공유하므로 이후 수정 시 과거 기록까지 바뀔 수 있습니다.
 * 따라서 rawNode, start, end, rawEdges처럼 중첩된 값도 별도 객체로 복사합니다.
 */
const snapshotOf = (objects, aisles) => ({
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

/**
 * 객체의 현재 회전 상태를 반영한 실제 화면 너비와 높이를 반환합니다.
 * 90도 또는 270도 회전한 객체는 원래 width와 height를 서로 바꾸어 계산해야 합니다.
 */
const objectDimensions = (object) => {
    const rotated = Math.abs(Number(object.rotation) % 180) === 90;
    return {
        width: rotated ? object.height : object.width,
        height: rotated ? object.width : object.height,
    };
};

/**
 * 사용 중이지 않은 다음 엣지 ID를 A001, A002 형식으로 생성합니다.
 * 중간 번호가 삭제된 경우에는 가장 앞에서부터 비어 있는 번호를 다시 사용할 수 있습니다.
 */
const nextAisleId = (aisles) => {
    const used = new Set(aisles.map((aisle) => aisle.id));
    let sequence = 1;

    while (used.has(`A${String(sequence).padStart(3, "0")}`)) {
        sequence += 1;
    }

    return `A${String(sequence).padStart(3, "0")}`;
};

/**
 * 원본 엣지 타입에 따라 CSS 클래스를 결정합니다.
 * 엣지의 의미를 색상이나 선 스타일로 구분하기 위한 화면 표현용 분류이며, 데이터 자체는 변경하지 않습니다.
 */
const aisleVisualClass = (aisle) => {
    const type = String(aisle.rawEdges?.[0]?.type ?? "lane").toLowerCase();

    if (type.includes("rack")) return "rack-edge";
    if (type.includes("inbound") || type.includes("handoff")) return "inbound-edge";
    if (type.includes("outbound") || type.includes("station") || type.includes("tote")) return "outbound-edge";
    if (type.includes("return")) return "return-edge";
    return "route-edge";
};

/**
 * 기존 지도를 그릴 때 객체가 겹치는 순서를 결정합니다.
 * 선반과 주요 설비를 먼저 그리고 접근 노드를 나중에 그려, 작은 연결 노드가 다른 도형 뒤에 가려지지 않게 합니다.
 */
const objectRenderPriority = (object) => {
    const type = object.rawNode?.type;
    if (type === "rack_storage") return 0;
    if (type === "inbound" || type === "outbound") return 1;
    if (type === "charging_slot") return 2;
    if (type?.includes("access")) return 4;
    return 3;
};

/**
 * 입고·출고 설비 내부에서만 사용하는 접근 노드인지 확인합니다.
 * facilityEndpoint가 있는 노드는 실제 외부 연결 지점이므로 내부 노드로 숨기지 않습니다.
 */
const isInternalAccessObject = (object) => [
    "inbound_handoff_access",
    "outbound_station_access",
].includes(object?.rawNode?.type) && !object?.facilityEndpoint;

/**
 * 선반에 딸린 보조 접근 노드인지 확인합니다.
 * rack_access는 선반 자체 도형과 별도로 화면에 중복 렌더링하지 않고, 연결 관계 처리에만 사용합니다.
 */
const isRackAccessObject = (object) => object?.rawNode?.type === "rack_access";

/**
 * 반복 설비 그룹의 구성원을 사용자가 보는 순서대로 정렬합니다.
 * facilityIndex가 있으면 그 값을 우선 사용하고, 값이 같거나 없으면 현재 배치 방향에 맞춰 좌표 순으로 정렬합니다.
 */
const orderedFacilityMembers = (members, orientation) => [...members].sort((left, right) => {
    const indexDifference = Number(left.facilityIndex ?? 0) - Number(right.facilityIndex ?? 0);
    if (indexDifference !== 0) {
        return indexDifference;
    }
    return orientation === "HORIZONTAL"
        ? left.x - right.x || left.y - right.y
        : left.y - right.y || left.x - right.x;
});

/**
 * 반복 설비 그룹 전체를 감싸는 최소 사각형 범위를 계산합니다.
 * 객체 중심 좌표뿐 아니라 회전이 반영된 실제 너비와 높이까지 고려해 좌·우·상·하 경계를 구합니다.
 */
const facilityGroupBounds = (members) => {
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

/** 설비 종류 코드를 사용자에게 보여 줄 한글 이름으로 변환합니다. */
const facilityGroupLabel = (kind) => ({
    inbound: "입고 설비",
    outbound: "출고 설비",
    charging: "충전 설비",
}[kind] ?? "설비");

/**
 * 반복 설비끼리 겹치지 않기 위한 최소 중심 간격을 계산합니다.
 * 가로 배치에서는 객체 너비, 세로 배치에서는 객체 높이를 기준으로 하며, 편집 모드에 따라 최소 여백을 다르게 둡니다.
 */
const minimumFacilityStep = (members, orientation, compact) => {
    const occupiedSize = Math.max(
        ...members.map((member) => {
            const dimensions = objectDimensions(member);
            return orientation === "HORIZONTAL" ? dimensions.width : dimensions.height;
        }),
        0,
    );
    const minimumGap = compact ? 0.04 : 0.2;
    return Math.ceil((occupiedSize + minimumGap) * 100) / 100;
};

/**
 * 0부터 시작하는 숫자를 a, b, ..., z, aa 형식의 알파벳 라벨로 변환합니다.
 * 출고 설비처럼 대문자가 필요한 경우 upperCase 옵션을 사용합니다.
 */
const alphaLabel = (index, upperCase = false) => {
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
 * 기존 지도 데이터 형식을 유지하면서 새 설비의 ID와 화면 라벨을 생성합니다.
 *
 * 접근 노드 기반 지도는 IN_HANDOFF_1, OUT_STATION_1 형식을 사용하고,
 * 일반 설비 지도는 I_a, O_A, C01 형식을 사용합니다. 이미 존재하는 ID는 건너뜁니다.
 */
const nextRawFacilityIdentity = (kind, objects, template = null) => {
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
                return { id, label: String(index + 1) };
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

/**
 * 창고 지도 편집기 컴포넌트입니다.
 *
 * @param {number|string} width 창고 전체 너비입니다.
 * @param {number|string} height 창고 전체 높이입니다.
 * @param {string} title 컴파일된 지도에 저장할 제목입니다.
 * @param {Function} onChange 편집 내용을 저장용 지도 구조로 변환한 결과를 전달합니다.
 * @param {Object|null} initialDraft 이전에 편집하던 objects와 aisles 초안입니다.
 * @param {Function} onDraftChange 편집 가능한 원본 초안이 바뀔 때 호출됩니다.
 * @param {boolean} existingMapMode 기존 지도 좌표와 원본 노드 정보를 유지하는 편집 모드 여부입니다.
 */
function WarehouseLayoutEditor({
    width,
    height,
    title,
    onChange,
    initialDraft = null,
    onDraftChange,
    existingMapMode = false,
}) {
    /** SVG DOM 접근, 최신 휠 핸들러 보관, 삭제 타이머 정리를 위한 ref입니다. */
    const svgRef = useRef(null);
    const canvasWheelHandlerRef = useRef(null);
    const deleteTimerRef = useRef(null);
    /**
     * 지도에 배치된 모든 노드성 객체를 관리합니다.
     * 초기 초안에서 더 이상 사용하지 않는 buffer 객체는 제외하고, 외부 데이터와 참조가 섞이지 않도록 복사합니다.
     */
    const [objects, setObjects] = useState(() =>
        Array.isArray(initialDraft?.objects)
            ? initialDraft.objects
                  .filter((object) => object.kind !== "buffer")
                  .map((object) => ({ ...object }))
            : [],
    );
    /**
     * 사용자가 직접 연결한 엣지 목록입니다.
     * 시작·끝 노드 ID가 모두 있는 정상 엣지만 불러오며, 좌표 객체 역시 새 객체로 복사합니다.
     */
    const [aisles, setAisles] = useState(() =>
        Array.isArray(initialDraft?.aisles)
            ? initialDraft.aisles
                  .filter((aisle) => aisle.startNodeId && aisle.endNodeId)
                  .map((aisle) => ({
                      ...aisle,
                      start: { ...aisle.start },
                      end: { ...aisle.end },
                  }))
            : [],
    );
    /**
     * 편집기 상호작용 상태입니다.
     * history는 실행 취소용 과거 상태, activeTool은 현재 도구, selected는 현재 선택 항목을 저장합니다.
     * aisleStart는 엣지 연결의 첫 번째 노드, dragging/panning은 포인터 이동 상태를 나타냅니다.
     */
    const [history, setHistory] = useState([]);
    const [activeTool, setActiveTool] = useState("SELECT");
    const [selected, setSelected] = useState(null);
    const [aisleStart, setAisleStart] = useState(null);
    const [edgeMessage, setEdgeMessage] = useState("");
    const [dragging, setDragging] = useState(null);
    const [panning, setPanning] = useState(null);
    const [viewport, setViewport] = useState(null);
    const [paletteDragging, setPaletteDragging] = useState(null);
    const [showGraph, setShowGraph] = useState(!existingMapMode);
    const [deleteHold, setDeleteHold] = useState(null);

    /** 입력값을 실제 계산에 사용할 숫자로 정규화하고, 편집 가능한 크기인지 확인합니다. */
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const dimensionsReady = Number.isFinite(numericWidth) && numericWidth > 0 &&
        Number.isFinite(numericHeight) && numericHeight > 0;
    const editorGridSize = existingMapMode ? EXISTING_MAP_GRID_SIZE : GRID_SIZE;
    const visualGridSize = existingMapMode ? EXISTING_MAP_MAJOR_GRID_SIZE : GRID_SIZE;
    /**
     * 기본 화면 범위.
     *
     * 새로 그리는 창고는 입력한 폭·높이가 곧 도면 크기다.
     * 반면 지도를 올려 만든 창고는 좌표가 파워포인트 인치라
     * 폭·높이와 전혀 다른 값이다. 그대로 쓰면 도면이 화면 한구석에
     * 아주 작게 박히므로, 실제 노드가 차지하는 범위를 재서 맞춘다.
     */
    const contentViewport = useMemo(() => {
        if (!existingMapMode || objects.length === 0) {
            return null;
        }

        const xValues = objects.map((object) => Number(object.x)).filter(Number.isFinite);
        const yValues = objects.map((object) => Number(object.y)).filter(Number.isFinite);

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
    }, [existingMapMode, objects]);

    /**
     * 사용자가 이동·확대한 viewport가 있으면 최우선으로 사용합니다.
     * 없다면 기존 지도 콘텐츠 범위, 그것도 없으면 창고 전체 크기를 기본 화면 범위로 사용합니다.
     */
    const activeViewport = viewport ?? contentViewport ?? {
        x: 0,
        y: 0,
        width: numericWidth || 1,
        height: numericHeight || 1,
    };

    /** 창고 크기가 바뀌면 이전 확대·이동 범위가 맞지 않을 수 있으므로 화면 맞춤 상태로 되돌립니다. */
    useEffect(() => {
        setViewport(null);
    }, [numericHeight, numericWidth]);

    /**
     * 편집용 objects/aisles를 실제 지도 노드·방향 엣지·통계·검증 결과로 변환합니다.
     * 입력 데이터가 바뀐 경우에만 다시 계산하도록 useMemo를 사용합니다.
     */
    const compiled = useMemo(
        () => compileWarehouseLayout({
            width: numericWidth,
            height: numericHeight,
            objects,
            aisles,
            title: title || "사용자 설계 창고",
        }),
        [aisles, numericHeight, numericWidth, objects, title],
    );

    /** 컴파일 결과가 바뀔 때마다 부모 컴포넌트에 최신 저장용 데이터를 전달합니다. */
    useEffect(() => {
        onChange(compiled);
    }, [compiled, onChange]);

    /**
     * 부모가 편집 초안을 별도로 보관할 수 있도록 원본 편집 상태도 전달합니다.
     * 선택·드래그 같은 UI 상태는 제외하고, 다시 불러오는 데 필요한 객체와 엣지만 복사합니다.
     */
    useEffect(() => {
        onDraftChange?.(snapshotOf(objects, aisles));
    }, [aisles, objects, onDraftChange]);

    /**
     * 상태를 변경하기 직전의 현재 지도를 실행 취소 기록에 추가합니다.
     * 가장 최근 MAX_HISTORY개만 남겨 무제한으로 메모리가 증가하지 않게 합니다.
     */
    const pushHistory = () => {
        setHistory((previous) => [
            ...previous.slice(-(MAX_HISTORY - 1)),
            snapshotOf(objects, aisles),
        ]);
    };

    /**
     * 브라우저 화면 기준 포인터 좌표를 SVG의 창고 좌표로 변환합니다.
     * getScreenCTM의 역행렬을 사용하므로 확대·축소나 화면 비율이 달라도 정확한 지도 위치를 얻을 수 있습니다.
     * 변환된 좌표는 창고 경계를 벗어나지 않도록 0~width, 0~height 범위로 제한합니다.
     */
    const pointFromClient = (clientX, clientY) => {
        const svg = svgRef.current;

        if (!svg) {
            return { x: 0, y: 0 };
        }

        const matrix = svg.getScreenCTM();

        if (!matrix) {
            return { x: 0, y: 0 };
        }

        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const transformed = point.matrixTransform(matrix.inverse());
        return {
            x: Math.max(0, Math.min(numericWidth, transformed.x)),
            y: Math.max(0, Math.min(numericHeight, transformed.y)),
        };
    };

    /** 확대·이동된 화면 범위가 창고 바깥으로 빠져나가지 않도록 viewport 좌표를 제한합니다. */
    const clampViewport = (nextViewport) => ({
        ...nextViewport,
        x: Math.max(0, Math.min(numericWidth - nextViewport.width, nextViewport.x)),
        y: Math.max(0, Math.min(numericHeight - nextViewport.height, nextViewport.y)),
    });

    /**
     * 마우스 휠 입력으로 캔버스를 이동하거나 확대·축소합니다.
     * 일반 휠은 세로 이동, Shift+휠은 가로 이동, Ctrl+휠은 포인터 위치를 중심으로 확대·축소합니다.
     */
    const handleCanvasWheel = (event) => {
        if (!dimensionsReady) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Ctrl 키가 없으면 확대가 아니라 현재 viewport를 평행 이동합니다.
        if (!event.ctrlKey) {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }

            const horizontalPixels = event.shiftKey ? event.deltaY : event.deltaX;
            const verticalPixels = event.shiftKey ? 0 : event.deltaY;
            setViewport(clampViewport({
                ...activeViewport,
                x: activeViewport.x + horizontalPixels / rect.width * activeViewport.width,
                y: activeViewport.y + verticalPixels / rect.height * activeViewport.height,
            }));
            return;
        }

        // 확대·축소 시 마우스가 가리키는 지도 지점이 화면에서 최대한 같은 위치에 남도록 비율을 계산합니다.
        const focus = pointFromClient(event.clientX, event.clientY);
        const zoomFactor = event.deltaY < 0 ? 0.86 : 1.16;
        const nextWidth = Math.max(
            numericWidth * 0.25,
            Math.min(numericWidth, activeViewport.width * zoomFactor),
        );
        const scale = nextWidth / activeViewport.width;
        const nextHeight = activeViewport.height * scale;

        if (Math.abs(nextWidth - activeViewport.width) < 1e-6) {
            return;
        }

        const focusRatioX = (focus.x - activeViewport.x) / activeViewport.width;
        const focusRatioY = (focus.y - activeViewport.y) / activeViewport.height;
        setViewport(clampViewport({
            x: focus.x - nextWidth * focusRatioX,
            y: focus.y - nextHeight * focusRatioY,
            width: nextWidth,
            height: nextHeight,
        }));
    };
    // 네이티브 wheel 이벤트가 항상 최신 렌더의 상태와 함수를 참조하도록 ref에 현재 핸들러를 저장합니다.
    canvasWheelHandlerRef.current = handleCanvasWheel;

    /**
     * 브라우저가 wheel 이벤트를 passive로 처리하면 preventDefault가 동작하지 않을 수 있습니다.
     * 따라서 React 합성 이벤트 대신 passive: false인 네이티브 이벤트를 직접 등록하고 해제합니다.
     */
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !dimensionsReady) {
            return undefined;
        }

        const onWheel = (event) => canvasWheelHandlerRef.current?.(event);
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [dimensionsReady]);

    /** 컴포넌트가 사라질 때 진행 중인 삭제 타이머를 제거해 언마운트 후 상태 변경을 방지합니다. */
    useEffect(() => () => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
        }
    }, []);

    /**
     * 마우스 휠 버튼을 누른 위치와 당시 viewport를 저장해 캔버스 이동을 시작합니다.
     * pointer capture를 설정하여 포인터가 SVG 밖으로 잠시 나가도 이동을 안정적으로 이어갑니다.
     */
    const beginCanvasPan = (event) => {
        if (event.button !== 1 || !dimensionsReady) {
            return;
        }

        event.preventDefault();
        setPanning({
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            viewport: { ...activeViewport },
        });
        svgRef.current?.setPointerCapture?.(event.pointerId);
    };

    /**
     * 지정한 종류의 객체를 지도에 추가합니다.
     * 입력 위치를 그리드에 맞춘 뒤 공통 생성 함수를 사용하며, 기존 지도 모드에서는 축소 크기를 적용합니다.
     */
    const addObject = (kind, point) => {
        const snappedPoint = snapLayoutPoint(
            point,
            numericWidth,
            numericHeight,
            editorGridSize,
        );
        const created = createLayoutObject(kind, snappedPoint, objects);
        const compactSize = existingMapMode ? COMPACT_OBJECT_SIZES[kind] : null;
        pushHistory();

        // 선반은 단순 도형뿐 아니라 저장 노드로 사용되므로 지도 컴파일에 필요한 rawNode 정보를 함께 구성합니다.
        if (kind === "rack") {
            const rack = {
                ...created,
                ...(compactSize ?? {}),
                rawNode: {
                    id: created.id,
                    type: "rack_storage",
                    rack_id: created.id,
                    resource_id: created.id,
                    service_only: false,
                    transit_allowed: false,
                    holding_allowed: false,
                    node_capacity: 1,
                    label: `${created.id} · 3층`,
                },
            };
            setObjects((previous) => [...previous, rack]);
            setSelected(null);
            return;
        }

        setObjects((previous) => [
            ...previous,
            compactSize ? { ...created, ...compactSize } : created,
        ]);
        setSelected(null);
    };

    /**
     * 도구를 변경하고 이전 도구에서 남은 임시 선택 상태를 초기화합니다.
     * 엣지 연결이나 삭제 도구를 선택한 경우 사용자가 다음 동작을 알 수 있도록 안내 문구도 설정합니다.
     */
    const handleToolSelect = (tool) => {
        cancelDeleteHold();
        setActiveTool(tool);
        setAisleStart(null);
        setEdgeMessage(
            tool === "AISLE"
                ? "연결할 첫 번째 노드를 선택하세요."
                : tool === "DELETE"
                    ? "삭제할 노드나 엣지를 3초 동안 누르세요."
                    : "",
        );
        setSelected(null);
    };

    /**
     * 빈 캔버스를 클릭했을 때 현재 도구에 맞는 동작을 수행합니다.
     * 선택 도구는 선택 해제, 연결·삭제 도구는 안내 표시, 객체 도구는 해당 위치에 새 객체를 추가합니다.
     */
    const handleCanvasClick = (event) => {
        if (!dimensionsReady) {
            return;
        }

        if (activeTool === "SELECT") {
            setSelected(null);
            return;
        }

        if (activeTool === "AISLE") {
            setEdgeMessage("빈 공간이 아니라 배치된 노드를 선택하세요.");
            return;
        }

        if (activeTool === "DELETE") {
            setEdgeMessage("삭제할 노드나 엣지를 3초 동안 누르세요.");
            return;
        }

        if (LAYOUT_OBJECT_DEFINITIONS[activeTool]) {
            const point = pointFromClient(event.clientX, event.clientY);
            addObject(activeTool, point);
            if (activeTool !== "route") {
                setActiveTool("SELECT");
            }
        }
    };

    /**
     * 엣지 연결 도구에서 노드를 클릭했을 때 두 단계 연결 과정을 처리합니다.
     * 첫 클릭은 시작 노드를 기억하고, 두 번째 클릭은 자기 연결·중복 연결을 검사한 뒤 새 엣지를 생성합니다.
     */
    const handleConnectionNodeClick = (event, object) => {
        event.stopPropagation();

        if (activeTool === "DELETE") {
            return;
        }

        if (activeTool !== "AISLE") {
            return;
        }

        if (!aisleStart) {
            setAisleStart({ nodeId: object.id });
            setEdgeMessage(`${object.id} 선택됨 · 연결할 두 번째 노드를 선택하세요.`);
            return;
        }

        if (aisleStart.nodeId === object.id) {
            setEdgeMessage("같은 노드는 서로 연결할 수 없습니다. 다른 노드를 선택하세요.");
            return;
        }

        const startObject = objects.find(
            (candidate) => candidate.id === aisleStart.nodeId,
        );

        if (!startObject) {
            setAisleStart(null);
            setEdgeMessage("시작 노드를 찾을 수 없습니다. 다시 선택하세요.");
            return;
        }

        const resolvedStart = startObject;
        const resolvedEnd = object;

        // 방향이 반대여도 동일한 두 노드를 잇는 엣지가 이미 있으면 중복 연결로 판단합니다.
        const duplicate = aisles.some((aisle) =>
            (aisle.startNodeId === resolvedStart.id && aisle.endNodeId === resolvedEnd.id) ||
            (aisle.startNodeId === resolvedEnd.id && aisle.endNodeId === resolvedStart.id),
        );

        if (duplicate) {
            setAisleStart(null);
            setEdgeMessage("이미 연결된 두 노드입니다. 첫 번째 노드를 다시 선택하세요.");
            return;
        }

        const nextId = nextAisleId(aisles);
        pushHistory();
        setAisles((previous) => [
            ...previous,
            createExplicitAisle(resolvedStart, resolvedEnd, nextId),
        ]);
        setAisleStart(null);
        setEdgeMessage(`${startObject.id}과(와) ${object.id}을(를) 연결했습니다.`);
    };

    /**
     * 객체 한 개를 삭제하고 해당 객체에 연결된 모든 엣지도 함께 제거합니다.
     * 선반을 삭제할 때는 같은 rack_id를 가진 보조 rack_access 노드까지 함께 정리합니다.
     */
    const removeObjectById = (objectId) => {
        const target = objects.find((object) => object.id === objectId);
        if (!target) {
            return;
        }
        const removedIds = new Set([objectId]);
        if (target.kind === "rack") {
            const rackId = target.rawNode?.rack_id ?? target.id;
            objects
                .filter((object) =>
                    isRackAccessObject(object) && object.rawNode?.rack_id === rackId,
                )
                .forEach((object) => removedIds.add(object.id));
        }

        pushHistory();
        setObjects((previous) => previous.filter((object) => !removedIds.has(object.id)));
        setAisles((previous) => previous.filter(
            (aisle) => !removedIds.has(aisle.startNodeId) &&
                !removedIds.has(aisle.endNodeId),
        ));
        setSelected(null);
        setAisleStart(null);
        setEdgeMessage(`${target.id}을(를) 삭제했습니다.`);
    };

    /** 지정한 ID의 엣지를 삭제하고 선택·연결 시작 상태를 초기화합니다. */
    const removeAisleById = (aisleId) => {
        if (!aisles.some((aisle) => aisle.id === aisleId)) {
            return;
        }
        pushHistory();
        setAisles((previous) => previous.filter((aisle) => aisle.id !== aisleId));
        setSelected(null);
        setAisleStart(null);
        setEdgeMessage(`${aisleId} 엣지를 삭제했습니다.`);
    };

    /**
     * 길게 누르기 삭제를 취소하고 타이머 및 화면 강조 상태를 정리합니다.
     * message가 전달되면 취소 이유나 다음 행동을 상태 표시줄에 안내합니다.
     */
    const cancelDeleteHold = (message = "") => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
        }
        setDeleteHold(null);
        if (message) {
            setEdgeMessage(message);
        }
    };

    /**
     * 삭제 도구에서 객체나 엣지를 왼쪽 버튼으로 누르면 3초 삭제 타이머를 시작합니다.
     * 누르는 도중 포인터를 놓으면 finishObjectDrag에서 타이머가 취소되고, 3초를 채우면 실제 삭제 함수가 실행됩니다.
     */
    const beginDeleteHold = (event, target) => {
        if (activeTool !== "DELETE" || event.button !== 0) {
            return false;
        }
        event.preventDefault();
        event.stopPropagation();
        cancelDeleteHold();
        setDeleteHold(target);
        setEdgeMessage(`${target.id} 삭제 대기 중 · 3초 동안 계속 누르세요.`);
        svgRef.current?.setPointerCapture?.(event.pointerId);
        deleteTimerRef.current = window.setTimeout(() => {
            deleteTimerRef.current = null;
            setDeleteHold(null);
            if (target.type === "object") {
                removeObjectById(target.id);
            } else {
                removeAisleById(target.id);
            }
        }, DELETE_HOLD_MS);
        return true;
    };

    /** 팔레트 항목을 누른 시작 위치와 객체 종류를 기록해 드래그 배치를 준비합니다. */
    const beginPaletteDrag = (event, kind) => {
        if (!LAYOUT_OBJECT_DEFINITIONS[kind]) {
            return;
        }

        setPaletteDragging({
            kind,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
        });
    };

    /**
     * 클릭과 드래그를 구분하기 위해 시작점에서 5px 이상 움직였는지 확인합니다.
     * 작은 손떨림은 일반 클릭으로 취급하여 도구 선택 동작이 유지됩니다.
     */
    const trackPaletteDrag = (event) => {
        if (!paletteDragging || paletteDragging.moved) {
            return;
        }

        if (Math.hypot(
            event.clientX - paletteDragging.startX,
            event.clientY - paletteDragging.startY,
        ) >= 5) {
            setPaletteDragging((current) => current ? { ...current, moved: true } : null);
        }
    };

    /**
     * 팔레트 드래그가 끝났을 때 포인터가 실제 SVG 영역 안에 있으면 해당 위치에 객체를 생성합니다.
     * route는 연속 배치가 가능하지만 다른 시설물은 한 번 배치한 뒤 선택 도구로 돌아갑니다.
     */
    const finishPaletteDrag = (event) => {
        if (!paletteDragging) {
            return;
        }

        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        const droppedOnCanvas = paletteDragging.moved && dimensionsReady && rect &&
            event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;

        if (droppedOnCanvas) {
            addObject(
                paletteDragging.kind,
                pointFromClient(event.clientX, event.clientY),
            );
            if (paletteDragging.kind !== "route") {
                setActiveTool("SELECT");
            }
        }

        setPaletteDragging(null);
    };

    /**
     * 배치된 객체의 이동을 시작합니다.
     * 설비 그룹에 속한 객체는 그룹 전체의 초기 좌표를 저장하여 구성원 모두를 같은 거리만큼 이동합니다.
     * 포인터와 객체 중심의 오프셋을 기억해 드래그 시작 순간 객체가 포인터 위치로 튀는 현상을 막습니다.
     */
    const beginObjectDrag = (event, object) => {
        if (beginDeleteHold(event, { type: "object", id: object.id })) {
            return;
        }

        if (event.button === 1) {
            return;
        }

        event.stopPropagation();

        if (event.button !== 0) {
            return;
        }

        if (activeTool === "AISLE") {
            return;
        }

        if (activeTool !== "SELECT") {
            setActiveTool("SELECT");
            setAisleStart(null);
            setEdgeMessage("");
        }

        const point = pointFromClient(event.clientX, event.clientY);
        const groupMembers = object.facilityGroupId
            ? objects.filter((candidate) => candidate.facilityGroupId === object.facilityGroupId)
            : [object];
        pushHistory();
        setSelected({ type: "object", id: object.id });
        setDragging({
            id: object.id,
            groupId: object.facilityGroupId ?? null,
            pointerId: event.pointerId,
            offsetX: point.x - object.x,
            offsetY: point.y - object.y,
            anchorX: object.x,
            anchorY: object.y,
            memberPositions: groupMembers.map((member) => ({
                id: member.id,
                x: member.x,
                y: member.y,
            })),
        });
        svgRef.current?.setPointerCapture?.(event.pointerId);
    };

    /**
     * 포인터 이동 중 캔버스 패닝 또는 객체 드래그를 갱신합니다.
     * 두 동작은 동시에 처리하지 않으며, 패닝 상태가 있으면 viewport 이동을 먼저 수행합니다.
     */
    const handlePointerMove = (event) => {
        if (panning) {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }
            const deltaX = (event.clientX - panning.startClientX) / rect.width * panning.viewport.width;
            const deltaY = (event.clientY - panning.startClientY) / rect.height * panning.viewport.height;
            setViewport(clampViewport({
                ...panning.viewport,
                x: panning.viewport.x - deltaX,
                y: panning.viewport.y - deltaY,
            }));
            return;
        }

        if (!dragging) {
            return;
        }

        const point = pointFromClient(event.clientX, event.clientY);
        const nextPoint = snapLayoutPoint(
            {
                x: point.x - dragging.offsetX,
                y: point.y - dragging.offsetY,
            },
            numericWidth,
            numericHeight,
            editorGridSize,
        );

        // 드래그 대상의 시작점 대비 이동량을 계산해 그룹 구성원 모두에게 동일하게 적용합니다.
        const deltaX = nextPoint.x - dragging.anchorX;
        const deltaY = nextPoint.y - dragging.anchorY;
        const startById = new Map(
            dragging.memberPositions.map((position) => [position.id, position]),
        );

        setObjects((previous) => previous.map((object) => {
            const start = startById.get(object.id);
            return start
                ? { ...object, x: start.x + deltaX, y: start.y + deltaY }
                : object;
        }));
    };

    /**
     * 포인터를 놓거나 취소했을 때 삭제 대기, 캔버스 패닝, 객체 드래그 중 현재 진행 중인 동작을 종료합니다.
     * 삭제 타이머가 남아 있다면 실제 삭제 대신 취소 처리하는 것이 가장 우선입니다.
     */
    const finishObjectDrag = (event) => {
        if (deleteTimerRef.current) {
            svgRef.current?.releasePointerCapture?.(event.pointerId);
            cancelDeleteHold("삭제가 취소되었습니다. 삭제하려면 3초 동안 계속 누르세요.");
            event.stopPropagation();
            return;
        }

        if (panning) {
            svgRef.current?.releasePointerCapture?.(panning.pointerId);
            setPanning(null);
            event.stopPropagation();
            return;
        }

        if (!dragging) {
            return;
        }

        svgRef.current?.releasePointerCapture?.(dragging.pointerId);
        setDragging(null);
        event.stopPropagation();
    };

    /** 가장 최근 스냅샷으로 objects와 aisles를 복원하고 해당 기록을 history에서 제거합니다. */
    const undo = () => {
        const previous = history.at(-1);

        if (!previous) {
            return;
        }

        setObjects(previous.objects);
        setAisles(previous.aisles);
        setHistory((items) => items.slice(0, -1));
        setSelected(null);
        setAisleStart(null);
    };

    /** 사용자 확인 후 모든 객체와 엣지를 지우며, 지우기 전 상태는 실행 취소할 수 있도록 기록합니다. */
    const clearLayout = () => {
        if (objects.length === 0 && aisles.length === 0) {
            return;
        }

        if (!window.confirm("배치한 시설물과 통로를 모두 지울까요?")) {
            return;
        }

        cancelDeleteHold();
        pushHistory();
        setObjects([]);
        setAisles([]);
        setSelected(null);
        setAisleStart(null);
    };

    /** 선택된 항목이 선반일 때만 0도와 90도 상태를 번갈아 적용합니다. */
    const rotateSelectedRack = () => {
        if (selected?.type !== "object") {
            return;
        }

        const object = objects.find((candidate) => candidate.id === selected.id);

        if (object?.kind !== "rack") {
            return;
        }

        pushHistory();
        setObjects((previous) => previous.map((candidate) =>
            candidate.id === selected.id
                ? { ...candidate, rotation: (Number(candidate.rotation) + 90) % 180 }
                : candidate,
        ));
    };

    /** 선택된 엣지의 통행 방향을 양방향, 정방향, 역방향 중 하나로 변경합니다. */
    const updateSelectedAisleDirection = (direction) => {
        if (selected?.type !== "aisle") {
            return;
        }

        pushHistory();
        setAisles((previous) => previous.map((aisle) =>
            aisle.id === selected.id ? { ...aisle, direction } : aisle,
        ));
    };

    /**
     * 편집기 단축키를 처리합니다.
     * Esc는 현재 도구와 선택을 초기화하고, Ctrl/Cmd+Z는 실행 취소, Delete/Backspace는 안전 삭제 모드로 전환합니다.
     * 입력창에서 문자를 편집하는 동안에는 단축키가 가로채지 않도록 제외합니다.
     */
    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            cancelDeleteHold();
            setActiveTool("SELECT");
            setAisleStart(null);
            setEdgeMessage("");
            setSelected(null);
            return;
        }

        const targetTag = event.target?.tagName?.toLowerCase();
        if (["input", "select", "textarea"].includes(targetTag) || event.target?.isContentEditable) {
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            undo();
            return;
        }

        if ((event.key === "Delete" || event.key === "Backspace") && selected) {
            event.preventDefault();
            setActiveTool("DELETE");
            setSelected(null);
            setEdgeMessage("안전을 위해 삭제할 노드나 엣지를 3초 동안 누르세요.");
        }
    };

    /** 현재 선택 정보에서 실제 객체 또는 엣지 데이터를 찾아 인스펙터와 강조 표시에 사용합니다. */
    const selectedObject = selected?.type === "object"
        ? objects.find((object) => object.id === selected.id)
        : null;
    const selectedFacilityGroupId = selectedObject?.facilityGroupId;
    const selectedAisle = selected?.type === "aisle"
        ? aisles.find((aisle) => aisle.id === selected.id)
        : null;
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const aisleStartObject = aisleStart
        ? objectById.get(aisleStart.nodeId)
        : null;
    const aisleStartPoint = getLayoutConnectionPoint(aisleStartObject);
    const nodeById = new Map(compiled.map.nodes.map((node) => [node.id, node]));
    /**
     * 컴파일 과정에서 양방향 엣지는 source/target이 반대인 두 개의 방향 엣지로 만들어질 수 있습니다.
     * 화면에서는 같은 두 노드 사이의 선을 한 번만 그리기 위해 정렬된 키로 중복을 제거합니다.
     */
    const visibleEdges = [];
    const visibleEdgeKeys = new Set();
    compiled.map.edges.forEach((edge) => {
        const key = [edge.source, edge.target].sort().join("::");

        if (!visibleEdgeKeys.has(key)) {
            visibleEdgeKeys.add(key);
            visibleEdges.push(edge);
        }
    });
    /**
     * 화면에 직접 그릴 객체만 선별합니다.
     * rack_access는 선반 내부 연결 정보이므로 숨기고, 기존 지도에서 그래프 표시를 끈 경우 내부 접근 노드도 숨깁니다.
     */
    const renderObjects = objects.filter((object) =>
        !isRackAccessObject(object) &&
        !(existingMapMode && !showGraph && isInternalAccessObject(object)),
    );
    const orderedRenderObjects = existingMapMode
        ? [...renderObjects].sort(
              (left, right) => objectRenderPriority(left) - objectRenderPriority(right),
          )
        : renderObjects;
    /**
     * 기존 지도에서 모든 ID를 표시하면 화면이 복잡해지므로 식별에 중요한 노드와 엣지만 선별합니다.
     * 각 행의 가장 왼쪽 노드, 각 열의 가장 위쪽 노드, 설비 연결 엣지, 현재 선택 항목은 항상 중요 항목으로 포함합니다.
     */
    const importantNodeIds = new Set();
    const importantAisleIds = new Set();
    const physicalRouteObjects = renderObjects.filter((object) =>
        object.kind === "route" &&
        (!object.rawNode || object.rawNode.type === "route"),
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
    leftmostRouteByRow.forEach((object) => importantNodeIds.add(object.id));
    topmostRouteByColumn.forEach((object) => importantNodeIds.add(object.id));

    aisles.forEach((aisle) => {
        const startObject = objectById.get(aisle.startNodeId);
        const endObject = objectById.get(aisle.endNodeId);
        const startIsFacility = FACILITY_GROUP_KINDS.has(startObject?.kind);
        const endIsFacility = FACILITY_GROUP_KINDS.has(endObject?.kind);

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
    /**
     * 같은 facilityGroupId를 가진 객체를 반복 설비 그룹으로 묶고, 화면 강조용 전체 경계도 계산합니다.
     * 그룹 ID가 없는 일반 객체는 이 설정 목록에 포함되지 않습니다.
     */
    const facilityGroups = [...new Set(
        objects.map((object) => object.facilityGroupId).filter(Boolean),
    )].map((groupId) => {
        const members = objects.filter((object) => object.facilityGroupId === groupId);
        return {
            id: groupId,
            kind: members[0]?.kind,
            members,
            bounds: facilityGroupBounds(members),
        };
    }).filter((group) => group.bounds);
    const facilityGroupOrder = { inbound: 0, outbound: 1, charging: 2 };
    const configurableFacilityGroups = facilityGroups
        .filter((group) => FACILITY_GROUP_KINDS.has(group.kind))
        .sort((left, right) =>
            (facilityGroupOrder[left.kind] ?? 99) - (facilityGroupOrder[right.kind] ?? 99),
        );
    /** 정렬된 그룹 순서를 1부터 시작하는 화면 표시 번호로 변환합니다. */
    const facilityDisplayIndexById = new Map();
    configurableFacilityGroups.forEach((group) => {
        orderedFacilityMembers(
            group.members,
            group.members[0]?.facilityOrientation,
        ).forEach((member, index) => {
            facilityDisplayIndexById.set(member.id, index + 1);
        });
    });
    /**
     * 지도 저장 전 단계별 검증에 사용할 필수 시설과 오류 종류를 계산합니다.
     * 검증 메시지를 시설 배치, 경로 연결, 경계·겹침 문제로 나누어 사용자가 해결 순서를 쉽게 파악하게 합니다.
     */
    const requiredFacilityKinds = [
        ["rack", "3층 선반"],
        ["inbound", "입고 설비"],
        ["outbound", "출고 설비"],
        ["charging", "충전 설비"],
    ];
    const missingFacilityLabels = requiredFacilityKinds
        .filter(([kind]) => !objects.some((object) => object.kind === kind))
        .map(([, label]) => label);
    const facilitiesReady = dimensionsReady && missingFacilityLabels.length === 0;
    const routeNodeReady = objects.some((object) =>
        object.kind === "route" && !isRackAccessObject(object),
    );
    const connectionErrors = compiled.validation.errors.filter((error) =>
        error.includes("엣지") || error.includes("연결") || error.includes("분리된 노드"),
    );
    const placementErrors = compiled.validation.errors.filter((error) =>
        error.includes("경계") || error.includes("겹칩니다"),
    );
    const routeReady = routeNodeReady && aisles.length > 0 && connectionErrors.length === 0;
    const placementReady = facilitiesReady && routeReady && placementErrors.length === 0;
    // 화면 하단 진행 단계는 앞 단계부터 해결하도록 필수 시설 → 경로망 → 최종 배치 검증 순서로 구성합니다.
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
                    : connectionErrors[0] ?? "모든 시설이 하나의 경로망으로 연결되었습니다.",
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
    const activeValidationStep = validationSteps.find((step) => !step.complete);

    /**
     * 반복 설비 그룹의 개수를 1~30 범위에서 변경합니다.
     *
     * 개수를 줄일 때는 뒤쪽 구성원과 연결 엣지를 함께 삭제합니다.
     * 개수를 늘릴 때는 첫 구성원을 기준점으로 삼아 현재 방향과 간격에 맞춰 새 객체를 생성하며,
     * 기존 지도라면 원본 데이터 규칙에 맞는 rawNode ID도 새로 발급합니다.
     */
    const updateFacilityGroupCount = (groupId, requestedCount) => {
        const group = facilityGroups.find((candidate) => candidate.id === groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        if (!group || members.length === 0) {
            return;
        }

        const nextCount = Math.max(1, Math.min(30, Number(requestedCount) || 1));
        const currentCount = members.length;
        if (nextCount === currentCount) {
            return;
        }

        pushHistory();
        // 축소 시 남길 앞쪽 구성원은 유지하고, 초과 구성원 및 그 구성원이 연결된 엣지만 제거합니다.
        if (nextCount < currentCount) {
            const removedIds = new Set(
                members.slice(nextCount).map((member) => member.id),
            );
            setObjects((previous) => previous.filter((object) => !removedIds.has(object.id)));
            setAisles((previous) => previous.filter(
                (aisle) => !removedIds.has(aisle.startNodeId) &&
                    !removedIds.has(aisle.endNodeId),
            ));
            if (selected?.type === "object" && removedIds.has(selected.id)) {
                setSelected({ type: "object", id: members[0].id });
            }
            return;
        }

        // 확대 시 첫 번째 구성원을 고정 기준점으로 사용하여 기존 배열 방향을 그대로 연장합니다.
        const anchor = members[0];
        const orientation = anchor.facilityOrientation ?? "VERTICAL";
        const step = Number(anchor.facilityStep) ||
            (existingMapMode ? 0.5 : Math.max(anchor.width, anchor.height) + 0.3);
        const additions = [];
        const workingObjects = [...objects];

        for (let index = currentCount; index < nextCount; index += 1) {
            const point = {
                x: anchor.x + (orientation === "HORIZONTAL" ? step * index : 0),
                y: anchor.y + (orientation === "VERTICAL" ? step * index : 0),
            };
            const created = createLayoutObject(anchor.kind, point, workingObjects);
            const rawIdentity = anchor.rawNode
                ? nextRawFacilityIdentity(anchor.kind, workingObjects, anchor.rawNode)
                : null;
            const nextMember = {
                ...created,
                ...(existingMapMode ? COMPACT_OBJECT_SIZES[anchor.kind] : {}),
                id: rawIdentity?.id ?? created.id,
                facilityGroupId: groupId,
                facilityIndex: index,
                facilityOrientation: orientation,
                facilityStep: step,
                facilityEndpoint: Boolean(anchor.facilityEndpoint),
                ...(anchor.rawNode ? {
                    rawNode: {
                        ...anchor.rawNode,
                        id: rawIdentity.id,
                        label: rawIdentity.label,
                        resource_id: rawIdentity.id,
                        // 설비 코드 필드는 접근 자리로 표현된 지도에만 붙인다.
                        // inbound/outbound 로 표현된 지도에 이 필드를 넣으면
                        // 원래 있던 노드와 계약이 달라진다.
                        ...(anchor.rawNode.type === "inbound_handoff_access"
                            ? { handoff_id: rawIdentity.id }
                            : anchor.rawNode.type === "outbound_station_access"
                                ? { station_id: rawIdentity.id }
                                : {}),
                    },
                } : {}),
            };
            additions.push(nextMember);
            workingObjects.push(nextMember);
        }

        setObjects((previous) => [...previous, ...additions]);
    };

    /**
     * 반복 설비 그룹을 가로 또는 세로 배열로 전환합니다.
     * 첫 구성원의 위치는 고정하고, 나머지 구성원만 인덱스와 간격에 따라 새 좌표로 재배치합니다.
     * 방향 변경 후 겹침이 생기지 않도록 현재 간격과 새 방향의 최소 간격 중 큰 값을 사용합니다.
     */
    const updateFacilityGroupOrientation = (groupId, orientation) => {
        const group = facilityGroups.find((candidate) => candidate.id === groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        const currentOrientation = members[0]?.facilityOrientation ?? "VERTICAL";
        if (!group || members.length === 0 || orientation === currentOrientation) {
            return;
        }

        const anchor = members[0];
        const step = Math.max(
            Number(anchor.facilityStep) ||
                (existingMapMode ? 0.5 : Math.max(anchor.width, anchor.height) + 0.3),
            minimumFacilityStep(members, orientation, existingMapMode),
        );
        pushHistory();
        setObjects((previous) => previous.map((object) => {
            if (object.facilityGroupId !== groupId) {
                return object;
            }
            const index = Number(object.facilityIndex ?? 0);
            return {
                ...object,
                x: anchor.x + (orientation === "HORIZONTAL" ? step * index : 0),
                y: anchor.y + (orientation === "VERTICAL" ? step * index : 0),
                facilityOrientation: orientation,
                facilityStep: step,
            };
        }));
    };

    /**
     * 반복 설비 그룹 구성원 사이의 중심 간격을 변경합니다.
     * 입력값은 객체가 겹치지 않는 최소값 이상, 최대 10m 이하로 제한한 뒤 첫 구성원을 기준으로 다시 배치합니다.
     */
    const updateFacilityGroupStep = (groupId, requestedStep) => {
        const group = facilityGroups.find((candidate) => candidate.id === groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        if (!group || members.length === 0) {
            return;
        }

        const orientation = members[0].facilityOrientation ?? "VERTICAL";
        const numericStep = Number(requestedStep);
        if (!Number.isFinite(numericStep)) {
            return;
        }

        const nextStep = Math.max(
            minimumFacilityStep(members, orientation, existingMapMode),
            Math.min(10, numericStep),
        );
        const anchor = members[0];
        pushHistory();
        setObjects((previous) => previous.map((object) => {
            if (object.facilityGroupId !== groupId) {
                return object;
            }
            const index = facilityDisplayIndexById.get(object.id) - 1;
            return {
                ...object,
                x: anchor.x + (orientation === "HORIZONTAL" ? nextStep * index : 0),
                y: anchor.y + (orientation === "VERTICAL" ? nextStep * index : 0),
                facilityIndex: index,
                facilityStep: nextStep,
            };
        }));
    };

    /**
     * 편집기 화면 구성
     * - 상단: 공통 편집 도구와 그래프 표시 옵션
     * - 중앙: SVG 캔버스와 우측 도구/설비 설정 패널
     * - 하단: 지도 완성 단계 및 상세 오류 목록
     */
    return (
        <div
            className={`layout-editor ${paletteDragging?.moved ? "palette-dragging" : ""}`}
            onKeyDown={handleKeyDown}
            onPointerMove={trackPaletteDrag}
            onPointerUp={finishPaletteDrag}
            onPointerCancel={() => setPaletteDragging(null)}
            tabIndex={0}
        >
            {/* 선택, 실행 취소, 안전 삭제, 전체 초기화, 화면 맞춤을 제공하는 상단 도구 모음입니다. */}
            <div className="layout-editor-toolbar">
                <div className="layout-editor-toolset">
                    <button
                        type="button"
                        className={activeTool === "SELECT" ? "active" : ""}
                        onClick={() => handleToolSelect("SELECT")}
                    >
                        <span>↖</span>
                        선택·이동
                    </button>
                    <button type="button" disabled={history.length === 0} onClick={undo}>
                        <span>↶</span>
                        실행 취소
                    </button>
                    <button
                        type="button"
                        className={activeTool === "DELETE" ? "active" : ""}
                        onClick={() => handleToolSelect(
                            activeTool === "DELETE" ? "SELECT" : "DELETE",
                        )}
                    >
                        <span>×</span>
                        3초 눌러 삭제
                    </button>
                    <button type="button" onClick={clearLayout}>
                        전체 지우기
                    </button>
                    <button type="button" disabled={!viewport} onClick={() => setViewport(null)}>
                        화면 맞춤
                    </button>
                </div>

                <label
                    className="layout-editor-layer-toggle"
                    title="외곽 기준 노드와 입고·출고·충전 설비 연결 엣지 등 지도 식별에 필요한 주요 ID만 표시합니다. 선택한 항목의 ID는 항상 포함됩니다."
                >
                    <input
                        type="checkbox"
                        checked={showGraph}
                        onChange={(event) => setShowGraph(event.target.checked)}
                    />
                    {existingMapMode ? "주요 노드·엣지 ID 표시" : "생성 노드·엣지 표시"}
                </label>
            </div>

            {/* 실제 지도 캔버스와 우측 팔레트를 나란히 배치하는 작업 영역입니다. */}
            <div className="layout-editor-workspace">
                {/* 창고 크기가 유효할 때만 SVG 편집 캔버스를 열고, 아니면 입력 안내를 표시합니다. */}
                <section className="layout-editor-canvas-panel">
                    {!dimensionsReady ? (
                        <div className="layout-editor-empty">
                            창고 가로·세로 크기를 입력하면 설계 영역이 열립니다.
                        </div>
                    ) : (
                        <div
                            className={`layout-editor-canvas ${activeTool === "AISLE" ? "drawing-aisle" : ""} ${activeTool === "DELETE" ? "deleting" : ""} ${panning ? "panning" : ""}`}
                        >
                            {/*
                              SVG의 viewBox가 현재 viewport 역할을 합니다.
                              포인터 이벤트는 이 요소에서 받아 객체 이동, 캔버스 이동, 배치, 연결을 처리합니다.
                            */}
                            <svg
                                ref={svgRef}
                                viewBox={`${activeViewport.x} ${activeViewport.y} ${activeViewport.width} ${activeViewport.height}`}
                                preserveAspectRatio="xMidYMid meet"
                                onClick={handleCanvasClick}
                                onPointerDown={beginCanvasPan}
                                onPointerMove={handlePointerMove}
                                onPointerUp={finishObjectDrag}
                                onPointerCancel={finishObjectDrag}
                                role="application"
                                aria-label="창고 지도 설계 캔버스"
                            >
                                {/* 객체를 정확한 간격으로 배치할 수 있도록 작은 격자와 큰 격자 패턴을 정의합니다. */}
                                <defs>
                                    <pattern
                                        id="warehouse-editor-minor-grid"
                                        width={editorGridSize}
                                        height={editorGridSize}
                                        patternUnits="userSpaceOnUse"
                                    >
                                        <path
                                            d={`M ${editorGridSize} 0 L 0 0 0 ${editorGridSize}`}
                                            fill="none"
                                            stroke={existingMapMode ? "#f5f7fa" : "#e2e8f0"}
                                            strokeWidth={existingMapMode ? "0.004" : "0.05"}
                                        />
                                    </pattern>
                                    <pattern
                                        id="warehouse-editor-major-grid"
                                        width={visualGridSize}
                                        height={visualGridSize}
                                        patternUnits="userSpaceOnUse"
                                    >
                                        <path
                                            d={`M ${visualGridSize} 0 L 0 0 0 ${visualGridSize}`}
                                            fill="none"
                                            stroke={existingMapMode ? "#e5eaf0" : "#e2e8f0"}
                                            strokeWidth={existingMapMode ? "0.012" : "0.05"}
                                        />
                                    </pattern>
                                </defs>

                                {/* 창고 전체 경계와 기본 작은 격자를 그리는 배경 사각형입니다. */}
                                <rect
                                    x="0"
                                    y="0"
                                    width={numericWidth}
                                    height={numericHeight}
                                    fill="url(#warehouse-editor-minor-grid)"
                                    stroke="#0f172a"
                                    strokeWidth="0.15"
                                />
                                {existingMapMode && (
                                    <rect
                                        x="0"
                                        y="0"
                                        width={numericWidth}
                                        height={numericHeight}
                                        fill="url(#warehouse-editor-major-grid)"
                                        pointerEvents="none"
                                    />
                                )}

                                {/* 같은 그룹으로 묶인 반복 설비의 전체 범위와 개수를 배경 테두리로 표시합니다. */}
                                <g className="layout-editor-facility-groups" aria-label="반복 설비 그룹">
                                    {facilityGroups.map((group) => {
                                        const padding = existingMapMode ? 0.12 : 0.4;
                                        const selectedGroup = group.id === selectedFacilityGroupId;
                                        return (
                                            <g key={group.id} className={selectedGroup ? "selected" : ""}>
                                                <rect
                                                    x={group.bounds.left - padding}
                                                    y={group.bounds.top - padding}
                                                    width={group.bounds.right - group.bounds.left + padding * 2}
                                                    height={group.bounds.bottom - group.bounds.top + padding * 2}
                                                    rx={existingMapMode ? 0.08 : 0.25}
                                                />
                                                <text
                                                    x={(group.bounds.left + group.bounds.right) / 2}
                                                    y={group.bounds.top - padding - (existingMapMode ? 0.08 : 0.22)}
                                                >
                                                    {facilityGroupLabel(group.kind)} · {group.members.length}개
                                                </text>
                                            </g>
                                        );
                                    })}
                                </g>

                                {/*
                                  사용자가 직접 만든 엣지를 그립니다.
                                  첫 번째 투명한 굵은 선은 클릭 영역을 넓히고, 두 번째 선은 실제 시각 스타일을 담당합니다.
                                */}
                                <g className={`layout-editor-raw-aisles ${existingMapMode ? "compact" : ""}`}>
                                    {aisles.map((aisle) => {
                                        const startObject = objectById.get(aisle.startNodeId);
                                        const endObject = objectById.get(aisle.endNodeId);
                                        if (existingMapMode && !showGraph &&
                                            (isInternalAccessObject(startObject) || isInternalAccessObject(endObject))) {
                                            return null;
                                        }
                                        const startPoint = getLayoutConnectionPoint(
                                            startObject,
                                        );
                                        const endPoint = getLayoutConnectionPoint(
                                            endObject,
                                        );

                                        if (!startPoint || !endPoint) {
                                            return null;
                                        }

                                        const selectAisle = (event) => {
                                            event.stopPropagation();
                                            if (activeTool === "DELETE") {
                                                return;
                                            }
                                            setSelected({ type: "aisle", id: aisle.id });
                                            setActiveTool("SELECT");
                                            setAisleStart(null);
                                            setEdgeMessage("");
                                        };
                                        const deleting = deleteHold?.type === "aisle" &&
                                            deleteHold.id === aisle.id;
                                        const className = `${aisleVisualClass(aisle)} ${selectedAisle?.id === aisle.id ? "selected" : ""} ${deleting ? "delete-pending" : ""}`;
                                        const beginAisleDelete = (event) => beginDeleteHold(
                                            event,
                                            { type: "aisle", id: aisle.id },
                                        );

                                        return (
                                            <g key={aisle.id}>
                                                <line
                                                    x1={startPoint.x}
                                                    y1={startPoint.y}
                                                    x2={endPoint.x}
                                                    y2={endPoint.y}
                                                    className="aisle-hit-area"
                                                    onPointerDown={beginAisleDelete}
                                                    onClick={selectAisle}
                                                />
                                                <line
                                                    x1={startPoint.x}
                                                    y1={startPoint.y}
                                                    x2={endPoint.x}
                                                    y2={endPoint.y}
                                                    className={className}
                                                    onPointerDown={beginAisleDelete}
                                                    onClick={selectAisle}
                                                >
                                                    <title>
                                                        {aisle.id} / {aisle.startNodeId} → {aisle.endNodeId} / {aisle.direction}
                                                    </title>
                                                </line>
                                                {existingMapMode && showGraph && importantAisleIds.has(aisle.id) && (
                                                    <text
                                                        className="layout-editor-edge-id"
                                                        x={(startPoint.x + endPoint.x) / 2}
                                                        y={(startPoint.y + endPoint.y) / 2}
                                                    >
                                                        {aisle.id}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </g>

                                {/* 신규 지도 모드에서는 컴파일 과정에서 생성된 보조 경로망도 필요할 때 함께 표시합니다. */}
                                {!existingMapMode && showGraph && (
                                    <g className="layout-editor-generated-graph">
                                        {visibleEdges.map((edge) => {
                                            const source = nodeById.get(edge.source);
                                            const target = nodeById.get(edge.target);

                                            if (!source || !target || source.type === "rack_storage" || target.type === "rack_storage") {
                                                return null;
                                            }

                                            return (
                                                <line
                                                    key={`${edge.source}-${edge.target}`}
                                                    x1={source.x}
                                                    y1={source.y}
                                                    x2={target.x}
                                                    y2={target.y}
                                                    className={edge.service_only ? "service-edge" : "route-edge"}
                                                />
                                            );
                                        })}
                                        {compiled.map.nodes
                                            .filter((node) => node.type === "route")
                                            .map((node) => (
                                                <circle key={node.id} cx={node.x} cy={node.y} r="0.18">
                                                    <title>{node.id}</title>
                                                </circle>
                                            ))}
                                    </g>
                                )}

                                {/*
                                  렌더링 대상 객체를 종류별 SVG 도형으로 표현합니다.
                                  경로 노드는 원, 충전소는 삼각형, 나머지 시설은 사각형을 기본으로 사용합니다.
                                */}
                                <g className="layout-editor-objects">
                                    {orderedRenderObjects.map((object) => {
                                        if (object.kind === "route") {
                                            const showRouteLabel = existingMapMode
                                                ? showGraph && importantNodeIds.has(object.id)
                                                : !object.rawNode || showGraph;
                                            const deleting = deleteHold?.type === "object" &&
                                                deleteHold.id === object.id;
                                            return (
                                                <g
                                                    key={object.id}
                                                    data-node-id={object.id}
                                                    className={`layout-editor-object route-object raw-${object.rawNode?.type ?? "new"} ${existingMapMode ? "compact-object" : ""} ${selectedObject?.id === object.id ? "selected" : ""} ${activeTool === "AISLE" ? "edge-selectable" : ""} ${aisleStart?.nodeId === object.id ? "edge-start" : ""} ${deleting ? "delete-pending" : ""}`}
                                                    onPointerDown={(event) => beginObjectDrag(event, object)}
                                                    onClick={(event) => handleConnectionNodeClick(event, object)}
                                                >
                                                    {existingMapMode && (
                                                        <circle className="node-hit-target" cx={object.x} cy={object.y} r="0.12" />
                                                    )}
                                                    <circle cx={object.x} cy={object.y} r={existingMapMode || object.rawNode ? "0.07" : "0.36"} />
                                                    {showRouteLabel && (
                                                        <text
                                                            className={existingMapMode ? "compact-node-id" : ""}
                                                            x={object.x}
                                                            y={object.y - (existingMapMode ? 0.16 : 0.55)}
                                                        >
                                                            {object.id}
                                                        </text>
                                                    )}
                                                    <title>{object.id} / {object.rawNode?.type ?? "route"}</title>
                                                </g>
                                            );
                                        }

                                        const dimensions = objectDimensions(object);
                                        const connectionPoint = getLayoutConnectionPoint(object);
                                        const rawType = object.rawNode?.type;
                                        const rawAccess = rawType?.includes("access") && !object.facilityEndpoint;
                                        const rawLogical = rawType === "inbound" || rawType === "outbound";
                                        const chargingStation = object.kind === "charging";
                                        const rawLabel = object.rawNode?.label ?? object.id.replace(/^[IO]_/, "");
                                        const facilityTag = object.facilityGroupId
                                            ? facilityDisplayIndexById.get(object.id) ?? Number(object.facilityIndex ?? 0) + 1
                                            : rawLabel;
                                        const showPrimaryLabel = object.kind !== "rack" ||
                                            !existingMapMode || showGraph;
                                        const deleting = deleteHold?.type === "object" &&
                                            deleteHold.id === object.id;
                                        return (
                                            <g
                                                key={object.id}
                                                data-node-id={object.id}
                                                className={`layout-editor-object kind-${object.kind} raw-${rawType ?? "new"} ${existingMapMode ? "compact-object" : ""} ${selectedObject?.id === object.id || (object.facilityGroupId && object.facilityGroupId === selectedFacilityGroupId) ? "selected" : ""} ${activeTool === "AISLE" ? "edge-selectable" : ""} ${aisleStart?.nodeId === object.id ? "edge-start" : ""} ${deleting ? "delete-pending" : ""}`}
                                                onPointerDown={(event) => beginObjectDrag(event, object)}
                                                onClick={(event) => handleConnectionNodeClick(event, object)}
                                            >
                                                {existingMapMode && !rawLogical && object.kind !== "rack" && (
                                                    <circle className="node-hit-target" cx={object.x} cy={object.y} r="0.12" />
                                                )}
                                                {rawAccess ? (
                                                    <circle cx={object.x} cy={object.y} r={existingMapMode ? "0.075" : "0.11"} />
                                                ) : chargingStation ? (
                                                    <>
                                                        <polygon points={`${object.x},${object.y - 0.2} ${object.x - 0.18},${object.y + 0.16} ${object.x + 0.18},${object.y + 0.16}`} />
                                                        <text className="charging-symbol" x={object.x} y={object.y + 0.08}>{facilityTag}</text>
                                                    </>
                                                ) : (
                                                    <rect
                                                        x={object.x - dimensions.width / 2}
                                                        y={object.y - dimensions.height / 2}
                                                        width={dimensions.width}
                                                        height={dimensions.height}
                                                        rx={object.kind === "rack" ? 0.04 : 0.08}
                                                    />
                                                )}
                                                {object.kind === "rack" && (
                                                    <>
                                                        <line
                                                            x1={object.x - dimensions.width / 2}
                                                            y1={object.y - dimensions.height / 6}
                                                            x2={object.x + dimensions.width / 2}
                                                            y2={object.y - dimensions.height / 6}
                                                        />
                                                        <line
                                                            x1={object.x - dimensions.width / 2}
                                                            y1={object.y + dimensions.height / 6}
                                                            x2={object.x + dimensions.width / 2}
                                                            y2={object.y + dimensions.height / 6}
                                                        />
                                                        <circle
                                                            className="rack-center-node"
                                                            cx={object.x}
                                                            cy={object.y}
                                                            r={existingMapMode ? "0.045" : "0.16"}
                                                        >
                                                            <title>{object.id} 연결 노드</title>
                                                        </circle>
                                                    </>
                                                )}
                                                {!rawAccess && !chargingStation && showPrimaryLabel && (
                                                    <text
                                                        className={object.rawNode && existingMapMode ? "raw-object-label" : ""}
                                                        x={object.x}
                                                        y={object.facilityGroupId ? object.y : object.y + (rawLogical ? 0.03 : 0.15)}
                                                    >
                                                        {object.facilityGroupId ? facilityTag : object.id}
                                                    </text>
                                                )}
                                                {existingMapMode && showGraph && rawAccess && importantNodeIds.has(object.id) && (
                                                    <text className="compact-node-id" x={object.x} y={object.y - 0.16}>
                                                        {object.id}
                                                    </text>
                                                )}
                                                {!object.rawNode && !chargingStation && (
                                                    <>
                                                        <line
                                                            className="layout-editor-connection-stem"
                                                            x1={object.x}
                                                            y1={object.y}
                                                            x2={connectionPoint.x}
                                                            y2={connectionPoint.y}
                                                        />
                                                        <circle
                                                            className="layout-editor-connection-handle"
                                                            cx={connectionPoint.x}
                                                            cy={connectionPoint.y}
                                                            r={existingMapMode ? "0.12" : "0.34"}
                                                        >
                                                            <title>{object.id} 연결 노드</title>
                                                        </circle>
                                                    </>
                                                )}
                                                <title>{object.id} / {rawType ?? object.kind}</title>
                                            </g>
                                        );
                                    })}
                                </g>

                                {/* 엣지의 시작 노드를 선택한 동안 두 번째 노드 선택을 유도하는 강조 표시입니다. */}
                                {aisleStartPoint && (
                                    <g className={`layout-editor-aisle-start ${existingMapMode ? "compact" : ""}`}>
                                        <circle
                                            cx={aisleStartPoint.x}
                                            cy={aisleStartPoint.y}
                                            r={existingMapMode ? "0.13" : "0.5"}
                                        />
                                        {!existingMapMode && (
                                            <text x={aisleStartPoint.x} y={aisleStartPoint.y - 0.7}>두 번째 노드를 선택하세요</text>
                                        )}
                                    </g>
                                )}
                            </svg>
                        </div>
                    )}

                    {/* 지도 크기, 이동 단위, 생성 통계, 조작법, 현재 도구 안내를 실시간으로 보여 줍니다. */}
                    <div className="layout-editor-statusbar">
                        <span>{numericWidth || 0}m × {numericHeight || 0}m</span>
                        <span>이동 단위 {editorGridSize}m</span>
                        <span>선반 {compiled.stats.rackCount}개 / 보관 칸 {compiled.stats.storageSlotCount}개</span>
                        <span>노드 {compiled.map.nodes.length}개 / 연결 {compiled.stats.connectionCount}개 / 방향 엣지 {compiled.stats.edgeCount}개</span>
                        <span className="layout-editor-navigation-hint">
                            휠 이동 · Shift+휠 가로 이동 · Ctrl+휠 확대·축소 · 휠 버튼 드래그 이동
                        </span>
                        {activeTool === "AISLE" && (
                            <span className="layout-editor-tool-message">{edgeMessage || "연결할 첫 번째 노드를 선택하세요."}</span>
                        )}
                        {activeTool === "route" && (
                            <span className="layout-editor-tool-message">경로 노드 연속 배치 중 · Esc 키로 종료</span>
                        )}
                    </div>
                </section>

                {/* 객체 도구, 반복 설비 설정, 선택 항목 속성을 제공하는 우측 패널입니다. */}
                <aside className="layout-editor-palette">
                    {/* PALETTE_GROUPS와 TOOL_META를 이용해 도구 버튼을 데이터 기반으로 생성합니다. */}
                    {PALETTE_GROUPS.map((group) => (
                        <section key={group.title}>
                            <h4>{group.title}</h4>
                            <div className="layout-editor-palette-grid">
                                {group.tools.map((tool) => (
                                    <button
                                        key={tool}
                                        type="button"
                                        className={activeTool === tool ? "active" : ""}
                                        onPointerDown={(event) => beginPaletteDrag(event, tool)}
                                        onClick={() => handleToolSelect(tool)}
                                        title={TOOL_META[tool].description}
                                    >
                                        <span>{TOOL_META[tool].symbol}</span>
                                        <strong>{TOOL_META[tool].label}</strong>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}

                    {/* 반복 설비 그룹별 개수, 간격, 가로·세로 방향을 한 번에 조정합니다. */}
                    <section className="layout-editor-facility-settings">
                        <h4>설비 설정</h4>
                        {configurableFacilityGroups.length === 0 ? (
                            <p>입고지·출고지·충전소를 배치하면 개수와 방향을 설정할 수 있습니다.</p>
                        ) : configurableFacilityGroups.map((group) => {
                            const members = orderedFacilityMembers(
                                group.members,
                                group.members[0]?.facilityOrientation,
                            );
                            const orientation = members[0]?.facilityOrientation ?? "VERTICAL";
                            const label = facilityGroupLabel(group.kind);
                            const step = Number(members[0]?.facilityStep) ||
                                minimumFacilityStep(members, orientation, existingMapMode);
                            const minimumStep = minimumFacilityStep(
                                members,
                                orientation,
                                existingMapMode,
                            );
                            return (
                                <div className={`layout-editor-facility-card kind-${group.kind}`} key={group.id}>
                                    <div className="layout-editor-facility-card-title">
                                        <strong>{label}</strong>
                                        <span>{members.length}개</span>
                                    </div>
                                    <div className="layout-editor-facility-card-controls">
                                        <label>
                                            <span>개수</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max="30"
                                                aria-label={`${label} 개수`}
                                                value={members.length}
                                                onChange={(event) => updateFacilityGroupCount(group.id, event.target.value)}
                                            />
                                        </label>
                                        <label>
                                            <span>간격(m)</span>
                                            <input
                                                type="number"
                                                min={minimumStep}
                                                max="10"
                                                step="0.01"
                                                aria-label={`${label} 간격`}
                                                value={Number(step.toFixed(2))}
                                                onChange={(event) => updateFacilityGroupStep(group.id, event.target.value)}
                                            />
                                        </label>
                                        <div className="layout-editor-orientation-buttons">
                                            <button
                                                type="button"
                                                aria-label={`${label} 가로 배치`}
                                                className={orientation === "HORIZONTAL" ? "active" : ""}
                                                onClick={() => updateFacilityGroupOrientation(group.id, "HORIZONTAL")}
                                            >
                                                가로
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`${label} 세로 배치`}
                                                className={orientation === "VERTICAL" ? "active" : ""}
                                                onClick={() => updateFacilityGroupOrientation(group.id, "VERTICAL")}
                                            >
                                                세로
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </section>

                    {/* 선택한 객체의 위치·종류 또는 선택한 엣지의 통행 방향을 확인하고 수정하는 인스펙터입니다. */}
                    {(selectedObject || selectedAisle) && (
                        <section className="layout-editor-inspector">
                            <h4>선택 항목</h4>
                            {selectedObject && (
                                <>
                                    <strong>{selectedObject.id}</strong>
                                    <span>{selectedObject.rawNode?.type ?? TOOL_META[selectedObject.kind]?.label}</span>
                                    <span>X {selectedObject.x}m · Y {selectedObject.y}m</span>
                                    {selectedObject.kind === "rack" && (
                                        <button type="button" onClick={rotateSelectedRack}>
                                            선반 90° 회전
                                        </button>
                                    )}
                                </>
                            )}
                            {selectedAisle && (
                                <>
                                    <strong>{selectedAisle.id}</strong>
                                    <span>{selectedAisle.startNodeId} ↔ {selectedAisle.endNodeId}</span>
                                    <label>
                                        통행 방향
                                        <select
                                            value={selectedAisle.direction}
                                            onChange={(event) => updateSelectedAisleDirection(event.target.value)}
                                        >
                                            <option value="BOTH">양방향</option>
                                            <option value="FORWARD">시작 → 끝</option>
                                            <option value="REVERSE">끝 → 시작</option>
                                        </select>
                                    </label>
                                </>
                            )}
                        </section>
                    )}
                </aside>
            </div>

            {/*
              컴파일 결과의 검증 상태를 단계별로 표시합니다.
              가장 먼저 완료되지 않은 단계를 다음 작업으로 안내하고, 실제 오류와 경고는 아래 목록에 모두 보여 줍니다.
            */}
            <div className={`layout-editor-validation ${compiled.validation.isValid ? "valid" : "invalid"}`}>
                <div className="layout-editor-validation-summary">
                    <span className="layout-editor-validation-badge">
                        {compiled.validation.isValid ? "완료" : "진행 중"}
                    </span>
                    <div>
                        <strong>
                            {compiled.validation.isValid
                                ? "지도 준비 완료"
                                : `다음 작업: ${activeValidationStep?.label ?? "수정 항목 확인"}`}
                        </strong>
                        <span>
                            {compiled.validation.isValid
                                ? "이제 저장 버튼을 눌러 변경한 지도를 반영할 수 있습니다."
                                : activeValidationStep?.description ?? `${compiled.validation.errors.length}개의 수정 항목이 있습니다.`}
                        </span>
                    </div>
                </div>
                <ol className="layout-editor-validation-steps" aria-label="지도 완성 단계">
                    {validationSteps.map((step, index) => {
                        const current = step.id === activeValidationStep?.id;
                        return (
                            <li
                                className={`${step.complete ? "complete" : "pending"} ${current ? "current" : ""}`}
                                key={step.id}
                            >
                                <span>{step.complete ? "✓" : index + 1}</span>
                                <strong>{step.label}</strong>
                            </li>
                        );
                    })}
                </ol>
                {(compiled.validation.errors.length > 0 || compiled.validation.warnings.length > 0) && (
                    <ul className="layout-editor-validation-issues">
                        {compiled.validation.errors.map((error) => (
                            <li key={error}>
                                <strong>수정</strong>
                                <span>{error}</span>
                            </li>
                        ))}
                        {compiled.validation.warnings.map((warning) => (
                            <li className="warning" key={warning}>
                                <strong>참고</strong>
                                <span>{warning}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default WarehouseLayoutEditor;
