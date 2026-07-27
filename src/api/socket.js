import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client/dist/sockjs";

import { WS_URL } from "./config";
import { getAccessToken } from "./auth";

/**
 * STOMP over SockJS 클라이언트 생성.
 *
 * 백엔드 설정 (WebSocketConfig)
 * - 연결 엔드포인트: /ws  (withSockJS)
 * - 브로커 prefix : /topic
 */
export const createStompClient = ({
    onConnect,
    onDisconnect,
    onError,
} = {}) => {
    const token = getAccessToken();

    const client = new Client({
        // SockJS는 순수 WebSocket이 아니므로 webSocketFactory로 넘긴다
        webSocketFactory: () => new SockJS(WS_URL),

        connectHeaders: token
            ? { Authorization: `Bearer ${token}` }
            : {},

        // 연결이 끊기면 5초 뒤 재연결
        reconnectDelay: 5000,

        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,

        onConnect: () => {
            console.log("[STOMP] 연결됨");
            onConnect?.(client);
        },

        onDisconnect: () => {
            console.log("[STOMP] 연결 종료");
            onDisconnect?.();
        },

        onStompError: (frame) => {
            console.error("[STOMP] 오류:", frame.headers?.message, frame.body);
            onError?.(frame);
        },

        onWebSocketError: (event) => {
            console.error("[STOMP] WebSocket 오류:", event);
            onError?.(event);
        },
    });

    return client;
};
