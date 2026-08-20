function WarehouseBoxLayer({
    waitingInboundGroups,
    transferBoxes,
    convertX,
    convertY,
}) {
    return (
        <>
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
