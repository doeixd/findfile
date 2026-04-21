/**
 * Comprehensive theme token system for findfile.
 *
 * Three layers:
 * 1. Primitives — raw colors, spacing values
 * 2. Semantic — what the color/spacing is FOR
 * 3. Component — component-specific overrides
 *
 * Every field is optional; missing values fall back through the hierarchy:
 *   component → semantic → primitive → hardcoded default
 */

export interface PrimitiveTokens {
  /** Base spacing unit in cells (default: 1) */
  spacingUnit?: number

  /** Color palette */
  colors?: {
    /** Deepest background (app root) */
    bg?: string
    /** Primary text */
    fg?: string
    /** Muted/secondary text */
    fgMuted?: string
    /** Dimmed text (hints, placeholders) */
    fgDim?: string
    /** Inverted: text on accent bg */
    fgOnAccent?: string

    /** Primary accent (active elements, mode indicator) */
    accent?: string
    /** Accent background (selected items) */
    accentBg?: string
    /** Accent border/focus ring */
    accentBorder?: string

    /** Success state */
    success?: string
    /** Warning state */
    warning?: string
    /** Error state */
    error?: string
    /** Info state */
    info?: string

    /** Default border color */
    border?: string
    /** Border when element is focused */
    borderFocused?: string
    /** Border when element is active/selected */
    borderActive?: string

    /** Panel/section background (slightly lifted from bg) */
    surface?: string
    /** Elevated background (popups, dropdowns) */
    surfaceElevated?: string

    /** Match highlight foreground */
    matchFg?: string
    /** Match highlight background */
    matchBg?: string

    /** Marked/selected item indicator */
    markedFg?: string
    /** Scrollbar thumb */
    scrollbarThumb?: string
    /** Scrollbar track */
    scrollbarTrack?: string
  }
}

export interface SemanticTokens {
  /** App-level chrome */
  app?: {
    bg?: string
    fg?: string
  }

  /** Query input area */
  input?: {
    bg?: string
    fg?: string
    placeholderFg?: string
    border?: string
    borderFocused?: string
    borderStyle?: "single" | "double" | "rounded" | "heavy"
    padding?: number
    height?: number
  }

  /** Results list */
  results?: {
    bg?: string
    fg?: string
    fgPath?: string
    fgLine?: string
    fgPreview?: string

    /** Selected row */
    selectedBg?: string
    selectedFg?: string
    selectedFgPath?: string

    /** Hovered row */
    hoverBg?: string

    /** Marked row */
    markedFg?: string
    markedIndicator?: string

    /** Match highlighting */
    matchFg?: string
    matchBg?: string

    /** Border */
    border?: string
    borderStyle?: "single" | "double" | "rounded" | "heavy"
    titleFg?: string

    padding?: number
  }

  /** Preview pane */
  preview?: {
    bg?: string
    fg?: string
    fgPath?: string
    border?: string
    borderStyle?: "single" | "double" | "rounded" | "heavy"
    titleFg?: string
    padding?: number
  }

  /** Status bar */
  status?: {
    bg?: string
    fg?: string
    fgMode?: string
    fgKey?: string
    fgCount?: string
    height?: number
  }

  /** Scrollbar */
  scrollbar?: {
    thumb?: string
    track?: string
    width?: number
    /** Height of the horizontal scrollbar track (default: 1) */
    horizontalHeight?: number
  }
}

export interface ComponentTokens {
  /** QueryInput overrides */
  queryInput?: Partial<SemanticTokens["input"]>
  /** ResultsList overrides */
  resultsList?: Partial<SemanticTokens["results"]>
  /** PreviewPane overrides */
  previewPane?: Partial<SemanticTokens["preview"]>
  /** StatusBar overrides */
  statusBar?: Partial<SemanticTokens["status"]>
}

export interface FindfileTheme {
  /** Theme name (for reference) */
  name?: string
  primitives?: PrimitiveTokens
  semantic?: SemanticTokens
  components?: ComponentTokens
}

/* ------------------------------------------------------------------ */
/*  Merge helpers                                                     */
/* ------------------------------------------------------------------ */

const mergeObjects = <T>(base: T, over: Partial<T> | undefined): T => {
  if (!over) return base
  const result = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = mergeObjects(result[key] as Record<string, unknown>, value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
  }
  return result as T
}

/** Deep-merges a partial theme into a base theme */
export const mergeTheme = (base: FindfileTheme, over: Partial<FindfileTheme>): FindfileTheme => ({
  name: over.name ?? base.name,
  primitives: mergeObjects(base.primitives, over.primitives),
  semantic: mergeObjects(base.semantic, over.semantic),
  components: mergeObjects(base.components, over.components),
})

/** Resolves a component token by walking: component → semantic → primitives */
export const resolveToken = <T>(
  theme: FindfileTheme,
  component: keyof ComponentTokens,
  semanticKey: keyof SemanticTokens,
  tokenKey: string,
): T | undefined => {
  // 1. Check component override
  const comp = theme.components?.[component]
  if (comp && tokenKey in comp) {
    const val = (comp as Record<string, unknown>)[tokenKey]
    if (val !== undefined) return val as T
  }

  // 2. Check semantic token
  const semantic = theme.semantic?.[semanticKey]
  if (semantic && tokenKey in semantic) {
    const val = (semantic as Record<string, unknown>)[tokenKey]
    if (val !== undefined) return val as T
  }

  // 3. Check primitives color palette
  if (theme.primitives?.colors && tokenKey in theme.primitives.colors) {
    const val = (theme.primitives.colors as Record<string, unknown>)[tokenKey]
    if (val !== undefined) return val as T
  }

  return undefined
}

/** Helper to get a color with fallback chain */
export const resolveColor = (
  theme: FindfileTheme,
  component: keyof ComponentTokens,
  semanticKey: keyof SemanticTokens,
  tokenKey: string,
  fallback: string,
): string => resolveToken(theme, component, semanticKey, tokenKey) ?? fallback

/** Helper to get a spacing value with fallback */
export const resolveSpacing = (
  theme: FindfileTheme,
  component: keyof ComponentTokens,
  semanticKey: keyof SemanticTokens,
  tokenKey: string,
  fallback: number,
): number => resolveToken(theme, component, semanticKey, tokenKey) ?? fallback

/** Helper to get a border style with fallback */
export const resolveBorderStyle = (
  theme: FindfileTheme,
  component: keyof ComponentTokens,
  semanticKey: keyof SemanticTokens,
  tokenKey: string,
  fallback: "single" | "double" | "rounded" | "heavy",
): "single" | "double" | "rounded" | "heavy" =>
  resolveToken(theme, component, semanticKey, tokenKey) ?? fallback
