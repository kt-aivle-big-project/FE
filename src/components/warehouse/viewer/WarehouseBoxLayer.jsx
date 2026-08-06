/**
 * 입고 대기 BOX와 시설 인계 중인 BOX를 렌더링한다.
 * 위치와 상품 정보는 부모에서 계산된 화면용 데이터를 그대로 사용한다.
 */
function WarehouseBoxLayer({
    waitingInboundGroups,
    transferBoxes,
    convertX,
    convertY,
}) {
    return (
        <>
            {/* AMR이 아직 수령하지 않은 입고 BOX를 포트별로 최대 3개까지 표시한다. */}
            <g className="warehouse-inbound-waiting-boxes">
                {[...waitingInboundGroups.values()].map(({ portNode, entries }) => {
                    const visibleEntries = entries.slice(0, 3);

                    return (
                        <g
                            key={`waiting-${portNode.id}`}
                            transform={`translate(${convertX(portNode.x) + 22}, ${convertY(portNode.y)})`}
                        >
                            {visibleEntries.map((entry, index) => (
                                <g
                                    key={entry.key}
                                    className="warehouse-waiting-box"
                                    transform={`translate(${index * 5}, ${-index * 4})`}
                                >
                                    <rect
                                        x="-8"
                                        y="-6"
                                        width="16"
                                        height="12"
                                        rx="2"
                                        style={{ fill: entry.color }}
                                    />
                                    <path d="M -8 -1 H 8 M 0 -6 V 6" />
                                    <title>
                                        {`${entry.product?.productName ?? entry.command?.productName ?? "입고 상품"} / ${entry.product?.productCode ?? entry.command?.productCode ?? entry.itemId} / 입고 대기`}
                                    </title>
                                </g>
                            ))}

                            {entries.length > 3 && (
                                <g className="warehouse-waiting-count" transform="translate(14, -14)">
                                    <circle r="8" />
                                    <text y="3" textAnchor="middle">{entries.length}</text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </g>

            {/* 시설과 로봇 사이에서 이동 중인 BOX를 계산된 좌표에 표시한다. */}
            <g className="warehouse-box-transfers">
                {transferBoxes.map((box) => (
                    <g
                        key={box.id}
                        className={`warehouse-box-transfer transfer-${box.direction}`}
                        transform={`translate(${box.x}, ${box.y})`}
                    >
                        <rect
                            x="-10"
                            y="-7"
                            width="20"
                            height="14"
                            rx="2"
                            style={{ fill: box.color }}
                        />
                        <path d="M -10 -2 H 10 M 0 -7 V 7" />
                        <title>
                            {`${box.product?.productName ?? "BOX"} / ${box.direction === "inbound" ? "입고" : "출고"} / ${box.facilityNodeId} / ${Math.round(box.progress * 100)}%`}
                        </title>
                    </g>
                ))}
            </g>
        </>
    );
}

export default WarehouseBoxLayer;
