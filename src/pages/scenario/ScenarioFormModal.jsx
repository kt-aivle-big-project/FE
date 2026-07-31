import { useEffect, useState } from "react";
import {
    EMPTY_FORM,
    EVENT_TYPE_OPTIONS,
    PRIORITY_OPTIONS,
    REPLAN_EVENT_OPTIONS,
    REPLAN_METHOD_OPTIONS,
    STATUS_OPTIONS,
    TASK_TYPE_OPTIONS,
} from "./scenarioMockData";

function CheckboxGroup({
    title,
    description,
    options,
    selectedValues,
    onToggle,
    onToggleAll,
    error,
}) {
    const allSelected =
        options.length > 0 && options.every((option) => selectedValues.includes(option.value));

    return (
        <div className="scenario-checkbox-group">
            {title && <strong className="scenario-checkbox-title">{title}</strong>}
            {description && <p className="scenario-field-description">{description}</p>}

            <div className="scenario-checkbox-list">
                <label className="scenario-checkbox-item is-all">
                    <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                    <span>모두 선택</span>
                </label>

                {options.map((option) => (
                    <label key={option.value} className="scenario-checkbox-item">
                        <input
                            type="checkbox"
                            checked={selectedValues.includes(option.value)}
                            onChange={() => onToggle(option.value)}
                        />
                        <span>{option.label}</span>
                    </label>
                ))}
            </div>

            {error && <small className="scenario-error">{error}</small>}
        </div>
    );
}


