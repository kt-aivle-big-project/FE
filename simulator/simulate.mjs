/**
 * LARO 다중 로봇 시뮬레이터 (데모용)
 *
 * 백엔드에 로봇 자동 이동 엔진이 없어서, 그 역할을 대신하는 외부 스크립트입니다.
 * 작업을 여러 개 만들고 로봇들에게 나눠준 뒤,
 * 각 로봇을 경로를 따라 동시에 이동시키며 상태를 백엔드로 계속 전송합니다.
 *
 * 실행:
 *   node simulator/simulate.mjs
 *
 * 옵션 (환경변수):
 *   RUN_ID=3        기존 시뮬레이션 실행 ID 사용 (없으면 새로 생성)
 *   TASK_COUNT=6    생성할 작업 수 (기본 6)
 *   STEP_MS=600     한 노드 이동에 걸리는 시간(ms, 기본 600)
 */

const API = "http://localhost:8080/api";

const TASK_COUNT = Number(process.env.TASK_COUNT ?? 6);
const STEP_MS = Number(process.env.STEP_MS ?? 600);
const EXISTING_RUN_ID = process.env.RUN_ID ? Number(process.env.RUN_ID) : null;

const WAREHOUSE_ID = 1;

/* =========================================================
   HTTP 유틸
========================================================= */

async function call(method, path, body) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        throw new Error(
            `${method} ${path} → ${response.status} ${data?.code ?? ""} ${data?.message ?? text}`
        );
    }
    return data;
}

const get = (p) => call("GET", p);
const post = (p, b) => call("POST", p, b);
const patch = (p, b) => call("PATCH", p, b);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* =========================================================
   그래프 (백엔드에서 노드/엣지를 받아 BFS 최단경로)
========================================================= */

let nodesById = new Map();   // id -> { id, nodeCode, nodeType }
let nodesByCode = new Map(); // nodeCode -> id
let adjacency = new Map();   // id -> Set(id)

async function loadGraph() {
    const nodes = await get("/warehouse-nodes");
    const edges = await get("/warehouse-edges");

    for (const node of nodes) {
        if (node.warehouseId !== WAREHOUSE_ID) continue;
        nodesById.set(node.id, node);
        if (node.nodeCode) nodesByCode.set(node.nodeCode, node.id);
    }

    for (const edge of edges) {
        if (!nodesById.has(edge.fromNodeId) || !nodesById.has(edge.toNodeId)) continue;
        if (!adjacency.has(edge.fromNodeId)) adjacency.set(edge.fromNodeId, new Set());
        if (!adjacency.has(edge.toNodeId)) adjacency.set(edge.toNodeId, new Set());
        adjacency.get(edge.fromNodeId).add(edge.toNodeId);
        adjacency.get(edge.toNodeId).add(edge.fromNodeId);
    }

    console.log(`그래프 로드: 노드 ${nodesById.size}개, 엣지 ${edges.length}개`);
}

// 최단 경로 (시작 노드 제외한 이동 경로 반환)
function findPath(fromId, toId) {
    if (fromId === toId) return [];

    const queue = [[fromId]];
    const visited = new Set([fromId]);

    while (queue.length > 0) {
        const path = queue.shift();
        const last = path[path.length - 1];

        for (const next of adjacency.get(last) ?? []) {
            if (visited.has(next)) continue;
            visited.add(next);

            const nextPath = [...path, next];
            if (next === toId) return nextPath.slice(1);
            queue.push(nextPath);
        }
    }
    return null;
}

function nodesOfType(type) {
    return [...nodesById.values()].filter((n) => n.nodeType === type);
}

/* =========================================================
   시뮬레이션 준비
========================================================= */

