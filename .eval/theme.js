// Theme — role -> appearance. Same geometry, different looks by swapping one object.
// Strictly separate from LayoutStyle: nothing here may change coordinates.
// A minimal, clean-minimal Theme — proves the role->appearance seam. Phase 4 adds variants.
export const defaultTheme = {
    stroke(role) {
        switch (role) {
            case "baseline":
            case "rail":
                return { color: "#2b2b2b", weight: 1.8, cap: "round" };
            case "divider.full":
            case "divider.half":
            case "divider.lean":
                return { color: "#2b2b2b", weight: 1.4, cap: "round" };
            case "slant":
                return { color: "#3a3a3a", weight: 1.2, cap: "round" };
            case "connector.dotted":
                return { color: "#6a6a6a", weight: 1.1, dash: [3, 3], cap: "butt" };
            default:
                return { color: "#2b2b2b", weight: 1.2 };
        }
    },
    font(_role) {
        return { family: "Tinos, Georgia, 'Times New Roman', serif", size: 16 }; // pinned: matches test metrics
    },
    emphasis(_role, state) {
        if (state === "muted")
            return { opacity: 0.35 };
        if (state === "hover")
            return { color: "#1769aa" };
        return { color: "#0b3d91" };
    },
};
// A second, visually distinct Theme over IDENTICAL geometry — proves the role->appearance
// seam and the LayoutStyle/RenderStyle split (this changes appearance, never coordinates).
export const blueprintTheme = {
    stroke(role) {
        switch (role) {
            case "baseline":
            case "rail":
                return { color: "#cfe8ff", weight: 2, cap: "round" };
            case "slant":
                return { color: "#9ecbff", weight: 1.3, cap: "round" };
            case "connector.dotted":
                return { color: "#7fb0e8", weight: 1.1, dash: [2, 4], cap: "butt" };
            case "fork":
                return { color: "#9ecbff", weight: 1.3, cap: "round" };
            default:
                return { color: "#dbeeff", weight: 1.5, cap: "round" };
        }
    },
    font(_role) {
        return { family: "ui-monospace, 'SF Mono', Menlo, monospace", size: 15 };
    },
    emphasis(_role, state) {
        if (state === "muted")
            return { opacity: 0.4 };
        return { color: "#ffd36b" };
    },
};
export const defaultLayoutStyle = {
    em: 16,
    slantAngle: Math.PI / 3, // 60deg
    dividerGap: 18,
    fullDividerRise: 14,
    halfDividerRise: 12,
    leanLeftAngle: Math.PI / 3,
    minSlantSpacing: 14,
    pad: 8,
};