function ScenarioFormModal({
    open,
    mode,
    scenario,
    warehouses,
    onClose,
    onSave,
}) {
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (!open) return;

        if (mode === "edit" && scenario) {
            setFormData({
                name: scenario.name,
                description: scenario.description,
                warehouseId: scenario.warehouseId,
                status: scenario.status,
                taskTypes: [...scenario.taskTypes],
                minimumOperationBatteryPct: scenario.minimumOperationBatteryPct,
                chargeThresholdPct: scenario.chargeThresholdPct,
                autoReplanEnabled: scenario.autoReplanEnabled,
                priorityPolicy: scenario.priorityPolicy,
                replanMethod: scenario.replanMethod,
                replanEvents: [...scenario.replanEvents],
                eventTypes: [...scenario.eventTypes],
            });
        } else {
            setFormData({
                ...EMPTY_FORM,
                taskTypes: [...EMPTY_FORM.taskTypes],
                replanEvents: [...EMPTY_FORM.replanEvents],
                eventTypes: [...EMPTY_FORM.eventTypes],
            });
        }

        setErrors({});
    }, [open, mode, scenario]);

    useEffect(() => {
        if (!open) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") onClose();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const updateField = (field, value) => {
        setFormData((previous) => ({
            ...previous,
            [field]: value,
        }));

        setErrors((previous) => ({
            ...previous,
            [field]: "",
        }));
    };

    const updatePercentField = (field, value) => {
        const numberValue = Number(value);
        const limitedValue = Number.isNaN(numberValue)
            ? 0
            : Math.min(100, Math.max(0, numberValue));

        updateField(field, limitedValue);
    };

    const toggleArrayValue = (field, value) => {
        setFormData((previous) => {
            const isSelected = previous[field].includes(value);

            return {
                ...previous,
                [field]: isSelected
                    ? previous[field].filter((item) => item !== value)
                    : [...previous[field], value],
            };
        });

        setErrors((previous) => ({
            ...previous,
            [field]: "",
        }));
    };

    const toggleAllValues = (field, options) => {
        setFormData((previous) => {
            const optionValues = options.map((option) => option.value);
            const allSelected = optionValues.every((value) =>
                previous[field].includes(value)
            );

            return {
                ...previous,
                [field]: allSelected ? [] : optionValues,
            };
        });

        setErrors((previous) => ({
            ...previous,
            [field]: "",
        }));
    };

    const validate = () => {
        const nextErrors = {};

        if (!formData.name.trim()) {
            nextErrors.name = "시나리오명을 입력해주세요.";
        }

        if (!formData.warehouseId) {
            nextErrors.warehouseId = "창고를 선택해주세요.";
        }

        if (formData.taskTypes.length === 0) {
            nextErrors.taskTypes = "작업 유형을 한 개 이상 선택해주세요.";
        }

        if (
            formData.chargeThresholdPct >=
            formData.minimumOperationBatteryPct
        ) {
            nextErrors.chargeThresholdPct =
                "충전 임계치는 작업 투입 최소 배터리보다 낮아야 합니다.";
        }

        if (
            formData.autoReplanEnabled &&
            formData.replanEvents.length === 0
        ) {
            nextErrors.replanEvents =
                "재계획 적용 이벤트를 한 개 이상 선택해주세요.";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        if (!validate()) return;

        onSave({
            ...formData,
            name: formData.name.trim(),
            description: formData.description.trim(),
        });
    };

    return (
        <div
            className="scenario-modal-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="scenario-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="scenario-modal-title"
            >
                <header className="scenario-modal-header">
                    <div>
                        <h2 id="scenario-modal-title">
                            {mode === "edit"
                                ? "시나리오 수정"
                                : "새 시나리오"}
                        </h2>
                        <p>
                            창고 운영에 사용할 작업 조건과 예외 대응 정책을
                            설정합니다.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="scenario-icon-button"
                        onClick={onClose}
                        aria-label="팝업 닫기"
                    >
                        ×
                    </button>
                </header>

                <form className="scenario-modal-form" onSubmit={handleSubmit}>
                    {/* 기본 정보 */}
                    <section className="scenario-form-section">
                        <div className="scenario-form-section-header">
                            <h3>기본 정보</h3>
                            <span>시나리오의 이름과 적용할 창고를 설정합니다.</span>
                        </div>

                        <div
                            className={`scenario-form-grid ${
                                mode === "edit"
                                    ? "is-three-column"
                                    : "is-two-column"
                            }`}
                        >
                            <label className="scenario-field">
                                <span>시나리오명 *</span>
                                <input
                                    type="text"
                                    value={formData.name}
                                    placeholder="시나리오명을 입력하세요"
                                    onChange={(event) =>
                                        updateField("name", event.target.value)
                                    }
                                />
                                {errors.name && (
                                    <small className="scenario-error">
                                        {errors.name}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-field">
                                <span>창고 선택 *</span>
                                <select
                                    value={formData.warehouseId}
                                    onChange={(event) =>
                                        updateField(
                                            "warehouseId",
                                            event.target.value
                                        )
                                    }
                                >
                                    {warehouses.map((warehouse) => (
                                        <option
                                            key={warehouse.id}
                                            value={warehouse.id}
                                        >
                                            {warehouse.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.warehouseId && (
                                    <small className="scenario-error">
                                        {errors.warehouseId}
                                    </small>
                                )}
                            </label>

                            {mode === "edit" && (
                                <label className="scenario-field">
                                    <span>상태</span>
                                    <select
                                        value={formData.status}
                                        onChange={(event) =>
                                            updateField(
                                                "status",
                                                event.target.value
                                            )
                                        }
                                    >
                                        {STATUS_OPTIONS.map((option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>

                        <label className="scenario-field">
                            <span>시나리오 설명</span>
                            <textarea
                                value={formData.description}
                                rows="3"
                                placeholder="시나리오의 목적과 운영 조건을 입력하세요"
                                onChange={(event) =>
                                    updateField(
                                        "description",
                                        event.target.value
                                    )
                                }
                            />
                        </label>
                    </section>

                    {/* 작업 유형 */}
                    <section className="scenario-form-section">
                        <div className="scenario-form-section-header">
                            <h3>작업 유형</h3>
                            <span>
                                시뮬레이션에서 사용할 작업 유형을 선택합니다.
                            </span>
                        </div>

                        <CheckboxGroup
                            options={TASK_TYPE_OPTIONS}
                            selectedValues={formData.taskTypes}
                            onToggle={(value) =>
                                toggleArrayValue("taskTypes", value)
                            }
                            onToggleAll={() =>
                                toggleAllValues(
                                    "taskTypes",
                                    TASK_TYPE_OPTIONS
                                )
                            }
                            error={errors.taskTypes}
                        />
                    </section>

                    {/* 초기 운영 조건 */}
                    <section className="scenario-form-section">
                        <div className="scenario-form-section-header">
                            <h3>초기 운영 조건</h3>
                            <span>
                                작업 투입과 충전 전환에 사용할 배터리 기준입니다.
                            </span>
                        </div>

                        <div className="scenario-form-grid is-two-column">
                            <label className="scenario-field">
                                <span>작업 투입 최소 배터리 *</span>
                                <div className="scenario-unit-input">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={
                                            formData.minimumOperationBatteryPct
                                        }
                                        onChange={(event) =>
                                            updatePercentField(
                                                "minimumOperationBatteryPct",
                                                event.target.value
                                            )
                                        }
                                    />
                                    <b>%</b>
                                </div>
                                <small className="scenario-field-description">
                                    설정값 이상인 로봇만 일반 작업 후보에
                                    포함합니다.
                                </small>
                            </label>

                            <label className="scenario-field">
                                <span>충전 임계치 *</span>
                                <div className="scenario-unit-input">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.chargeThresholdPct}
                                        onChange={(event) =>
                                            updatePercentField(
                                                "chargeThresholdPct",
                                                event.target.value
                                            )
                                        }
                                    />
                                    <b>%</b>
                                </div>
                                <small className="scenario-field-description">
                                    설정값 이하인 로봇은 충전 대상으로
                                    전환합니다.
                                </small>
                                {errors.chargeThresholdPct && (
                                    <small className="scenario-error">
                                        {errors.chargeThresholdPct}
                                    </small>
                                )}
                            </label>
                        </div>
                    </section>

                    {/* 운영 옵션 */}
                    <section className="scenario-form-section">
                        <div className="scenario-form-section-header">
                            <h3>운영 옵션</h3>
                            <span>
                                재계획과 작업 우선순위 정책을 설정합니다.
                            </span>
                        </div>

                        <div className="scenario-form-grid is-two-column">
                            <label className="scenario-field">
                                <span>자동 재계획</span>
                                <select
                                    value={
                                        formData.autoReplanEnabled
                                            ? "true"
                                            : "false"
                                    }
                                    onChange={(event) =>
                                        updateField(
                                            "autoReplanEnabled",
                                            event.target.value === "true"
                                        )
                                    }
                                >
                                    <option value="true">사용</option>
                                    <option value="false">사용 안 함</option>
                                </select>
                            </label>

                            <label className="scenario-field">
                                <span>우선순위 정책</span>
                                <select
                                    value={formData.priorityPolicy}
                                    onChange={(event) =>
                                        updateField(
                                            "priorityPolicy",
                                            event.target.value
                                        )
                                    }
                                >
                                    {PRIORITY_OPTIONS.map((option) => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {formData.autoReplanEnabled && (
                            <div className="scenario-option-panel">
                                <div className="scenario-form-grid is-two-column">
                                    <label className="scenario-field">
                                        <span>재계획 방식</span>
                                        <select
                                            value={formData.replanMethod}
                                            onChange={(event) =>
                                                updateField(
                                                    "replanMethod",
                                                    event.target.value
                                                )
                                            }
                                        >
                                            {REPLAN_METHOD_OPTIONS.map(
                                                (option) => (
                                                    <option
                                                        key={option.value}
                                                        value={option.value}
                                                    >
                                                        {option.label}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </label>
                                </div>

                                <CheckboxGroup
                                    title="재계획 적용 이벤트"
                                    description="선택한 이벤트가 발생했을 때 자동 재계획을 수행합니다."
                                    options={REPLAN_EVENT_OPTIONS}
                                    selectedValues={formData.replanEvents}
                                    onToggle={(value) =>
                                        toggleArrayValue(
                                            "replanEvents",
                                            value
                                        )
                                    }
                                    onToggleAll={() =>
                                        toggleAllValues(
                                            "replanEvents",
                                            REPLAN_EVENT_OPTIONS
                                        )
                                    }
                                    error={errors.replanEvents}
                                />
                            </div>
                        )}

                        <CheckboxGroup
                            title="이벤트 설정"
                            description="시뮬레이션 실행 화면에서 사용할 수 있는 이벤트를 선택합니다."
                            options={EVENT_TYPE_OPTIONS}
                            selectedValues={formData.eventTypes}
                            onToggle={(value) =>
                                toggleArrayValue("eventTypes", value)
                            }
                            onToggleAll={() =>
                                toggleAllValues(
                                    "eventTypes",
                                    EVENT_TYPE_OPTIONS
                                )
                            }
                        />
                    </section>

                    <footer className="scenario-modal-actions">
                        <button
                            type="button"
                            className="scenario-button is-secondary"
                            onClick={onClose}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="scenario-button is-primary"
                        >
                            저장
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
}


export default ScenarioFormModal;
