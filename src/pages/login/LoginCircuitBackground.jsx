function LoginCircuitBackground() {
    return (
        <div className="login-bg" aria-hidden="true">
            <div className="login-bg-simulation">
                <svg
                    viewBox="0 0 760 520"
                    preserveAspectRatio="xMidYMid meet"
                    width="100%"
                    height="100%"
                >
                    <defs>
                        <filter id="loginRunnerGlow" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="7" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <path id="loginActiveRoute" d="M90 100V260H410V420H710" />
                    </defs>

                    <g className="login-bg-network">
                        <path d="M90 48V472M250 48V472M410 48V472M570 48V472M710 48V472" />
                        <path d="M42 100H730M42 260H730M42 420H730" />
                    </g>

                    <g className="login-bg-nodes">
                        <circle cx="90" cy="100" r="7" />
                        <circle cx="250" cy="100" r="6" />
                        <circle cx="410" cy="100" r="6" />
                        <circle cx="570" cy="100" r="6" />
                        <circle cx="710" cy="100" r="6" />
                        <circle cx="90" cy="260" r="6" />
                        <circle cx="250" cy="260" r="6" />
                        <circle cx="410" cy="260" r="7" />
                        <circle cx="570" cy="260" r="6" />
                        <circle cx="710" cy="260" r="6" />
                        <circle cx="90" cy="420" r="6" />
                        <circle cx="250" cy="420" r="6" />
                        <circle cx="410" cy="420" r="6" />
                        <circle cx="570" cy="420" r="6" />
                        <circle cx="710" cy="420" r="7" />
                    </g>

                    <use className="login-bg-route-base" href="#loginActiveRoute" />
                    <use className="login-bg-trace" href="#loginActiveRoute" />

                    <g className="login-bg-runner" filter="url(#loginRunnerGlow)">
                        <circle className="login-bg-runner-ring" r="15" />
                        <circle className="login-bg-runner-core" r="8" />
                        <animateMotion dur="6s" repeatCount="indefinite">
                            <mpath href="#loginActiveRoute" />
                        </animateMotion>
                    </g>

                    <circle className="login-bg-destination" cx="710" cy="420" r="12" />
                </svg>
            </div>
        </div>
    );
}

export default LoginCircuitBackground;
