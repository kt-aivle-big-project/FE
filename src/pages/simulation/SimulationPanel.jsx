import { useState } from "react";
import "../../styles/simulation/SimulationPanel.css";

function SimulationPanel({
    inboundSettings,
    setInboundSettings,
    outboundSettings,
    setOutboundSettings,
    products = [],
    inboundRatioTotal,
    naturalCommand,
    setNaturalCommand,
    handleNaturalCommand,
}) {

    /// 입고 품목 추가용 임시 State

    const [newProductCode, setNewProductCode,] = useState("");
    const [newProductRatio, setNewProductRatio,] = useState("");

    // 입고 설정
    const handleInboundChange = (field, value) => {
        setInboundSettings((prev) => ({
            ...prev,
            [field]: value,
        })
        );
    };

    // 품목명 가져오기
    const getProductName = (productCode) => {
        const product = products.find((product) =>
            product.product_code ===
            productCode
        );

        return (
            product?.product_name ?? ""
        );
    };

    // 이미 등록한 품목 제외
    const availableProducts =
        products.filter((product) =>
            !inboundSettings.products.some(
                (inboundProduct) =>
                    inboundProduct.product_code ===
                    product.product_code
            )
        );

    // 입고 품목 추가
    const handleAddInboundProduct = () => {
        if (!newProductCode) {
            alert("추가할 품목을 선택해주세요.");
            return;
        }

        const ratio = Number(newProductRatio);

        if (!ratio || ratio <= 0) {
            alert("품목 비율을 입력해주세요.");
            return;
        }

        if (inboundRatioTotal + ratio > 100) {
            alert("품목 구성 비율의 합계는 100%를 초과할 수 없습니다.");
            return;
        }

        setInboundSettings((prev) => ({
            ...prev,
            products: [...prev.products,
            {
                product_code: newProductCode,
                ratio: ratio,
            },
            ],
        })
        );

        setNewProductCode("");
        setNewProductRatio("");
    };

    // 입고 품목 삭제
    const handleDeleteInboundProduct = (productCode) => {
        setInboundSettings((prev) => ({
            ...prev,
            products:
                prev.products.filter((product) =>
                    product.product_code !==
                    productCode
                ),
        })
        );
    };

    // 입고 품목 비율 수정
    const handleInboundRatioChange = (productCode, value) => {
        const ratio = Math.max(0, Math.min(100, Number(value)));

        setInboundSettings((prev) => ({
            ...prev,
            products:
                prev.products.map((product) =>
                    product.product_code ===
                        productCode
                        ? {
                            ...product,
                            ratio: ratio,
                        }
                        : product
                ),
        })
        );
    };

    // 출고 설정
    const handleOutboundChange = (field, value) => {
        setOutboundSettings((prev) => ({
            ...prev,
            [field]: value,
        })
        );
    };

    return (
        <aside className="simulation-panel">
            {/* 입고 설정 */}
            <section className="simulation-setting-panel">
                <h2 className="simulation-setting-title">
                    입고 설정
                </h2>

                <div className="simulation-setting-row">
                    <label>입고 예정 건수</label>

                    <div className="simulation-input-unit">
                        <input
                            type="number"
                            min="0"
                            value={
                                inboundSettings.inbound_count
                            }
                            onChange={(e) =>
                                handleInboundChange(
                                    "inbound_count",
                                    Number(e.target.value)
                                )
                            }
                        />

                        <span>건</span>
                    </div>
                </div>

                <div className="simulation-setting-row">
                    <label>총 입고 예정량</label>

                    <div className="simulation-input-unit">
                        <input
                            type="number"
                            min="0"
                            value={
                                inboundSettings.total_quantity
                            }
                            onChange={(e) =>
                                handleInboundChange(
                                    "total_quantity",
                                    Number(e.target.value)
                                )
                            }
                        />

                        <span>BOX</span>
                    </div>
                </div>

                <div className="simulation-setting-row">
                    <label>입고 발생 패턴</label>

                    <select
                        value={
                            inboundSettings.arrival_pattern
                        }
                        onChange={(e) =>
                            handleInboundChange(
                                "arrival_pattern",
                                e.target.value
                            )
                        }
                    >
                        <option value="UNIFORM">균등</option>
                        <option value="RANDOM">랜덤</option>
                        <option value="PEAK">집중</option>
                    </select>
                </div>

                {/* 품목 구성 */}
                <div className="inbound-product-section">
                    <div className="inbound-product-header">
                        <h3>품목 구성</h3>

                        <span
                            className={inboundRatioTotal === 100
                                ? "inbound-ratio-valid"
                                : "inbound-ratio-invalid"
                            }
                        >
                            합계{" "}{inboundRatioTotal}%
                        </span>
                    </div>

                    {/* 추가된 품목 */}
                    <div className="inbound-product-list">
                        {inboundSettings.products.map((product) => (
                            <div
                                className="inbound-product-row"
                                key={product.product_code}
                            >
                                <div className="inbound-product-info">
                                    <strong>{product.product_code}</strong>
                                    <span>{getProductName(product.product_code)}</span>
                                </div>

                                <div className="inbound-product-control">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={product.ratio}
                                        onChange={(e) =>
                                            handleInboundRatioChange(
                                                product.product_code,
                                                e.target.value
                                            )
                                        }
                                    />
                                    <span>%</span>

                                    <button
                                        type="button"
                                        onClick={() => handleDeleteInboundProduct(product.product_code)}
                                    >
                                        삭제
                                    </button>
                                </div>
                            </div>
                        )
                        )}
                    </div>

                    {/* 품목 추가 */}
                    {availableProducts.length > 0 && (
                        <div className="inbound-product-add">
                            <select
                                value={newProductCode}
                                onChange={(e) => setNewProductCode(e.target.value)}
                            >
                                <option value="">품목 선택</option>

                                {availableProducts.map((product) => (
                                    <option
                                        key={product.product_code}
                                        value={product.product_code}
                                    >
                                        {product.product_code}{" "}
                                        {product.product_name}
                                    </option>
                                )
                                )}
                            </select>

                            <div className="inbound-add-ratio">
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    placeholder="비율"
                                    value={newProductRatio}
                                    onChange={(e) => setNewProductRatio(e.target.value)}
                                />
                                <span>%</span>
                            </div>

                            <button
                                type="button"
                                onClick={handleAddInboundProduct}
                            >
                                추가
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* 출고 설정 */}
            <section className="simulation-setting-panel">
                <h2 className="simulation-setting-title">
                    출고 설정
                </h2>

                <div className="simulation-setting-row">
                    <label>출고 주문 건수</label>

                    <div className="simulation-input-unit">
                        <input
                            type="number"
                            min="0"
                            value={outboundSettings.order_count}
                            onChange={(e) =>
                                handleOutboundChange(
                                    "order_count",
                                    Number(e.target.value)
                                )
                            }
                        />
                        <span>건</span>
                    </div>
                </div>

                <div className="simulation-setting-row">
                    <label>총 출고 예정량</label>

                    <div className="simulation-input-unit">
                        <input
                            type="number"
                            min="0"
                            value={outboundSettings.total_quantity}
                            onChange={(e) =>
                                handleOutboundChange(
                                    "total_quantity",
                                    Number(e.target.value)
                                )
                            }
                        />

                        <span>BOX</span>
                    </div>
                </div>

                <div className="simulation-setting-row">
                    <label>주문 발생 패턴</label>

                    <select
                        value={outboundSettings.arrival_pattern}
                        onChange={(e) =>
                            handleOutboundChange(
                                "arrival_pattern",
                                e.target.value
                            )
                        }
                    >
                        <option value="UNIFORM">균등</option>
                        <option value="RANDOM">랜덤</option>
                        <option value="PEAK">집중</option>
                    </select>
                </div>

                <div className="simulation-setting-row">
                    <label>출고 처리기한</label>

                    <div className="simulation-input-unit">
                        <input
                            type="number"
                            min="0"
                            value={outboundSettings.processing_deadline_minutes}
                            onChange={(e) =>
                                handleOutboundChange(
                                    "processing_deadline_minutes",
                                    Number(e.target.value)
                                )
                            }
                        />
                        <span>분</span>
                    </div>
                </div>

                <div className="simulation-setting-row">
                    <label>부분 출고</label>

                    <select
                        value={outboundSettings.allow_partial_shipment
                            ? "true"
                            : "false"
                        }
                        onChange={(e) =>
                            handleOutboundChange(
                                "allow_partial_shipment",
                                e.target.value === "true"
                            )
                        }
                    >
                        <option value="true">허용</option>
                        <option value="false">허용 안 함</option>
                    </select>
                </div>
            </section>

            {/* 자연어 명령 */}
            <section className="simulation-setting-panel">
                <h2 className="simulation-setting-title">
                    명령 입력
                </h2>

                <div className="natural-command-content">
                    <textarea
                        id="natural-command"
                        value={naturalCommand}
                        onChange={(e) => setNaturalCommand(e.target.value)}
                        placeholder="예: A 상품 출고 작업을 우선 처리해줘"
                    />

                    <div className="natural-command-actions">
                        <button
                            type="button"
                            onClick={handleNaturalCommand}
                            disabled={!naturalCommand.trim()}
                        >
                            명령 실행
                        </button>
                    </div>
                </div>
            </section>
        </aside>
    );
}

export default SimulationPanel;