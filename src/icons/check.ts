// Check path derived from Lucide Icons (MIT License): https://lucide.dev/icons/check
function createCheckOverlay(backgroundImage: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" fill="none">
        <image href="${backgroundImage}" width="144" height="144"/>
        <g transform="translate(28.8 28.8) scale(3.6)">
            <path d="M20 6 9 17l-5-5" stroke="#000000" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20 6 9 17l-5-5" stroke="#ffffff" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function showCheck(
    actionInstance: { setImage(image?: string): Promise<void> },
    backgroundImage: string,
    restore: () => Promise<void>
): Promise<void> {
    await actionInstance.setImage(createCheckOverlay(backgroundImage));
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    await restore();
}