async function prepareRun() {
    if (EXISTING_RUN_ID) {
        console.log(`기존 실행 사용: runId=${EXISTING_RUN_ID}`);
        return EXISTING_RUN_ID;
    }

    const created = await post("/simulation-runs", {
        warehouseId: WAREHOUSE_ID,
        scenarioId: 1,
        simulationSpeed: 1,
        inbound: {
            inboundCount: 3,
            totalQuantity: 60,
            arrivalPattern: "RANDOM",
            products: [
                { productCode: "A", ratio: 50 },
                { productCode: "B", ratio: 50 },
            ],
        },
        outbound: {
            orderCount: 3,
            totalQuantity: 30,
            arrivalPattern: "RANDOM",
            processingDeadlineMinutes: 10,
            allowPartialShipment: true,
        },
    });

    const runId = created.simulationRunId;
    await post(`/simulation-runs/${runId}/start`);

    console.log(`시뮬레이션 시작: runId=${runId}`);
    return runId;
}

/**
 * 작업 생성 + 로봇 배정.
 * INBOUND : 입고구 -> 빈 랙
 * OUTBOUND: 재고가 있는 랙 -> 출고구
 */
async function createTasks(runId, robotIds) {
    const inboundNodes = nodesOfType("INBOUND");
    const outboundNodes = nodesOfType("OUTBOUND");
    const rackNodes = nodesOfType("RACK_STORAGE");

    // 시드에서 재고가 들어간 랙 (앞에서 10개) - OUTBOUND 출발지로 사용
    const stocked = await get(`/warehouse-items?warehouseId=${WAREHOUSE_ID}`);

    const assignments = [];

    for (let i = 0; i < TASK_COUNT; i++) {
        const robotId = robotIds[i % robotIds.length];
        const isInbound = i % 2 === 0;

        let payload;

        if (isInbound) {
            const from = inboundNodes[i % inboundNodes.length];
            // 재고가 없는 뒤쪽 랙에 적재
            const to = rackNodes[(rackNodes.length - 1 - i) % rackNodes.length];

            payload = {
                warehouseId: WAREHOUSE_ID,
                startNodeId: from.id,
                endNodeId: to.id,
                itemId: (i % 5) + 1,
                taskType: "INBOUND",
                simulationRunId: runId,
                quantity: 10,
            };
        } else {
            const item = stocked[i % Math.max(stocked.length, 1)];
            if (!item) {
                console.warn("재고가 없어 OUTBOUND 작업을 건너뜁니다.");
                continue;
            }
            const to = outboundNodes[i % outboundNodes.length];

            payload = {
                warehouseId: WAREHOUSE_ID,
                startNodeId: item.nodeId,
                endNodeId: to.id,
                itemId: item.itemId,
                taskType: "OUTBOUND",
                simulationRunId: runId,
                quantity: 5,
            };
        }

        try {
            const task = await post("/tasks", payload);
            await patch(`/tasks/${task.id}/assign`, { robotId });

            assignments.push({ task, robotId });
            console.log(
                `작업 ${task.id} (${task.taskType}) → 로봇 ${robotId}` +
                ` [${nodesById.get(payload.startNodeId)?.nodeCode} → ${nodesById.get(payload.endNodeId)?.nodeCode}]`
            );
        } catch (error) {
            console.error(`작업 생성/배정 실패: ${error.message}`);
        }
    }

    return assignments;
}

/* =========================================================
   로봇 구동
========================================================= */

let clock = Date.now();

// eventTime은 항상 이전보다 나중이어야 하므로 전역 시계를 사용
function nextEventTime() {
    clock += 1000;
    return new Date(clock).toISOString().slice(0, 19);
}

async function sendState(runId, robotId, nodeId, battery, status, taskId) {
    await patch(`/simulation-runs/${runId}/robots/${robotId}/state`, {
        currentNodeId: nodeId,
        batteryLevel: Math.max(0, Math.round(battery)),
        status,
        currentTaskId: taskId,
        eventTime: nextEventTime(),
    });
}

/**
 * 로봇 한 대가 작업 하나를 처음부터 끝까지 수행한다.
 * 충전소 → 출발지 → (픽업) → 도착지 → (적재) → 완료
 */
