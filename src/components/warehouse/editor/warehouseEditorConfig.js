import { LAYOUT_OBJECT_DEFINITIONS } from "../../../utils/warehouseLayoutBuilder";

export const GRID_SIZE = 1;
export const EXISTING_MAP_GRID_SIZE = 0.05;
export const EXISTING_MAP_MAJOR_GRID_SIZE = 0.25;
export const MAX_HISTORY = 30;
export const DELETE_HOLD_MS = 3000;
export const PALETTE_DRAG_THRESHOLD_PX = 5;
export const MIN_VIEWPORT_RATIO = 0.25;
export const ZOOM_IN_FACTOR = 0.86;
export const ZOOM_OUT_FACTOR = 1.16;
export const MIN_FACILITY_COUNT = 1;
export const MAX_FACILITY_COUNT = 30;
export const MAX_FACILITY_STEP = 10;
export const DEFAULT_LAYOUT_TITLE = "사용자 설계 창고";

export const DELETE_GUIDE_MESSAGE = "삭제할 노드나 엣지를 3초 동안 누르세요.";
export const SAFE_DELETE_GUIDE_MESSAGE = "안전을 위해 삭제할 노드나 엣지를 3초 동안 누르세요.";

export const FACILITY_GROUP_KINDS = new Set(["inbound", "outbound", "charging"]);
export const FACILITY_GROUP_ORDER = { inbound: 0, outbound: 1, charging: 2 };

export const REQUIRED_FACILITY_KINDS = [
    ["rack", "3층 선반"],
    ["inbound", "입고 설비"],
    ["outbound", "출고 설비"],
    ["charging", "충전 설비"],
];

export const TOOL_GUIDE_MESSAGES = {
    AISLE: "연결할 첫 번째 노드를 선택하세요.",
    DELETE: DELETE_GUIDE_MESSAGE,
};

export const COMPACT_OBJECT_SIZES = {
    rack: { width: 0.48, height: 0.38 },
    inbound: { width: 0.32, height: 0.28 },
    outbound: { width: 0.32, height: 0.28 },
    charging: { width: 0.32, height: 0.32 },
    route: { width: 0, height: 0 },
};

export const PALETTE_GROUPS = [
    {
        title: "시설물",
        tools: ["rack", "inbound", "outbound", "charging"],
    },
    {
        title: "경로망",
        tools: ["AISLE", "route"],
    },
];

export const TOOL_META = {
    SELECT: {
        label: "선택·이동",
        symbol: "↖",
        description: "배치된 객체를 선택하고 이동합니다.",
    },
    AISLE: {
        label: "엣지 연결",
        symbol: "╱",
        description: "서로 다른 노드 두 개를 차례로 선택해 연결합니다.",
    },
    rack: {
        label: "3층 선반",
        symbol: "▤",
        description: LAYOUT_OBJECT_DEFINITIONS.rack.description,
    },
    inbound: {
        label: "입고지",
        symbol: "⇥",
        description: LAYOUT_OBJECT_DEFINITIONS.inbound.description,
    },
    outbound: {
        label: "출고지",
        symbol: "⇢",
        description: LAYOUT_OBJECT_DEFINITIONS.outbound.description,
    },
    charging: {
        label: "충전소",
        symbol: "▲",
        description: LAYOUT_OBJECT_DEFINITIONS.charging.description,
    },
    route: {
        label: "경로 노드",
        symbol: "◇",
        description: LAYOUT_OBJECT_DEFINITIONS.route.description,
    },
};
