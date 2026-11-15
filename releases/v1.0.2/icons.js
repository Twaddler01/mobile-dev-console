const paths = {
    move: `
        <path d="M12 2v20"/>
        <path d="m8 6 4-4 4 4"/>
        <path d="m8 18 4 4 4-4"/>
        <path d="M2 12h20"/>
        <path d="m6 8-4 4 4 4"/>
        <path d="m18 8 4 4-4 4"/>
    `,
    "maximize-2": `
        <polyline points="15 3 21 3 21 9"/>
        <polyline points="9 21 3 21 3 15"/>
        <line x1="21" y1="3" x2="14" y2="10"/>
        <line x1="3" y1="21" x2="10" y2="14"/>
    `,
    "minimize-2": `
        <polyline points="4 14 10 14 10 20"/>
        <polyline points="20 10 14 10 14 4"/>
        <line x1="14" y1="10" x2="21" y2="3"/>
        <line x1="3" y1="21" x2="10" y2="14"/>
    `,
    "eye-off": `
        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5 10 8a13.8 13.8 0 0 1-3 4.4"/>
        <path d="M6.6 6.6A14.2 14.2 0 0 0 2 12c1 3 4.5 8 10 8a10.5 10.5 0 0 0 5.1-1.3"/>
        <path d="m3 3 18 18"/>
        <path d="M10 10a2.8 2.8 0 0 0 4 4"/>
    `,
    eye: `
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
        <circle cx="12" cy="12" r="3"/>
    `,
    copy: `
        <rect x="8" y="8" width="13" height="13" rx="2"/>
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
    `,
    "trash-2": `
        <path d="M3 6h18"/>
        <path d="M8 6V4h8v2"/>
        <path d="m19 6-1 14H6L5 6"/>
        <path d="M10 11v5M14 11v5"/>
    `,
    "rotate-cw": `
        <path d="M20 7v5h-5"/>
        <path d="M20 12a8 8 0 1 0 2 5"/>
    `
};

export function icon(name) {
    const content = paths[name];

    if (!content) {
        throw new Error(`Unknown console icon: ${name}`);
    }

    return `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
        >${content}</svg>
    `;
}
