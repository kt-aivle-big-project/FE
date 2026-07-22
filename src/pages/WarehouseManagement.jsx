import { useState } from "react";
import "../styles/warehouseManagement.css";

const warehouses = [
    {
        warehouse_id: 1,
        name: "창고 A",
        zone_id: "지역 ID",
        status: "운영 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: 0,
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "대전 물류센터 창고 A",
        utilization: 0,
        workingRobots: 0,
        storageUsage: 0,
        todayTasks: 0,
    },
    {
        warehouse_id: 2,
        name: "창고 B",
        zone_id: "지역 ID",
        status: "운영 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: 0,
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "대전 물류센터 창고 B",
        utilization: 0,
        workingRobots: 0,
        storageUsage: 0,
        todayTasks: 0,
    },
    {
        warehouse_id: 3,
        name: "창고 C",
        zone_id: "지역 ID",
        status: "점검 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: 0,
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "대전 물류센터 창고 C",
        utilization: 0,
        workingRobots: 0,
        storageUsage: 0,
        todayTasks: 0,
    },
    {
        warehouse_id: 4,
        name: "창고 D",
        zone_id: "지역 ID",
        status: "비활성",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: 0,
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "대전 물류센터 창고 D",
        utilization: 0,
        workingRobots: 0,
        storageUsage: 0,
        todayTasks: 0,
    },
    {
        warehouse_id: 5,
        name: "창고 E",
        zone_id: "지역 ID",
        status: "운영 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: 0,
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "대전 물류센터 창고 E",
        utilization: 0,
        workingRobots: 0,
        storageUsage: 0,
        todayTasks: 0,
    },
];


function WarehouseManagement() {

    const [selectedWarehouse, setSelectedWarehouse] = useState(warehouses[0]);

    return (
        <div className="warehouse-management">
            <div className="management-header">
                <h1>창고 관리</h1>
            </div>
            {/* 왼쪽 창고 목록 */}
            <aside className="warehouse-list-panel">
                <div className="warehouse-list-header">
                    <h2>창고 목록</h2>

                    <button type="button" className="warehouse-button">
                        + 새 창고
                    </button>
                </div>

                <div className="warehouse-list">
                    {warehouses.map((warehouse) => (
                        <button
                            type="button"
                            key={warehouse.id}
                            className={`warehouse-list-item ${selectedWarehouse.id === warehouse.id
                                ? "active"
                                : ""
                                }`}
                            onClick={() => setSelectedWarehouse(warehouse)}
                        >
                            <div className="warehouse-list-info">
                                <strong>{warehouse.name}</strong>
                                <span>{warehouse.zone_id}</span>
                            </div>

                            <span
                                className={`warehouse-status ${warehouse.status
                                    .replaceAll(" ", "-")
                                    .toLowerCase()}`}
                            >
                                {warehouse.status}
                            </span>
                        </button>
                    ))}
                </div>
            </aside>

            {/* 오른쪽 상세 영역 */}
            <section className="warehouse-detail">
                <div className="warehouse-detail-header">
                    <div className="warehouse-title-group">
                        <h1>{selectedWarehouse.name}</h1>
                        <span className="detail-status">
                            {selectedWarehouse.status}
                        </span>
                    </div>

                    <div className="warehouse-action-buttons">
                        <button type="button">
                            수정
                        </button>

                        <button
                            type="button"
                            className="delete-button"
                        >
                            삭제
                        </button>
                    </div>
                </div>

                <div className="warehouse-detail-content">

                    {/* 창고 이미지 / 미리보기 */}
                    <div className="warehouse-preview">
                        <div className="warehouse-preview-placeholder">
                            창고 미리보기
                        </div>
                    </div>

                    {/* 상세 정보 */}
                    <div className="warehouse-info">
                        <div className="warehouse-info-row">
                            <span>위치</span>
                            <strong>{selectedWarehouse.location}</strong>
                        </div>

                        <div className="warehouse-info-row">
                            <span>크기</span>
                            <strong>
                                {selectedWarehouse.width}m*
                                {selectedWarehouse.height}m
                            </strong>
                        </div>

                        <div className="warehouse-info-row">
                            <span>로봇 수</span>
                            <strong>
                                {selectedWarehouse.robotCount}대
                            </strong>
                        </div>

                        <div className="warehouse-info-row">
                            <span>선반 수</span>
                            <strong>
                                {selectedWarehouse.shelfCount}개
                            </strong>
                        </div>

                        <div className="warehouse-info-row">
                            <span>생성일</span>
                            <strong>{selectedWarehouse.createdAt}</strong>
                        </div>

                        <div className="warehouse-info-row">
                            <span>최근 업데이트</span>
                            <strong>{selectedWarehouse.updatedAt}</strong>
                        </div>

                        <div className="warehouse-info-row">
                            <span>설명</span>
                            <strong>{selectedWarehouse.description}</strong>
                        </div>
                    </div>
                </div>

                {/* KPI */}
                <div className="warehouse-metrics">

                    <div className="warehouse-metric-card">
                        <span>가동률</span>
                        <strong>{selectedWarehouse.utilization}%</strong>
                    </div>

                    <div className="warehouse-metric-card">
                        <span>작업 중인 로봇</span>
                        <strong>
                            {selectedWarehouse.workingRobots}대
                        </strong>
                    </div>

                    <div className="warehouse-metric-card">
                        <span>보관 용량 사용률</span>
                        <strong>
                            {selectedWarehouse.storageUsage}%
                        </strong>
                    </div>

                    <div className="warehouse-metric-card">
                        <span>오늘 작업 수</span>
                        <strong>
                            {selectedWarehouse.todayTasks}건
                        </strong>
                    </div>

                </div>

            </section>

        </div>
    );
}

export default WarehouseManagement;