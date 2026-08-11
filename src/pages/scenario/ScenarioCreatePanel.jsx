import { useEffect, useState } from "react";
import { isGuestSession } from "../../api/auth";
import "../../styles/scenario/ScenarioCreatePanel.css";

// 생성 또는 수정 모드의 초기 입력값을 만든다.
const createInitialFormData = (initialScenario) => ({
    warehouseId:
        initialScenario?.warehouseId == null
            ? ""
            : String(initialScenario.warehouseId),
    scenarioName: initialScenario?.scenarioName ?? "",
    description: initialScenario?.description ?? "",
    initialBattery: initialScenario?.initialBattery ?? 100,
    chargingThreshold: initialScenario?.chargingThreshold ?? 20,
});


function ScenarioCreatePanel({
    mode = "create",
    initialScenario = null,
    warehouses = [],
    onClose,
    onSubmit,
}) {
    const isEditMode = mode === "edit";
    const guest = isGuestSession();
    const personalWarehouses = warehouses.filter(
        (warehouse) => !warehouse.shared
    );
    const requiresLoginForWarehouse =
        !isEditMode && guest && personalWarehouses.length === 0;
    const warehouseOptions = isEditMode && initialScenario
        ? [
            {
                id: initialScenario.warehouseId,
                name: initialScenario.warehouseName,
            },
        ]
        : personalWarehouses;

    const [formData, setFormData] = useState(() =>
        createInitialFormData(initialScenario)
    );
    const [errors, setErrors] = useState({});


    // ESC 키로 열려 있는 생성/수정 패널을 닫는다.
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);


    // 일반 입력값을 변경한다.
    const handleInputChange = (event) => {
        const { name, value } = event.target;

        setFormData((previousData) => ({
            ...previousData,
            [name]: value,
        }));

        setErrors((previousErrors) => ({
            ...previousErrors,
            [name]: "",
        }));
    };

    // 숫자 입력값을 변경한다.
    const handleNumberChange = (event) => {
        const { name, value } = event.target;

        setFormData((previousData) => ({
            ...previousData,
            [name]: value === "" ? "" : Number(value),
        }));

        setErrors((previousErrors) => ({
            ...previousErrors,
            [name]: "",
        }));
    };

    // 필수 입력값과 배터리 범위를 검증한다.
    const validateForm = () => {
        const nextErrors = {};

        if (!isEditMode && !formData.warehouseId) {
            nextErrors.warehouseId = "창고를 선택해주세요.";
        }

        if (!formData.scenarioName.trim()) {
            nextErrors.scenarioName = "시나리오명을 입력해주세요.";
        }


        if (
            formData.initialBattery === "" ||
            formData.initialBattery < 0 ||
            formData.initialBattery > 100
        ) {
            nextErrors.initialBattery =
                "초기 배터리는 0~100 사이로 입력해주세요.";
        }

        if (
            formData.chargingThreshold === "" ||
            formData.chargingThreshold < 0 ||
            formData.chargingThreshold > 100
        ) {
            nextErrors.chargingThreshold =
                "충전 기준은 0~100 사이로 입력해주세요.";
        }

        if (
            Number(formData.chargingThreshold) >=
            Number(formData.initialBattery)
        ) {
            nextErrors.chargingThreshold =
                "충전 기준은 초기 배터리보다 작아야 합니다.";
        }

        setErrors(nextErrors);

        return Object.keys(nextErrors).length === 0;
    };

    // 검증된 시나리오 정보를 부모 컴포넌트로 전달한다.
    const handleSubmit = (event) => {
        event.preventDefault();

        if (!validateForm()) {
            return;
        }


        const submittedData = {
            scenarioName: formData.scenarioName.trim(),
            description: formData.description.trim(),
            initialBattery: Number(formData.initialBattery),
            chargingThreshold: Number(formData.chargingThreshold),
        };

        if (!isEditMode) {
            submittedData.warehouseId = Number(formData.warehouseId);
        }

        onSubmit(submittedData);
    };

    return (
        <form
            className="scenario-create-panel"
            onSubmit={handleSubmit}
            aria-labelledby="scenario-create-title"
        >
            {/* 패널 상단 */}
                <header className="scenario-create-panel-header">
                    <div>
                        <h2 id="scenario-create-title">
                            {isEditMode
                                ? "시나리오 수정"
                                : "새 시나리오 추가"}
                        </h2>

                        <p>
                            {isEditMode
                                ? "선택한 시나리오의 기본 조건을 수정합니다."
                                : "시뮬레이션에 사용할 기본 조건을 설정합니다."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="scenario-create-close-button"
                        onClick={onClose}
                        aria-label="패널 닫기"
                    >
                        ×
                    </button>
                </header>

                {/* 패널 입력 영역 */}
                <div className="scenario-create-panel-body">
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading scenario-create-section-heading-simple">
                            <div>
                                <h3>기본 정보</h3>
                                <p>
                                    시나리오의 기본 정보를 설정합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-info-grid">
                            <label className="scenario-create-field">
                                <span>
                                    창고
                                    <em>*</em>
                                </span>

                                <div
                                    className={`scenario-create-warehouse-select ${
                                        requiresLoginForWarehouse
                                            ? "has-login-tooltip"
                                            : ""
                                    }`}
                                    data-tooltip={
                                        requiresLoginForWarehouse
                                            ? "로그인 후 이용할 수 있습니다."
                                            : undefined
                                    }
                                    tabIndex={
                                        requiresLoginForWarehouse ? 0 : undefined
                                    }
                                    aria-label={
                                        requiresLoginForWarehouse
                                            ? "창고 선택: 로그인 후 이용할 수 있습니다."
                                            : undefined
                                    }
                                >
                                    <span aria-hidden="true">▣</span>

                                    <select
                                        name="warehouseId"
                                        value={formData.warehouseId}
                                        onChange={handleInputChange}
                                        disabled={
                                            isEditMode ||
                                            personalWarehouses.length === 0
                                        }
                                        className={
                                            errors.warehouseId ? "is-error" : ""
                                        }
                                    >
                                        <option value="">
                                            창고를 선택해주세요.
                                        </option>

                                        {warehouseOptions.map((warehouse) => (
                                            <option
                                                key={warehouse.id}
                                                value={String(warehouse.id)}
                                            >
                                                {warehouse.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {!isEditMode && personalWarehouses.length === 0 && (
                                    <small className="scenario-create-help">
                                        {guest
                                            ? "로그인 후 개인 창고를 선택할 수 있습니다."
                                            : "먼저 개인 창고를 생성해주세요."}
                                    </small>
                                )}

                                {errors.warehouseId && (
                                    <small className="scenario-create-error">
                                        {errors.warehouseId}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field">
                                <span>
                                    시나리오명
                                    <em>*</em>
                                </span>

                                <input
                                    type="text"
                                    name="scenarioName"
                                    value={formData.scenarioName}
                                    placeholder="시나리오명을 입력해주세요."
                                    onChange={handleInputChange}
                                    autoFocus
                                    className={
                                        errors.scenarioName ? "is-error" : ""
                                    }
                                />

                                {errors.scenarioName && (
                                    <small className="scenario-create-error">
                                        {errors.scenarioName}
                                    </small>
                                )}
                            </label>


                            <label className="scenario-create-field scenario-create-description-field scenario-create-full-field">
                                <span>설명</span>

                                <textarea
                                    name="description"
                                    value={formData.description}
                                    placeholder="시나리오의 목적이나 조건을 간단히 입력해주세요."
                                    onChange={handleInputChange}
                                    rows={4}
                                />
                            </label>
                        </div>
                    </section>

                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading scenario-create-section-heading-simple">
                            <div>
                                <h3>배터리 설정</h3>
                                <p>
                                    시뮬레이션 시작 배터리와 충전 전환 기준을 설정합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-battery-grid">
                            <label className="scenario-create-field scenario-create-setting-card">
                                <span>
                                    초기 배터리
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-suffix-input">
                                    <input
                                        type="number"
                                        name="initialBattery"
                                        value={formData.initialBattery}
                                        min="0"
                                        max="100"
                                        onChange={handleNumberChange}
                                        className={
                                            errors.initialBattery
                                                ? "is-error"
                                                : ""
                                        }
                                    />

                                    <span>%</span>
                                </div>

                                <small className="scenario-create-help">
                                    모든 로봇이 이 값으로 시뮬레이션을 시작합니다.
                                </small>

                                {errors.initialBattery && (
                                    <small className="scenario-create-error">
                                        {errors.initialBattery}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field scenario-create-setting-card">
                                <span>
                                    배터리 충전 기준
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-suffix-input">
                                    <input
                                        type="number"
                                        name="chargingThreshold"
                                        value={formData.chargingThreshold}
                                        min="0"
                                        max="100"
                                        onChange={handleNumberChange}
                                        className={
                                            errors.chargingThreshold
                                                ? "is-error"
                                                : ""
                                        }
                                    />

                                    <span>%</span>
                                </div>

                                <small className="scenario-create-help">
                                    이 값 이하가 되면 충전 작업으로 전환합니다.
                                </small>

                                {errors.chargingThreshold && (
                                    <small className="scenario-create-error">
                                        {errors.chargingThreshold}
                                    </small>
                                )}
                            </label>
                        </div>
                    </section>
                </div>

                {/* 패널 하단 */}
                <footer className="scenario-create-panel-footer">
                    <span className="scenario-create-required-note">
                        <em>*</em>
                        필수 입력 항목
                    </span>

                    <div className="scenario-create-footer-actions">
                        <button
                            type="button"
                            className="scenario-create-cancel-button"
                            onClick={onClose}
                        >
                            취소
                        </button>

                        <button
                            type="submit"
                            className="scenario-create-submit-button"
                        >
                            {isEditMode ? "수정 저장" : "저장"}
                        </button>
                    </div>
                </footer>
        </form>
    );
}

export default ScenarioCreatePanel;
