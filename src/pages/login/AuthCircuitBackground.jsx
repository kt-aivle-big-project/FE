function AuthCircuitBackground() {
    return (
        <div className="auth-bg" aria-hidden="true">
            <div className="auth-bg-simulation">
                <svg
                    viewBox="0 0 760 520"
                    preserveAspectRatio="xMidYMid meet"
                    width="100%"
                    height="100%"
                >
                    <defs>
                        <filter id="authRunnerGlow" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="7" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <path id="authActiveRoute" d="M90 100V260H410V420H710" />
                    </defs>

                    <g className="auth-bg-network">
                        <path d="M90 48V472M250 48V472M410 48V472M570 48V472M710 48V472" />
                        <path d="M42 100H730M42 260H730M42 420H730" />
                    </g>

                    <g className="auth-bg-nodes">
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

                    <use className="auth-bg-route-base" href="#authActiveRoute" />
                    <use className="auth-bg-trace" href="#authActiveRoute" />

                    <g className="auth-bg-runner" filter="url(#authRunnerGlow)">
                        <circle className="auth-bg-runner-ring" r="15" />
                        <circle className="auth-bg-runner-core" r="8" />
                        <animateMotion dur="6s" repeatCount="indefinite">
                            <mpath href="#authActiveRoute" />
                        </animateMotion>
                    </g>

                    <circle className="auth-bg-destination" cx="710" cy="420" r="12" />
                </svg>
            </div>
        </div>
    );
}

export default AuthCircuitBackground;