async function runRobot(runId, robotId, task, startNodeId) {
    const label = `[로봇 ${robotId}]`;
    let battery = 100;
    const taskId = task.id;

    const isInbound = task.taskType === "INBOUND";
    const workStatus = isInbound ? "PICKING" : "PICKING";
    const finishStatus = isInbound ? "PUTAWAY" : "PUTAWAY";

    try {
        // 1) 배정
        await sendState(runId, robotId, startNodeId, battery, "ASSIGNED", taskId);
        console.log(`${label} 작업 ${taskId} 배정됨`);

        // 2) 출발지까지 이동
        const toStart = findPath(startNodeId, task.startNodeId);
        if (toStart === null) {
            console.error(`${label} 출발지까지 경로 없음`);
            return;
        }

        for (const nodeId of toStart) {
            battery -= 0.4;
            await sendState(runId, robotId, nodeId, battery, "MOVING", taskId);
            await sleep(STEP_MS);
        }

        // 3) 작업 시작 + 픽업
        await patch(`/tasks/${taskId}/start`);
        await sendState(runId, robotId, task.startNodeId, battery, workStatus, taskId);
        console.log(`${label} ${nodesById.get(task.startNodeId)?.nodeCode} 에서 픽업`);
        await sleep(STEP_MS);

        // 4) 도착지까지 이동
        const toEnd = findPath(task.startNodeId, task.endNodeId);
        if (toEnd === null) {
            console.error(`${label} 도착지까지 경로 없음`);
            return;
        }

        for (const nodeId of toEnd) {
            battery -= 0.4;
            await sendState(runId, robotId, nodeId, battery, "MOVING", taskId);
            await sleep(STEP_MS);
        }

        // 5) 적재
        await sendState(runId, robotId, task.endNodeId, battery, finishStatus, taskId);
        console.log(`${label} ${nodesById.get(task.endNodeId)?.nodeCode} 에 적재`);
        await sleep(STEP_MS);

        // 6) 작업 완료 + 대기 상태로
        await patch(`/tasks/${taskId}/complete`);
        await sendState(runId, robotId, task.endNodeId, battery, "IDLE", null);

        console.log(`${label} 작업 ${taskId} 완료 (배터리 ${Math.round(battery)}%)`);
    } catch (error) {
        console.error(`${label} 오류: ${error.message}`);
    }
}

/* =========================================================
   메인
========================================================= */

async function main() {
    console.log("=== LARO 다중 로봇 시뮬레이터 ===\n");

    await loadGraph();

    const runId = await prepareRun();

    // 참여 로봇 + 현재 위치
    const states = await get(`/simulation-runs/${runId}/robots/states`);
    const robots = states.robots ?? [];

    if (robots.length === 0) {
        console.error("참여 로봇이 없습니다. 시뮬레이션이 시작되었는지 확인하세요.");
        return;
    }

    console.log(`\n참여 로봇 ${robots.length}대\n`);

    const robotIds = robots.map((r) => r.robotId);
    const startNodeOf = new Map(robots.map((r) => [r.robotId, r.currentNodeId]));

    const assignments = await createTasks(runId, robotIds);

    if (assignments.length === 0) {
        console.error("생성된 작업이 없습니다.");
        return;
    }

    console.log(`\n--- 로봇 ${assignments.length}대 동시 구동 시작 ---\n`);

    // 모든 로봇을 동시에 움직인다
    await Promise.all(
        assignments.map(({ task, robotId }) =>
            runRobot(runId, robotId, task, startNodeOf.get(robotId))
        )
    );

    console.log("\n=== 모든 작업 완료 ===");

    const finalTasks = await get(`/simulation-runs/${runId}/tasks`);
    const done = finalTasks.filter((t) => t.status === "DONE").length;
    console.log(`완료 ${done} / 전체 ${finalTasks.length}`);
}

main().catch((error) => {
    console.error("\n실행 실패:", error.message);
    process.exit(1);
});
