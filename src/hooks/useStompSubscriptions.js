import { useEffect, useRef, useState } from "react";

import { createStompClient } from "../api/socket";

/**
 * STOMP 구독 훅.
 *
 * @param {Object} subscriptions  { "토픽경로": (payload) => void }
 * @param {boolean} enabled       false면 연결하지 않음
 *
 * 사용 예)
 *   const { connected } = useStompSubscriptions({
 *       "/topic/tasks": (task) => console.log(task),
 *   });
 */
function useStompSubscriptions(subscriptions, enabled = true) {
    const [connected, setConnected] = useState(false);

    // 콜백이 매 렌더마다 새로 만들어져도 재연결되지 않도록 ref에 보관
    const handlersRef = useRef(subscriptions);
    handlersRef.current = subscriptions;

    const topics = Object.keys(subscriptions ?? {});
    const topicKey = topics.join("|");

    useEffect(() => {
        if (!enabled || topics.length === 0) {
            return;
        }

        let subscriptionList = [];

        const client = createStompClient({
            onConnect: (stompClient) => {
                setConnected(true);

                subscriptionList = Object.keys(handlersRef.current).map(
                    (topic) =>
                        stompClient.subscribe(topic, (message) => {
                            const handler = handlersRef.current[topic];

                            if (!handler) {
                                return;
                            }

                            try {
                                handler(JSON.parse(message.body));
                            } catch (error) {
                                console.error(
                                    `[STOMP] ${topic} 메시지 처리 실패:`,
                                    error
                                );
                            }
                        })
                );
            },

            onDisconnect: () => {
                setConnected(false);
            },
        });

        client.activate();

        return () => {
            subscriptionList.forEach((subscription) => {
                try {
                    subscription.unsubscribe();
                } catch {
                }
            });
            client.deactivate();
            setConnected(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topicKey, enabled]);

    return { connected };
}

export default useStompSubscriptions;
