// Theme — role -> appearance. Same geometry, different looks by swapping one object.
// Strictly separate from LayoutStyle: nothing here may change coordinates.

import type { Role } from "./scene.js";

export type StrokeSpec = {
  color: string;
  weight: number;
  dash?: number[];
  cap?: "butt" | "round" | "square";
};

export type FontSpec = {
  family: string;
  size: number; // px
  style?: "normal" | "italic";
  weight?: number;
};

export type Override = Partial<StrokeSpec> & { opacity?: number };

export type EmphasisState = "hover" | "active" | "muted";

export interface Theme {
  stroke(role: Role): StrokeSpec;
  font(role: Role): FontSpec;
  emphasis(role: Role, state: EmphasisState): Override;
}

// Geometric style — feeds layout(), changes coordinates. Kept apart from Theme on purpose.
export type LayoutStyle = {
  em: number; // base unit driving spacing
  slantAngle: number; // theta, radians from horizontal
  dividerGap: number; // min horizontal gap at a divider
  fullDividerRise: number; // how far the full vertical crosses above/below the baseline
  halfDividerRise: number; // verb|object half-divider height (sits on baseline)
  leanLeftAngle: number; // angle of the lean-left complement divider
  minSlantSpacing: number; // min x-distance between two slants under one head
  pad: number;
};

export const defaultLayoutStyle: LayoutStyle = {
  em: 16,
  slantAngle: Math.PI / 3, // 60deg
  dividerGap: 18,
  fullDividerRise: 14,
  halfDividerRise: 12,
  leanLeftAngle: Math.PI / 3,
  minSlantSpacing: 14,
  pad: 8,
};
