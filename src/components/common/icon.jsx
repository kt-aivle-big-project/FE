export function UserIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
    );
}

export function EmailIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2"
            />
            <path d="M4 7l8 6 8-6" />
        </svg>
    );
}

export function LockIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
                x="4"
                y="10"
                width="16"
                height="11"
                rx="2"
            />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

export function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z"
            />
            <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.89 6.62-2.4l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.6A10 10 0 0 0 12 22Z"
            />
            <path
                fill="#FBBC05"
                d="M6.4 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.92v-2.6H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.52l3.34-2.6Z"
            />
            <path
                fill="#EA4335"
                d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.6c.8-2.36 3-4.12 5.6-4.12Z"
            />
        </svg>
    );
}

export function PasswordToggleIcon({ visible }) {
    if (visible) {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
                <circle cx="12" cy="12" r="2.5" />
            </svg>
        );
    }
    
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
            <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9 5 9 5a15.4 15.4 0 0 1-2.1 2.6" />
            <path d="M6.6 6.6C4.4 8 3 10 3 10s3.5 5 9 5c1.1 0 2.1-.2 3-.5" />
        </svg>
    );

}