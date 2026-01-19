import { css } from 'lit';

export const styles = css`
    :host {
        display: block;
        width: 100%;

        /* SVG color variables for inline use */
        --svg-gray-700: var(--spectrum-gray-700);
        --svg-gray-500: var(--spectrum-gray-500);
        --svg-gray-800: var(--spectrum-gray-800);
        --svg-gray-50: var(--spectrum-gray-50);
        --svg-positive-900: var(--spectrum-positive-color-900);
        --svg-positive-1000: var(--spectrum-positive-color-1000);
        --svg-gray-900: var(--spectrum-gray-900);
        --svg-negative-900: var(--spectrum-negative-color-900);
        --svg-informative-900: var(--spectrum-informative-color-900);
    }
    
    .tablet-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    @keyframes string-pluck {
        0% {
            stroke: var(--spectrum-positive-color-900);
            stroke-width: 3;
            opacity: 1;
        }
        100% {
            stroke: var(--spectrum-gray-700);
            stroke-width: 1;
            opacity: 0.5;
        }
    }

    .string-plucked {
        animation: string-pluck 0.5s ease-out forwards;
    }

    .tilt-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }

    .tablet-svg,
    .tilt-svg {
        cursor: crosshair;
        display: block;
        max-width: 100%;
        height: auto;
    }

    .tablet-body {
        fill: var(--spectrum-gray-200);
        stroke: var(--spectrum-gray-800);
        stroke-width: 2;
    }

    .tablet-surface {
        fill: var(--spectrum-gray-100);
        stroke: var(--spectrum-gray-900);
        stroke-width: 1;
    }

    .button-rect {
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .button-rect:hover {
        filter: brightness(1.2);
    }

    .tablet-button text {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
    }

    .tablet-label {
        font-size: 13px;
        font-weight: 600;
        fill: var(--spectrum-gray-50);
    }

    .axis-label {
        font-size: 10px;
        fill: var(--spectrum-gray-500);
    }

    .no-mappings {
        padding: 40px;
        text-align: center;
        color: var(--spectrum-gray-600);
    }
    
    .no-mappings p {
        margin: 0;
        font-size: 14px;
    }
`;